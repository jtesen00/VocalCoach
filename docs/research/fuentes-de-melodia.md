# Investigación: cómo obtener la melodía de una canción

Spec incremental §16–17. Objetivo: saber **qué hay que cantar en cada instante** (altura, inicio y duración de cada nota) sin depender de grabaciones comerciales.

## Opciones

| Fuente | Calidad | Coste | Estado en el producto |
|---|---|---|---|
| **Escritura manual** (MIDI + pulsos + sílabas en código) | Exacta | Tiempo humano | ✅ Catálogo del MVP (`core/songs/catalog.ts`) |
| **MIDI / MusicXML / UltraStar** del usuario | Exacta si el archivo es bueno | Bajo (parsers) | Pendiente (ADR-009, fase 8b) |
| **Transcripción desde audio, en el dispositivo** (pitch tracking con el mismo motor MPM → notas → frases) | Muy buena con voz sola o pistas de voz; aproximada con la mezcla completa | Nulo, offline y privado | ✅ Implementado (`core/songs/transcribe.ts`) |
| **Separación de voz** (Demucs v4, MIT; modelos MDX/UVR, licencias variables) + pitch tracking | Buena con la mezcla completa | Alto: modelos de 80–300 MB; segundos o minutos de GPU por canción | Pendiente: servidor o WebGPU (fase 8c) |
| **Pitch tracking neuronal** sobre la voz separada (CREPE, RMVPE, FCPE, PESTO) | Muy buena, robusta a reverberación | Medio | Opción para 8c |
| **Transcripción musical automática** polifónica (Basic Pitch de Spotify, Apache-2.0, con versión TF.js; MT3) | Notas de todos los instrumentos: hay que elegir la línea de la voz | Medio | Descartado como fuente principal |
| **Detección de la voz principal** (salience: Melodia, modelos de *main melody extraction*) | Media en mezclas densas | Medio | Alternativa a la separación |

## Cadena implementada (local)

```
Archivo de audio (MP3/M4A/WAV… lo que decodifique el navegador)
  → decodeAudioData → mono, 16 kHz, paso banda 80–2000 Hz (OfflineAudioContext)
  → Web Worker: MPM (ventana 64 ms, salto 16 ms) + PitchTracker (claridad ≥ 0,9, mediana de 5)
  → corrección de afinación global (media circular de la desviación, p. ej. 432 Hz)
  → notas: cambio > 0,6 semitonos durante ≥ 3 frames, duración ≥ 100 ms, saltos de octava sueltos corregidos
  → frases: silencios ≥ 350 ms; las de más de 8 s se parten por su mayor silencio
  → tonalidad: Krumhansl–Schmuckler ponderado por duración
  → Song (60 pulsos por minuto: 1 pulso = 1 s; sin letra: cada frase se identifica por su tiempo "0:12 – 0:18")
```

Limitaciones conocidas:
- Con instrumentos, el detector puede seguir una guitarra o un piano en las partes sin voz. Mitigación: elegir el fragmento ("desde / hasta") y preferir pistas de voz.
- No hay letra. Alinear la letra (pegarla y repartir sílabas, o reconocimiento de voz) queda para más adelante.
- No hay detección de tempo: no hace falta para practicar, porque los tiempos son reales.

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
