# Investigación: cómo obtener la melodía de una canción

Spec incremental §16–17. Objetivo: saber **qué hay que cantar en cada instante** (altura, inicio y duración de cada nota) sin depender de grabaciones comerciales.

## Opciones

| Fuente | Calidad | Coste | Estado en el producto |
|---|---|---|---|
| **Escritura manual** (MIDI + pulsos + sílabas en código) | Exacta | Tiempo humano | ✅ Catálogo del MVP (`core/songs/catalog.ts`) |
| **MIDI / MusicXML / UltraStar** del usuario | Exacta si el archivo es bueno | Bajo (parsers) | Pendiente (ADR-009, fase 8b) |
| **Extracción de la melodía principal, en el dispositivo** (saliencia armónica + estéreo, estilo Melodia → notas → frases) | Muy buena con voz sola; buena con la mezcla completa en estéreo (ver medición) | Nulo, offline y privado | ✅ Implementado (`core/songs/melody-extraction.ts`) |
| **Separación de voz** (Demucs v4, MIT; modelos MDX/UVR, licencias variables) + pitch tracking | Buena con la mezcla completa | Alto: modelos de 80–300 MB; segundos o minutos de GPU por canción | Pendiente: servidor o WebGPU (fase 8c) |
| **Pitch tracking neuronal** sobre la voz separada (CREPE, RMVPE, FCPE, PESTO) | Muy buena, robusta a reverberación | Medio | Opción para 8c |
| **Transcripción musical automática** polifónica (Basic Pitch de Spotify, Apache-2.0, con versión TF.js; MT3) | Notas de todos los instrumentos: hay que elegir la línea de la voz | Medio | Descartado como fuente principal |
| **Detección de la voz principal** (saliencia, Melodia) | Buena; media en mezclas densas o mono | Bajo | ✅ Es el método implementado |

## Cadena implementada (local)

**Primera versión, descartada:** se aplicaba el detector monofónico del micrófono (MPM) a la mezcla. En una canción con instrumentos acertaba el **0 %** de la melodía (medido), y por eso "no sonaba nada": se extraían pocas notas sueltas.

**Versión actual:** extracción de la melodía principal de música polifónica, estilo **Melodia** (Salamon y Gómez, 2012), en `core/songs/melody-extraction.ts`:

```
Archivo (MP3/M4A/WAV…) → decodeAudioData → 22,05 kHz en ESTÉREO + paso alto 70 Hz (OfflineAudioContext)
  → Web Worker:
     1. STFT (ventana 93 ms, salto 11,6 ms); L y R en una sola FFT compleja.
     2. Máscara de centro: |M|·m³, con m = 2·Re(L·R*)/(|L|²+|R|²). La voz principal suele ir centrada.
     3. Picos espectrales (−40 dB) con frecuencia y amplitud interpoladas.
     4. Saliencia por suma armónica (10 armónicos, α = 0,8, bins de 10 c, 90–1100 Hz)
        con penalización de suboctava (se exige apoyo de armónicos impares).
     5. Contornos: continuidad ≤ 80 c, huecos ≤ 100 ms, semillas en picos ≥ 90 % del máximo.
     6. Voz / no voz, por contorno:
        · decaimiento tras el ataque > 1/s (bajo, piano, guitarra pulsada) → fuera;
        · poco centrado en estéreo (< 0,6) → fuera;
        · armonicidad relativa al archivo (ruido) → fuera;
        · saliencia < 0,5 × referencia (percentil 75 o contornos con vibrato) → fuera;
        · el vibrato (4–8 Hz) cuenta como evidencia de voz.
     7. Octavas duplicadas y valores atípicos respecto a la altura media de la melodía (ventana de 5 s).
     8. En cada frame, el contorno más saliente (×1,5 con vibrato). Las colas débiles y los huecos
        dentro del contorno quedan sin voz, lo que separa las sílabas repetidas ("do-do").
  → notas (corrección de afinación global, cambios > 0,6 semitonos, ≥ 100 ms)
  → limpieza (notas < 120 ms fundidas con la vecina, saltos sueltos de octava fuera, huecos < 150 ms ligados)
  → líneas tipo karaoke (programación dinámica: 4–9 s, cortes en las respiraciones más largas,
    penalización por cortar en mitad de un ligado; partes instrumentales ≥ 2,5 s separan secciones)
  → tonalidad (Krumhansl–Schmuckler) y acordes del audio (ver abajo) → Song (60 pulsos por minuto: 1 pulso = 1 s)
```

### Acordes del audio (`core/songs/chord-recognition.ts`)

```
STFT 186 ms / salto 93 ms → cromagrama (80–1000 Hz, raíz de la magnitud) + cromagrama del bajo (35–160 Hz)
→ similitud con 24 plantillas de tríadas (mayores y menores) + 0,5 × energía del bajo en la fundamental
  + ventaja para los acordes de la tonalidad
→ Viterbi (penalización por cambiar de acorde) → acordes de ≥ 0,5 s, sin acorde en los silencios
```

Medido en la mezcla de prueba (Lam–Fa–Do–Sol): 100 % en estéreo y en mono, y 90 % con voz grave. El bajo resulta decisivo: sin él, Fa se confundía con Lam y Do con Mim (acordes relativos), y el acierto se quedaba en el 45 %.
### Medición (`pnpm bench:melody`)

Canción sintética con voz centrada (armónicos de vocal, vibrato y pausas entre sílabas), piano a la izquierda, guitarra arpegiada a la derecha **en el registro de la voz**, y bajo y batería al centro. Se ignoran ±50 ms en los bordes de nota.

