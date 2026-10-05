# Vocal Coach — Plan técnico afinado

> Revisión senior del spec original. El spec es sólido; este documento **no lo reescribe**:
> corrige supuestos débiles, rellena huecos y recorta complejidad innecesaria.
> Las decisiones formales están en [`docs/adr/`](../adr/).

---

## 1. Veredicto general

La arquitectura es **técnicamente correcta**: pitch detection local en AudioWorklet, backend fuera del bucle de audio, scoring separado del motor de audio, IA aislada y al final. Se mantiene.

Lo que cambio:

| Tema | Spec original | Ajuste |
|---|---|---|
| Fase 0 (investigación) | Investigación amplia antes de codificar | **Timebox de 1 semana.** El prototipo *es* la investigación: las preguntas difíciles (latencia real, ruido, iOS) solo se responden midiendo. |
| Estructura | `packages/` con 5 paquetes desde el día 1 | **Una sola app Vite** con carpetas `src/core` y `src/audio` sin dependencias de React (regla de lint). Se extraen a paquetes cuando exista un segundo consumidor. |
| `PitchFrame` | `cents` relativo a la nota más cercana | El motor emite **MIDI continuo (float)**. Los cents respecto al *objetivo* los calcula el scoring. Son cosas distintas (ver §4). |
| Backend | ASP.NET con capas + EF Core + Dapper | **Se mantiene y se formaliza** (decisión del equipo): monolito modular, Clean Architecture por módulo, vertical slices, domain events, EF Core para comandos y Dapper para consultas. Ver ADR-004. |
| Cola de trabajos IA | Implícita | **Tabla en PostgreSQL como cola** (`SELECT … FOR UPDATE SKIP LOCKED`). Sin Redis, sin Kafka. |
| UI en tiempo real | React con updates throttled | La trayectoria de pitch se dibuja en **Canvas con `requestAnimationFrame`**, fuera del ciclo de render de React. React solo recibe estado de baja frecuencia. |

---

## 2. Requisitos añadidos al spec (decididos)

Estos puntos faltaban en el spec original. **Están decididos** y los marcados con ✅ ya están implementados en el prototipo.

| # | Requisito | Decisión | Estado |
|---|---|---|---|
| 1 | **Rango vocal del usuario** | Calibración al empezar: nota más grave y más aguda cómodas (mediana de ~2 s sostenidos). El objetivo por defecto es el centro del rango; los ejercicios se **transponen** al rango (`transpositionToFit`). | ✅ calibración + objetivo por defecto · transposición lista para Fase 3 |
| 2 | **El micro capta la referencia** | **Llamada y respuesta**: suena la nota (1,2 s) → se ignora el micro mientras suena y 150 ms más → el usuario canta. | ✅ |
| 3 | **Errores de octava** | Configurable: *Cualquier octava vale* (por defecto para principiantes) u *Octava exacta*. | ✅ |
| 4 | **"80 % de accuracy"** | % de frames con voz dentro de la tolerancia del nivel, **sin contar los primeros 250 ms** de cada nota. Umbral de superación: 80 %. | ✅ en el afinador (intento en curso y último intento) |
| 5 | **Micro Bluetooth** | Heurística: frecuencia de muestreo de la pista ≤ 16 kHz o nombre del dispositivo → aviso visible recomendando micro del dispositivo o auriculares con cable. | ✅ |
| 6 | **"Muéstrame cómo cantar este texto"** | La funcionalidad recibe **texto + melodía** (plantilla, melodía generada o importada), nunca solo texto. | Fase 9 |
| 7 | **Importar canciones (karaoke)** | Ver §2.1. | Fase 8 |
| — | Tolerancia por nivel | Principiante ±30 c (perfecto ±15), intermedio ±20 c (±10), avanzado ±10 c (±5). A validar con grabaciones reales. | ✅ |
| — | Referencia A4 | 440 Hz por defecto; el núcleo ya acepta otra referencia. | parcial |
| — | "Día" del learning path | Se desbloquea al completar (≥ 80 %); el calendario solo afecta a la racha. | Fase 5 |

### 2.1 Importar canciones (modo karaoke)

**Objetivo:** el usuario carga una canción que quiere cantar y ve en tiempo real, sobre la línea de la melodía, si va afinado, con puntuación por frase y final.

