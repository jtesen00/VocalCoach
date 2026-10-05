# Vocal Coach — Plan técnico afinado

> Revisión senior del spec original. El spec es sólido; este documento **no lo reescribe**:
> corrige supuestos débiles, rellena huecos y recorta complejidad innecesaria.
> Las decisiones formales están en [`docs/adr/`](adr/).

---

## 1. Veredicto general

La arquitectura es **técnicamente correcta**: pitch detection local en AudioWorklet, backend fuera del bucle de audio, scoring separado del motor de audio, IA aislada y al final. Se mantiene.

Lo que cambio:

| Tema | Spec original | Ajuste |
|---|---|---|
| Fase 0 (investigación) | Investigación amplia antes de codificar | **Timebox de 1 semana.** El prototipo *es* la investigación: las preguntas difíciles (latencia real, ruido, iOS) solo se responden midiendo. |
| Estructura | `packages/` con 5 paquetes desde el día 1 | **Una sola app Vite** con carpetas `src/core` y `src/audio` sin dependencias de React (regla de lint). Se extraen a paquetes cuando exista un segundo consumidor. |
| `PitchFrame` | `cents` relativo a la nota más cercana | El motor emite **MIDI continuo (float)**. Los cents respecto al *objetivo* los calcula el scoring. Son cosas distintas (ver §4). |
| Backend | ASP.NET con capas Api/Application/Domain/Infrastructure + EF Core + Dapper | **Monolito modular** en un solo proyecto, organizado por features. Solo EF Core; Dapper únicamente si una consulta medida lo requiere. |
| Cola de trabajos IA | Implícita | **Tabla en PostgreSQL como cola** (`SELECT … FOR UPDATE SKIP LOCKED`). Sin Redis, sin Kafka. |
| UI en tiempo real | React con updates throttled | La trayectoria de pitch se dibuja en **Canvas con `requestAnimationFrame`**, fuera del ciclo de render de React. React solo recibe estado de baja frecuencia. |

---

## 2. Huecos y ambigüedades del spec (requisitos que faltan)

Estos puntos **cambian el producto** y deben resolverse antes de la Fase 3:

1. **Rango vocal del usuario.** No se menciona. Un hombre no puede cantar un ejercicio en C5 ni una mujer cómodamente en C3. Hace falta una **calibración de rango** (nota más grave/aguda cómoda) y **transponer los ejercicios** al rango del usuario. Sin esto, la tasa de fallo de principiantes será altísima por motivos que no son de afinación.
2. **Errores de octava.** ¿Cantar C3 cuando el objetivo es C4 es un error? Para principiantes debería ser configurable (modo "clase de nota" vs. "octava exacta"). Además, los detectores de pitch cometen errores de octava: hay que distinguirlos de errores del usuario.
3. **Cómo oye el usuario la nota objetivo.** El spec no dice cómo se reproduce la referencia. Si suena por altavoz mientras el micro escucha, **el detector detectará el tono de referencia, no la voz**. Opciones (elegir una para MVP):
   - **Llamada y respuesta** (recomendado para MVP): suena la referencia → silencio → el usuario canta. Funciona en cualquier dispositivo.
   - Auriculares obligatorios para ejercicios con acompañamiento simultáneo.
   - Desactivar la detección mientras suena la referencia.
4. **Definición de "accuracy" (el 80% para desbloquear).** Propuesta: *% de frames con voz dentro de la tolerancia, excluyendo los primeros ~200–300 ms de cada nota* (el ataque/"scoop" inicial es natural y no debe penalizar).
5. **"Día" del learning path.** ¿Se desbloquea por completar o por calendario? Recomendación: por completar; el calendario solo afecta a la racha.
6. **Tolerancia por nivel.** ±15 cents es exigente para principiantes. Propuesta inicial: principiante ±30, intermedio ±20, avanzado ±10. Validar con grabaciones reales.
7. **Auriculares Bluetooth.** Al usar el micro de un headset Bluetooth, el sistema cambia a perfil HFP (8–16 kHz, latencia de 150–300 ms+). Hay que **detectarlo y advertir**: recomendar micro del dispositivo o auriculares con cable.
8. **"Muéstrame cómo cantar 'Hola, ¿cómo estás?'"** — un texto sin melodía no define cómo cantarlo. La funcionalidad necesita **texto + melodía** (elegida de una plantilla o generada). Es un requisito de producto, no de IA.
9. **Referencia de afinación** (A4 = 440 Hz) — configurable, valor por defecto 440.

---

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

### 3.2 Backend → **ASP.NET Core (.NET 10 LTS)** (se mantiene, con condición)

| Criterio | .NET | Node/TS | Go | Python/FastAPI |
|---|---|---|---|---|
| Rendimiento API | Muy alto | Alto | Muy alto | Medio |
| Productividad | Alta | **Muy alta (mismo lenguaje que el front)** | Media | Alta |
| Postgres / migraciones | EF Core (excelente) | Drizzle/Prisma (bueno) | Bueno | SQLAlchemy (bueno) |
| Auth | Muy maduro | Bueno | Medio | Bueno |
| Integración IA | Por HTTP a servicio aparte | Por HTTP | Por HTTP | Nativa |
| Familiaridad del equipo | **Decisiva** | | | |