| Caso | Método anterior: altura | Nuevo: altura | Nuevo: falsos positivos | Nuevo: notas recuperadas |
|---|---|---|---|---|
| Estéreo, voz a 0 dB | 0 % | 100 % | 1 % | 100 % |
| Estéreo, voz a −3 dB | 0 % | 96 % | 7 % | 93 % |
| Estéreo, voz a −6 dB | 0 % | 92 % | 23 % | 93 % |
| Mono, voz a 0 dB | 0 % | 98 % | 15 % | 93 % |
| Voz recta (sin vibrato) | 4 % | 100 % | 4 % | 100 % |
| Voz grave (−12) | 0 % | 100 % | 5 % | 100 % |
| Voz grave en **mono** | 0 % | **74 %** | **50 %** | **64 %** |
| Voz aguda (+7) | 0 % | 95 % | 0 % | 93 % |
| Notas rápidas | 0 % | 100 % | 2 % | 100 % |

Velocidad: unos 27 ms por segundo de audio en CPU de servidor (una canción de 4 minutos se analiza en ~7 s; en móvil, varias veces más, siempre en segundo plano).

**Límites honestos:**
- Los datos son **sintéticos**: falta medir con canciones reales con melodía de referencia (MedleyDB o similares, revisando su licencia). Los umbrales pueden necesitar ajuste.
- **Mono + voz grave** es el peor caso: sin estéreo no se puede aislar el centro, y el piano y la guitarra tocan en el mismo registro.
- Coros, dobles voces, instrumentos solistas centrados (por ejemplo, un solo de saxo) o mucha reverberación pueden confundir la extracción.
- No hay letra: cada frase se identifica por su minuto en la canción ("0:12 – 0:18"), su forma melódica y el botón ▶ para escucharla.

### Mezcla realista con instrumentos grabados (E2E `melody-real.spec.ts`)

La mezcla sintética (tonos puros) daba resultados demasiado optimistas. `web/src/dev/real-mix.ts` genera una canción con las grabaciones de la guía:
- **Cantante:** voz «uuh» con ataque desde abajo, vibrato, deriva lenta y huecos entre sílabas.
- **Banda:** piano en corcheas a la izquierda, cuerdas a la derecha, bajo centrado y batería.
- **Producción:** reverb de sala en todo.

Notas cantadas que salen con la altura correcta tras limpiar la línea:

| Caso | Antes | Ahora |
|---|---|---|
| Estéreo, voz a 0 dB | 73 % | 97 % |
| Estéreo, voz 4 dB bajo la banda | 37 % | 95 % |
| Mono | 85 % | 95 % |
| Voz grave (−12) | 78 % | 80 % |
| Mucho vibrato (±60 c) | 63 % | 95 % |
| Otras semillas aleatorias | 52–67 % | 95 % |

Cambios:
- **Realce del centro con suelo del 30 %:** con reverb, la voz real no es perfectamente centrada.
- **Decaimiento en dos tramos:** se descarta como pulsado solo lo que se sigue apagando entre 0,3 y 0,55 s; la voz ataca y se sostiene.
- **Voz superior:** penalización ×0,3 a un contorno con otro vivo más de 6 semitonos por encima.
- **Registro:** fuera lo que queda más de 13 semitonos bajo la mediana de la melodía (el bajo).

Coste en la mezcla sintética: con notas muy rápidas, la altura correcta baja del 100 % al 91 %. Una nota que coincide con un acorde de piano que se apaga puede descartarse.

Probado y descartado: **Basic Pitch** (Spotify, Apache-2.0) como saliencia. Es polifónico y sigue al acompañamiento: el 55 % de las notas salía bien, frente al 73 % del método de entonces. Además, sin WebGL tarda ~1× tiempo real.

## Siguiente paso recomendado (8c)
Separación de voz como **trabajo opcional**:
1. En servidor: cola en Postgres + GPU serverless (ADR-005/008).
2. O en el navegador con ONNX Runtime Web + WebGPU, si el modelo y el rendimiento lo permiten en móviles.

Después, la misma segmentación de `transcribe.ts`. Medir la calidad con un conjunto de canciones con melodía de referencia (por ejemplo MIR-1K o MedleyDB, revisando su licencia) antes de activarla.

## Derechos (resumen, no es asesoría legal)
- La **melodía** de una canción tiene derechos de autor igual que la letra: escribir a mano la melodía de una canción comercial para **distribuirla** en la app requiere licencia (editorial). Por eso el catálogo solo tiene contenido tradicional, de dominio público u original.
- La **importación** procesa un archivo que aporta el usuario, **en su dispositivo**, para su práctica personal y educativa. El audio no se sube, no se guarda, no se reproduce ni se comparte; solo queda la melodía derivada, en local, y el usuario puede borrarla. El usuario declara que tiene derecho a usar el audio así.
- Compartir canciones importadas entre usuarios o subirlas a un servidor queda **fuera** hasta tener una revisión legal.

## Demostraciones cantadas con IA (spec §17)
Se amplía el ADR-008: además de "texto + melodía", la entrada puede ser **frase de canción + melodía objetivo (de este modelo de datos) + características vocales del usuario**. Orden: síntesis sin IA (ya existe: la guía), luego síntesis de canto con voces con licencia, y por último conversión a la voz del usuario con consentimiento. Sigue fuera del MVP.

## Separación de voz (fase 8c): medición
Implementada en el navegador con HT-Demucs FT (voz) en ONNX. En la mezcla realista ayuda mucho cuando la banda tapa la voz (voz 8 dB por debajo: 68 % → 90 % de notas bien) y reduce las notas de más, pero pierde notas con la voz grave de prueba (73 % → 63 %). Tabla completa y conclusiones en [fase-08c](../planning/fase-08c-separacion-de-voz.md#medición).