Un MP3 por sí solo **no** contiene la melodía de la voz como dato: es una mezcla de voz e instrumentos. Para puntuar hace falta una melodía objetivo. Por eso hay tres niveles:

| Nivel | Qué carga el usuario | Cómo se obtiene la melodía | Dónde se procesa | Cuándo |
|---|---|---|---|---|
| **A. Canción + melodía** | Audio (MP3/M4A/WAV) + archivo de melodía: **UltraStar `.txt`** (formato karaoke estándar: notas, tiempos y letra), **MIDI `.mid`** o, más adelante, MusicXML | Se lee del archivo | **100 % en el dispositivo**, sin internet | Fase 8a |
| **B. Solo audio, modo libre** | Solo audio | No hay melodía: se muestra la trayectoria del usuario sobre la música, sin puntuación | Dispositivo | Fase 8a |
| **C. Solo audio, melodía automática** | Solo audio | **Separación de la voz** (modelo tipo Demucs) + detección de pitch sobre la voz separada → melodía objetivo editable; la letra puede alinearse por reconocimiento de voz | **Servidor (GPU)**, opcional y con consentimiento; se puede evaluar en el navegador con WebGPU más adelante | Fase 8b |

Reglas del modo karaoke:

- **Auriculares obligatorios.** Si la música suena por altavoz, el micro la capta y la detección se contamina (mismo problema que el punto 2, pero sin poder hacer llamada y respuesta). Se pide confirmación antes de empezar; el modo altavoz con cancelación de eco queda como experimento medido, no como promesa.
- **Sincronización:** el tiempo del usuario se corrige con la latencia de entrada y salida (`outputLatency`) y un **test de calibración** (dar palmadas o cantar sobre un clic). Ventana de tolerancia temporal ±100–150 ms por nota.
- **Octava:** detección automática de si el usuario canta una octava por debajo/encima (hombre cantando una canción de mujer y viceversa) y comparación por clase de nota o con desplazamiento de octava fijo.
- **Tonalidad:** transponer la *melodía objetivo* es trivial; transponer el *audio* (pitch shifting) se deja para más adelante.
- **Puntuación:** por nota (accuracy como en el punto 4, con ataque excluido), por frase y total. UI con barras de notas en el tiempo (estilo UltraStar), trayectoria del usuario encima y la letra de la frase actual.
- **Copyright y privacidad:** los archivos del usuario se procesan y guardan **solo en su dispositivo** (IndexedDB/OPFS), no se suben ni se comparten. La app no distribuye canciones ni letras comerciales. En el nivel C el audio se sube solo con consentimiento explícito, se procesa, se borra y el usuario declara tener derecho a usarlo; solo se conserva la melodía derivada, privada para ese usuario.

Decisión formal: ADR-009.

## 3. Stack — matrices de decisión (resumen)

### 3.1 Frontend → **React + Vite + TypeScript** (se mantiene)

| Criterio | React+Vite | Vue | Svelte | Angular |
|---|---|---|---|---|
| Web Audio / AudioWorklet / WASM | = (todos agnósticos; el motor es TS puro) | = | = | = (más fricción con el bundler) |
| Rendimiento en tiempo real | Bueno si el canvas va fuera de React | Bueno | Muy bueno | Bueno |
| Ecosistema (charts, PWA, testing, Capacitor) | **Excelente** | Muy bueno | Bueno | Bueno |
| Camino a móvil nativo (React Native) | **Sí** | No | No | No |
| Peso/complejidad | Bajo | Bajo | Muy bajo | Alto |

Por qué: lo crítico (audio) es **independiente del framework**, así que la decisión se basa en ecosistema y opciones de futuro. React gana por ecosistema y por dejar React Native como salida si la PWA falla. Svelte sería igual de válido técnicamente; Angular es excesivo para esto.

**Estado:** `useSyncExternalStore` sobre el motor de audio + `useReducer` para ejercicios. **Zustand** solo cuando aparezca estado global real (perfil, progreso) — probablemente en Fase 5. Nada de Redux.

### 3.2 Backend → **ASP.NET Core (.NET 10 LTS)** (se mantiene)