Por qué: el backend aquí es CRUD + sync + orquestación de trabajos. Cualquiera sirve. **.NET se justifica si el equipo ya lo domina** (el spec lo sugiere). Si el equipo fuera solo frontend, Node/TS compartiendo tipos con el cliente sería la opción más productiva. Python no aporta nada en el API: solo en el servicio de IA (Fase 9).

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
| Micro Bluetooth (HFP) | Todas | Advertir (ver §2.7) |
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

## 10. Estructura del proyecto (inicial)

```
/
├─ web/                         # app Vite (única app hasta Fase 6)
│  ├─ src/
│  │  ├─ core/                  # TS puro, sin React ni APIs del navegador
│  │  │  ├─ music/              # nota↔frecuencia, escalas, transposición
│  │  │  ├─ pitch/              # MPM, YIN, tracker (voicing, suavizado)
│  │  │  ├─ scoring/            # evaluaciones por tipo de ejercicio
│  │  │  └─ teacher/            # motor de reglas + reglas declarativas
│  │  ├─ audio/                 # lo que toca Web Audio: engine, worklet, reproducción de referencia
│  │  ├─ features/              # tuner/, exercises/, teacher/, progress/, settings/ …
│  │  ├─ shared/ui/             # sistema de diseño
│  │  └─ app/                   # rutas, layout, providers
│  └─ bench/                    # arnés de benchmark en Node
├─ api/                         # ASP.NET Core — aparece en Fase 6
├─ ai/                          # servicio Python — aparece en Fase 9
└─ docs/  (PLAN.md, adr/, benchmarks/)
```

Regla de lint (`eslint-plugin-boundaries` o `no-restricted-imports`): `core/` no importa de `audio/`, `features/` ni `react`.

---

## 11. Roadmap (1 desarrollador, estimación orientativa)

| Fase | Contenido | Estimación | Puerta de salida |
|---|---|---|---|
| 0–1 | Este plan + ADRs | **Hecho / 1 semana máx.** | ADRs aceptados |
| **2. Prototipo de pitch** | Captura, MPM+YIN, voicing, afinador visual, panel de diagnóstico, benchmark | 2–3 semanas | **Criterios de §9 cumplidos en desktop + 1 Android + 1 iPhone. Si no, no se avanza.** |
| 3. Ejercicios | Calibración de rango, nota sostenida, secuencias, referencia llamada/respuesta, scoring | 3 semanas | Evaluación coherente con el juicio de un profesor en ≥ 80 % de 30 intentos grabados |
| 4. Profesor | Motor de reglas, mensajes, ejemplos de audio | 1–2 semanas | |
| 5. Progreso local | IndexedDB (Dexie), learning path, rachas, estadísticas | 2 semanas | |
| 7. PWA | vite-plugin-pwa, shell offline, instalación, `storage.persist()` | 1 semana | *Se adelanta antes del backend: es barato y el producto ya es 100 % local* |
| 6. Backend | API .NET, Postgres, auth, sync de intentos | 3–4 semanas | |
| 8. Canciones | Modelo de canción, timeline, scoring por frase, contenido propio/dominio público | 4+ semanas | |
| 9. IA | Ver §7 | Investigación separada | |

**Sync (Fase 6) sin complicarse:** los intentos son **inmutables y append-only** con UUID generado en el cliente → `POST` idempotente, sin resolución de conflictos. Solo ajustes/perfil usan last-write-wins.

---

## 12. Infraestructura y coste

| Etapa | Infra | Coste aprox./mes |
|---|---|---|
| Fases 2–5, 7 | Hosting estático con HTTPS (Cloudflare Pages / Netlify / similar) | ~0 € |
| Fase 6 | 1 contenedor .NET + Postgres gestionado + backups | 20–60 € |
| Fase 9 | + almacenamiento de objetos (R2/S3) + GPU serverless por uso | variable, con cuota por usuario |

Sin Kubernetes, sin microservicios, sin Redis/Kafka, sin SignalR. El único servicio adicional justificado es el de IA, por el runtime (Python/GPU).

---

## 13. Riesgos principales (ordenados)

1. **Calidad del pitch en móviles reales** (procesado forzado, latencia, Bluetooth). → Fase 2 con dispositivos reales antes de nada.
2. **Ejercicios fuera del rango del usuario** → calibración de rango (§2.1).
3. **El micro capta la referencia** → llamada y respuesta (§2.3).
4. **Feedback injusto que frustra** (ataque, vibrato, octavas) → mediana, descarte del ataque, tolerancias por nivel, validación contra juicio humano.
5. **Contenido con copyright** → solo contenido propio / dominio público hasta tener licencias.
6. **Expectativas de IA** → la IA no es parte de la propuesta de valor del MVP.

## 14. Siguiente paso concreto

Arrancar la **Fase 2**: scaffold Vite + TS, `core/music` y `core/pitch` con tests sintéticos, AudioWorklet, afinador con panel de diagnóstico (f0, nota, cents, clarity, nivel, latencia, ms por frame) y arnés de benchmark.