| Criterio | .NET | Node/TS | Go | Python/FastAPI |
|---|---|---|---|---|
| Rendimiento API | Muy alto | Alto | Muy alto | Medio |
| Productividad | Alta | **Muy alta (mismo lenguaje que el front)** | Media | Alta |
| Postgres / migraciones | EF Core (excelente) | Drizzle/Prisma (bueno) | Bueno | SQLAlchemy (bueno) |
| Auth | Muy maduro | Bueno | Medio | Bueno |
| Integración IA | Por HTTP a servicio aparte | Por HTTP | Por HTTP | Nativa |
| Familiaridad del equipo | **Decisiva** | | | |

Por qué: el backend gestiona usuarios, progreso, catálogo, sincronización y trabajos de IA durante años: merece una estructura sólida. .NET ofrece el mejor soporte para Clean Architecture con módulos aislados (EF Core, Identity, BackgroundService, tests de arquitectura) y el equipo lo domina. Python solo aparece en el servicio de IA (Fase 9).

**Arquitectura (ADR-004):** monolito modular · Clean Architecture por módulo (Domain / Application / Infrastructure / Presentation) · vertical slices dentro de Application · domain events dentro del módulo e integration events entre módulos mediante outbox en PostgreSQL · EF Core para comandos y Dapper para consultas. Sin microservicios ni broker de mensajes.

### 3.3 Detección de pitch → **McLeod (MPM) en TypeScript, en el AudioWorklet** (ver §4)

### 3.4 Móvil → **PWA → (si hace falta) Capacitor → (solo si se mide un bloqueo) nativo** (ver §6)

---

## 4. Motor de audio y detección de pitch

### 4.1 Comparativa

| Algoritmo | Precisión en voz | Errores de octava | CPU | Latencia | Complejidad | Veredicto |
|---|---|---|---|---|---|---|
| Zero-crossing | Mala (armónicos) | Muchos | Mínima | Mínima | Trivial | Descartado |
| Autocorrelación simple | Media | Frecuentes | Media | Ventana | Baja | Solo como baseline |
| AMDF | Media | Frecuentes | Media | Ventana | Baja | Descartado |
| **YIN** | Alta | Pocos | Media (O(N²) ingenuo, O(N log N) con FFT) | Ventana | Media | **Candidato** |
| **McLeod (MPM)** | Alta, muy buena con voz | Pocos ("clarity" útil como confianza) | Media (FFT) | Ventana | Media | **Elegido por defecto** |
| CREPE (tiny/full) | Muy alta, robusto a ruido | Muy pocos | Alta en móvil (ONNX/TF.js) | +modelo | Alta | Plan B, no MVP |
| PESTO / modelos ligeros recientes | Alta | Pocos | Baja-media | Baja | Alta (inferencia en worklet/worker) | Plan B si el DSP falla con ruido |

**Decisión:** implementar **MPM** (la "clarity" que produce es directamente la confianza que pide el spec) y **YIN** como segundo detector detrás de la misma interfaz, y **compararlos con el benchmark** (§9) en la Fase 2. Se puede partir de la librería `pitchy` (MPM en TS, MIT) para ir rápido y sustituirla si hace falta. **Sin WebAssembly**: con FFT, una ventana de 2048 muestras cada ~10 ms cuesta muy poco en JS moderno. WASM solo si el benchmark en un Android de gama media lo exige.

ML **no** en MVP: añade descarga del modelo (MBs), coste de CPU/batería en móvil y complejidad, para una mejora que en voz solista en sala normal es pequeña. Se reevalúa solo si el benchmark con ruido falla.

### 4.2 Parámetros de partida (a validar)

- **Ventana:** 2048 muestras a 48 kHz (~43 ms). Cubre ≥2 periodos de E2 (82 Hz), la voz grave masculina. Si solo hubiera voces agudas se podría bajar a 1024.
- **Hop:** 512 muestras (~10,7 ms → ~94 estimaciones/s).
- **Rango de búsqueda:** 70–1100 Hz.
- **Usar el `sampleRate` real del `AudioContext`**, nunca asumir 44,1 kHz (iOS suele dar 48 kHz).
- **Latencia algorítmica** ≈ media ventana (~21 ms) + latencia de entrada del dispositivo. Objetivo realista extremo a extremo: **50–100 ms** (desktop por debajo, móvil por encima).

### 4.3 Captura: el detalle que más se olvida

```ts
getUserMedia({ audio: {
  echoCancellation: false,
  noiseSuppression: false,   // destruye/modula la voz cantada
  autoGainControl: false,    // altera el nivel y la detección de voz
}})
```

El procesamiento por defecto del navegador está pensado para **voz hablada en videollamadas** y degrada el canto. Esto debe probarse en cada navegador: algunos Android ignoran parte de estas restricciones.

### 4.4 Flujo de datos

```
Micro → MediaStreamSource → AudioWorkletNode
          AudioWorklet: ring buffer (128 muestras/quantum)
                        cada 512 muestras: RMS + detector (MPM)
          ──postMessage({t, f0, clarity, rmsDb})──►  hilo principal
                                                     │
                       PitchTracker (TS puro): voicing, suavizado, histéresis
                                                     │
                     ┌───────────────────────────────┼─────────────────────┐
                     ▼                               ▼                     ▼
          Canvas (rAF, 60 fps)           ScoringEngine (TS puro)   React (estado lento:
          trayectoria + aguja            evalúa contra objetivo     estado del ejercicio, textos)
```

- **`postMessage`** ~94 veces/s es trivial. **No usar SharedArrayBuffer**: exige cabeceras COOP/COEP (aislamiento cross-origin) que complican hosting, analíticas y embeds, sin ganancia medible a esta tasa.
- **Sin Web Worker adicional** salvo que el benchmark muestre que el detector no cabe en el presupuesto del worklet (en ese caso: worklet → Worker → main).
- El código del detector y del tracker es **TS puro sin globals del navegador**, para ejecutarlo igual en el worklet, en tests (Vitest/Node) y en el arnés de benchmark.

### 4.5 `PitchFrame` refinado

```ts
interface PitchFrame {
  t: number;              // segundos, reloj del AudioContext (no Date.now)
  f0: number | null;      // Hz
  midi: number | null;    // CONTINUO: 60.07 = C4 +7 cents
  clarity: number;        // 0..1, confianza del detector
  levelDb: number;        // RMS en dBFS
  voiced: boolean;        // decisión tras umbrales + histéresis
}
```

`noteName` y `cents respecto a la nota más cercana` son **derivados para la UI**. El scoring calcula `centsVsTarget = (midi - targetMidi) * 100`. Ejemplo de por qué importa: objetivo C4, usuario canta C#4 −40 c → "nota más cercana: C#4 −40" pero **respecto al objetivo: +60 c, demasiado alto**.

### 4.6 Voicing (detección de voz) — simple primero

`voiced = levelDb > ruidoDeFondo + margen && clarity > umbral` con **histéresis** (umbral de entrada más alto que el de salida, y mínimo ~3 frames para cambiar de estado). El ruido de fondo se estima durante 1 s de silencio al iniciar y se actualiza lentamente. Esto resuelve "no mostrar notas aleatorias en silencio" sin VAD de ML.

Suavizado: **mediana de 3–5 frames** sobre `midi` (elimina saltos de octava puntuales sin añadir mucha latencia). La UI aplica histéresis al **nombre de nota** para que no parpadee en la frontera de ±50 c.

---

## 5. Scoring y profesor virtual

**Separación obligatoria (se mantiene):** `PitchFrame[] + Target → Evaluation`. Funciones puras, 100 % testeables sin audio.

Métricas por nota sostenida (tras descartar el ataque de ~250 ms):

- **Desviación central:** *mediana* de `centsVsTarget` (robusta a outliers, y con vibrato la mediana cae en el centro).
- **Accuracy:** % de frames con voz dentro de tolerancia.
- **Estabilidad:** desviación estándar tras restar una media móvil de ~200 ms (separa deriva lenta de temblor).
- **Vibrato:** periodicidad de 4–7 Hz con amplitud de ±20–100 c → **no penaliza**; se evalúa el centro.
- **Clasificación:** `perfect | close | too_high | too_low | unstable | no_voice` según mediana + estabilidad, con umbrales por nivel.

Sirenas: se evalúan como **trayectoria** (monotonía, cobertura del rango, continuidad sin cortes), no como notas. Secuencias e intervalos: segmentación por objetivo con ventanas de tiempo tolerantes (±150 ms) y compensación de la latencia medida del dispositivo.

**Profesor:** reglas declarativas en **JSON/TS** (`condición sobre Evaluation → mensaje + recomendación`), evaluadas por un motor de ~100 líneas. Textos en ficheros de i18n. Lenguaje siempre **acústico**, nunca fisiológico ("tu tono tiende a caer al final de la nota; intenta mantener un flujo de aire constante", no "tu diafragma no trabaja"). Sin LLM en MVP.

---

## 6. Estrategia móvil

PWA primero (se mantiene). Riesgos concretos a **medir en la Fase 2**, no suponer:

| Riesgo | Plataforma | Mitigación |
|---|---|---|
| `AudioContext` requiere gesto del usuario | Todas, sobre todo iOS | Botón "Empezar" explícito; `resume()` dentro del handler |
| El audio se para al bloquear pantalla / cambiar de app | iOS, Android | Aceptarlo; Wake Lock API durante el ejercicio; reanudar al volver |
| Switch de silencio silencia la reproducción de Web Audio | iOS | `navigator.audioSession.type = 'play-and-record'` (Safari 17+); aviso en la UI |
| Procesado de audio forzado ignorando las restricciones | Algunos Android | Detectar en el benchmark; listar dispositivos problemáticos |
| Micro Bluetooth (HFP) | Todas | Advertir (ver §2, punto 5) ✅ |
| Safari borra almacenamiento de PWAs no instaladas tras ~7 días sin uso | iOS | `navigator.storage.persist()`, incentivar instalación, sync con backend (Fase 6) |
| Latencia de entrada alta | Android gama baja | Medir; mostrar la latencia en diagnóstico; compensarla en ejercicios con timing |

**Criterio para pasar a Capacitor:** necesidad de tiendas de apps, notificaciones fiables en iOS, o audio en segundo plano. El motor (AudioWorklet en WKWebView/WebView) se reutiliza tal cual.
**Criterio para nativo/React Native:** solo si se mide latencia o calidad inaceptable en WebView que una API nativa (AAudio/AVAudioEngine) resuelva. Es improbable para este caso de uso.

---

## 7. IA de demostraciones cantadas (Fase 9)

Estado de la tecnología (2026), sin hype:

| Enfoque | Madurez | Coste | Riesgo legal/ético | Para este producto |
|---|---|---|---|---|
| TTS | Alta | Bajo | Bajo | No sirve: habla, no canta |
| **Síntesis sin IA** (piano/oscilador + guía con vocal grabada propia) | Total | Casi nulo | Nulo | **Primer paso: cubre el 80 % del valor pedagógico** |
| **SVS** (letra + melodía → canto). Ej.: DiffSinger/OpenUtau con voicebanks con licencia comercial, o proveedores comerciales | Media-alta | Medio (GPU bajo demanda o API) | Bajo-medio: **revisar la licencia de cada voz** | Segundo paso |
| **Conversión de voz** (guía → timbre del usuario). Ej.: familia RVC / Seed-VC | Media | Medio | **Alto**: suplantación, datos biométricos | Último paso, con consentimiento explícito |
| Texto → canto con la voz del usuario directamente | Inmadura y cara | Alto | Alto | No |

Recomendaciones:

1. El valor pedagógico de "muéstrame cómo cantarlo" es **escuchar la melodía correcta**, no oírla con tu propio timbre. Empezar sin IA.
2. Si se hace SVS: servicio **Python aislado** (FastAPI) en GPU serverless de pago por uso (Modal, RunPod, Replicate o similar), alimentado por la cola en Postgres. No mantener GPU encendida.
3. La voz del usuario es **dato biométrico/sensible** (RGPD art. 9 si permite identificación): consentimiento explícito y específico, borrado real (muestras + modelo derivado), sin reutilización para entrenar, y solo permitir convertir a **la propia voz verificada** del usuario.

---

## 8. Seguridad y privacidad

- **Audio del micro nunca sale del dispositivo** en Fases 1–8. No hay código que lo suba: es una garantía de arquitectura, no de configuración.
- No persistir audio ni trayectorias crudas por defecto. Lo que se guarda: agregados por intento (Postgres) y, opcionalmente, una trayectoria **reducida** (p. ej. 10 puntos/s) solo en local para la vista de "repetición del intento".
- Backend: auth con proveedor gestionado o ASP.NET Identity + cookies `HttpOnly`/`SameSite` (front y API en el mismo dominio evita tokens en JS); rate limiting nativo de ASP.NET; validación de entrada; URLs firmadas de corta duración para audio generado; cuotas por usuario para trabajos de IA.
- Grabaciones reales para el dataset de pruebas: **con consentimiento escrito**, fuera del repositorio público.

---

## 9. Testing y benchmarks

| Nivel | Qué | Herramienta |
|---|---|---|
| Unitario | nota↔frecuencia, cents, clasificación, estabilidad, vibrato, reglas del profesor | Vitest |
| Fixtures sintéticos | Señales **generadas en el propio test** (no WAVs en el repo): seno, diente de sierra con armónicos, ±10/±20 c, vibrato 5,5 Hz ±50 c, silencio, ruido blanco/rosa, tono + ruido a distintos SNR | Vitest |
| Voz real | 30–60 clips etiquetados (hombre/mujer, registros, suave/fuerte, vibrato, susurrado) + datasets abiertos con licencia compatible (p. ej. Vocadito, CC-BY; verificar licencia de cada uno) | Arnés Node que ejecuta el mismo detector |
| E2E | Flujo completo con audio falso | Playwright + Chromium `--use-file-for-fake-audio-capture` |
| Dispositivos reales | Matriz de §6 | Manual, checklist en `docs/benchmarks/` |

**Criterios de aceptación del prototipo (Fase 2)** — valores iniciales, se ajustan con datos:

| Métrica | Objetivo |
|---|---|
| Raw Pitch Accuracy (error < 50 c) en voz real limpia | ≥ 95 % |
| Error absoluto mediano en sintéticos | ≤ 3 c |
| Errores de octava en voz real | ≤ 2 % de frames con voz |
| Falsos "voiced" en silencio / ventilador / teclado | ≤ 2 % de frames |
| Latencia extremo a extremo (desktop / móvil) | ≤ 60 ms / ≤ 120 ms |
| Tiempo del detector por frame (Android gama media) | ≤ 2 ms |
| UI | 60 fps estables, sin renders de React por frame |

Medición de latencia: **prueba de bucle** (el altavoz emite un pulso con tono conocido, el micro lo detecta; diferencia en el reloj del `AudioContext` descontando `outputLatency`) + validación puntual grabando pantalla y sonido en vídeo a alta velocidad.

---

## 10. Estructura del proyecto

```
/
├─ web/                              # app Vite (implementada en Fase 2)
│  ├─ src/
│  │  ├─ core/                       # TS puro, sin React ni APIs del navegador
│  │  │  ├─ music/notes.ts           # nota ↔ frecuencia ↔ MIDI continuo
│  │  │  ├─ pitch/                   # FFT, MPM, YIN, PitchTracker (voicing, mediana), señales sintéticas
│  │  │  ├─ scoring/                 # cents vs objetivo, modos de octava, tolerancias, accuracy
│  │  │  └─ range/                   # rango vocal y transposición
│  │  ├─ audio/                      # Web Audio: engine, pitch-worklet, nota de referencia, Bluetooth
│  │  ├─ features/tuner/ range/      # pantallas (karaoke/, exercises/, progress/ en fases siguientes)
│  │  ├─ shared/                     # ajustes, UI compartida
│  │  └─ app/                        # shell, estilos (tokens claro/oscuro)
│  ├─ bench/                         # benchmark Node con el mismo código que el worklet
│  └─ e2e/                           # Playwright con micrófono falso (WAV sintético)
├─ api/                              # ASP.NET Core — Fase 6 (estructura en ADR-004)
├─ ai/                               # servicio Python — Fases 8b/9
└─ docs/  (planning/, memory/, adr/, benchmarks/, CHANGELOG.md)
```

`core/` no importa de `audio/`, `features/` ni `react`: se ejecuta igual en el worklet, en Vitest y en el benchmark.

## 11. Roadmap (1 desarrollador, estimación orientativa)

| Fase | Contenido | Estimación | Puerta de salida |
|---|---|---|---|
| 0–1 | Este plan + ADRs | **Hecho** | ADRs aceptados |
| **2. Prototipo de pitch** | Captura, MPM+YIN, voicing, afinador, calibración de rango, llamada y respuesta, aviso Bluetooth, diagnóstico, benchmark, E2E | **Implementado** — falta medir en dispositivos reales | **Criterios de §9 cumplidos en desktop + 1 Android + 1 iPhone. Si no, no se avanza.** |
| 3. Ejercicios | Nota sostenida, secuencias, intervalos, escalas, sirenas, transposición al rango, scoring, feedback básico | **Implementado** ([detalle](fase-03-ejercicios.md)) — falta validar con grabaciones | Evaluación coherente con el juicio de un profesor en ≥ 80 % de 30 intentos grabados |
| 4. Profesor | Motor de reglas, mensajes, ejemplos de audio | 1–2 semanas | |
| 5. Progreso local | IndexedDB (Dexie), learning path, rachas, estadísticas | 2 semanas | |
| 7. PWA | vite-plugin-pwa, shell offline, instalación, `storage.persist()` | 1 semana | *Se adelanta antes del backend: es barato y el producto ya es 100 % local* |
| 6. Backend | API .NET, Postgres, auth, sync de intentos | 3–4 semanas | |
| 8a. Canciones / karaoke local | Modelo de canción, importación audio + UltraStar/MIDI, modo libre, timeline, calibración de latencia, scoring por frase; catálogo propio/dominio público | 4–5 semanas | Puntuación estable entre repeticiones del mismo intento |
| 8b. Melodía automática | Separación de voz + extracción de melodía como trabajo en servidor (opcional) | 3–4 semanas | Melodía extraída utilizable sin edición en ≥ 70 % de canciones de prueba |
| 9. IA | Ver §7 | Investigación separada | |

**Sync (Fase 6) sin complicarse:** los intentos son **inmutables y append-only** con UUID generado en el cliente → `POST` idempotente, sin resolución de conflictos. Solo ajustes/perfil usan last-write-wins.

---

## 12. Infraestructura y coste

| Etapa | Infra | Coste aprox./mes |
|---|---|---|
| Fases 2–5, 7 | Hosting estático con HTTPS (Cloudflare Pages / Netlify / similar) | ~0 € |
| Fase 6 | 1 contenedor .NET + Postgres gestionado + backups | 20–60 € |
| Fases 8b y 9 | + almacenamiento de objetos (R2/S3) + GPU serverless por uso | variable, con cuota por usuario |

Sin Kubernetes, sin microservicios, sin Redis/Kafka, sin SignalR. El único servicio adicional justificado es el de IA, por el runtime (Python/GPU).

---

## 13. Riesgos principales (ordenados)

1. **Calidad del pitch en móviles reales** (procesado forzado, latencia, Bluetooth). → Fase 2 con dispositivos reales antes de nada.
2. **Ejercicios fuera del rango del usuario** → calibración de rango (§2, punto 1) ✅.
3. **El micro capta la referencia** → llamada y respuesta (§2, punto 2) ✅.
4. **Feedback injusto que frustra** (ataque, vibrato, octavas) → mediana, descarte del ataque, tolerancias por nivel, validación contra juicio humano.
5. **Contenido con copyright** → catálogo solo propio / dominio público; las canciones importadas por el usuario se quedan en su dispositivo.
6. **Karaoke por altavoz** → auriculares obligatorios en modo karaoke.
7. **Expectativas de IA** → la IA no es parte de la propuesta de valor del MVP.

## 14. Siguiente paso concreto

1. **Medir el prototipo en dispositivos reales** (desktop Chrome/Safari, Android Chrome, iPhone Safari) con la checklist de [`docs/benchmarks/`](../benchmarks/README.md).
2. Grabar el primer set de voces reales (con consentimiento) y pasar `pnpm bench -- voz.wav ref.csv`.
3. Validar la Fase 3 con 30 intentos reales evaluados también por un profesor ([fase-03-ejercicios.md](fase-03-ejercicios.md)).
4. Fase 4 (profesor virtual) implementada ([fase-04-profesor-virtual.md](fase-04-profesor-virtual.md)). Siguiente: Fase 5 (progreso local). Estado actualizado en [ROADMAP.md](ROADMAP.md).
