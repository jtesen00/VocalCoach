# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico; mientras la versión sea 0.x, cada fase es una versión menor.

## [Sin publicar]

### Añadido — Fase 9: demostraciones cantadas y multi-IA
- **Voz sintética que canta la letra** (peldaño 1 del ADR-008): síntesis por formantes en el dispositivo, sin IA ni voces de terceros. Fonemas del español, consonantes adelantadas al pulso, melismas, vibrato y voz grave o aguda.
  - «🗣 Escúchala cantada» en cada frase con letra.
  - Ajustes → «Que la guía cante la letra», para la guía de las frases y el karaoke.
- **Multi-IA:** Groq, Google Gemini y xAI Grok, con varias claves a la vez, proveedor preferido y respaldo automático si uno falla. El modelo se elige de la lista de cada proveedor. Igual en el servidor (`Coach:Groq|Gemini|Xai`, `Coach:Order`).
- **«💡 ¿Cómo la canto? (IA)»:** ideas de interpretación para cada frase a partir de la letra, la melodía y tu zona cómoda (solo texto).
- Tests: unitarios de fonemas, partitura cantada, elección de modelo y prompt; E2E de la voz sintética (afinación, volumen y vocales), del respaldo entre proveedores y de las ideas por frase; tests del API de multi-IA.

### Añadido — Fase 8c: separación de voz y edición de canciones importadas
- **«Separar la voz con IA»** al importar desde audio (opcional): HT-Demucs FT (voz, MIT) en ONNX, ejecutado **en el navegador** con ONNX Runtime Web (WebGPU o WASM) en un Web Worker. El audio sigue sin salir del dispositivo.
  - El modelo (166 MB) se descarga una vez bajo demanda, se verifica su SHA-256 y se guarda en la Cache API. Se puede borrar en Ajustes.
  - Progreso por etapas y botón «Cancelar».
  - En la mezcla realista: con la voz 8 dB bajo la banda, notas bien del 68 % al 90 %; menos notas «de más» en todos los casos.
- **Editar canciones importadas** (✏️): título, letra por frase (sílabas con guiones), octava ↑/↓, dividir, unir con la siguiente y borrar, con «Deshacer». Se conserva el progreso de las frases.
- COOP/COEP en el servidor de Vite (varios hilos para WASM) y caché en tiempo de ejecución del motor WASM.
- Tests: unitarios del troceado y del editor; E2E del editor; medición `e2e/separation-real.spec.ts` y `pnpm bench:separation` (necesitan el modelo en `web/.models/`).

### Añadido — Fase 8b: archivos de melodía y canción entera
- **Importar UltraStar (.txt), MIDI/karaoke (.mid, .kar) y MusicXML (.musicxml, .xml, .mxl):** la melodía sale exacta, con la letra sílaba a sílaba y las frases según las líneas del archivo.
- **🎤 Cantar la canción entera** con la guía de la app (con o sin melodía, y con acordes) o con la canción original puesta fuera de la app. En los dos casos:
  - letra resaltada y avance de la línea siguiente;
  - tu voz sobre la melodía;
  - puntuación por frase y resumen final;
  - auriculares obligatorios.
- **Sincronía** (Ajustes): calibración del retraso real del dispositivo con clics.
- Tests: unitarios de los tres formatos, del `.mxl`, de la línea de tiempo y de la latencia; E2E de importación y karaoke.

### Añadido — Fase 6: backend .NET
- **API en `api/`** (.NET 10):
  - monolito modular con Clean Architecture y vertical slices;
  - domain events e integration events por outbox;
  - EF Core para comandos y Dapper para consultas;
  - PostgreSQL con un esquema por módulo.
- **Módulos:**
  - Identity: cuentas, JWT y refresh tokens rotativos con detección de reutilización;
  - Practice: intentos y sincronización idempotente;
  - Progress: racha y mejores resultados, alimentado por la outbox;
  - Coach: intermediario del profe con IA, con la clave en el servidor y límite por usuario.
- **Web:**
  - cuenta opcional en Ajustes;
  - sincronización automática en ambos sentidos entre dispositivos;
  - profe con IA por el servidor al iniciar sesión.
- **Tests:**
  - 42 en .NET: unitarios, de arquitectura con NetArchTest y de integración contra PostgreSQL real;
  - E2E de la cuenta;
  - CI `api.yml`.

### Añadido — Fase 7: PWA instalable y sin internet
- **Service worker** (vite-plugin-pwa / Workbox): la app, los workers y los sonidos de la guía (≈ 3,6 MB) quedan guardados. Sin internet funciona todo menos el profe con IA.
- **Instalar la app** desde Ajustes, o con instrucciones en iPhone/iPad. Manifiesto en español e iconos (incluido *maskable*).
- **Aviso de versión nueva** con «Actualizar / Más tarde»: nunca se recarga a mitad de un ejercicio.
- **Aviso sin conexión** en la cabecera.
- **Almacenamiento persistente:** se pide al guardar el primer intento. En Progreso se indica si tus datos están protegidos.
- E2E sobre la versión compilada: manifiesto, service worker y ejercicio superado sin conexión.

### Añadido — Profe con IA (experimental, Groq)
- **Ajustes → Profe con IA:** pegas tu clave de Groq; se comprueba y se elige el mejor modelo disponible. La clave se guarda solo en tu navegador, para pruebas.
- Tras cada ejercicio, **«💬 Explícamelo (IA)»**: la IA explica el resultado con sus palabras, siguiendo el diagnóstico del profe, y puedes hacerle preguntas.
- Solo se envía un resumen en texto del intento (nunca audio). En `pnpm dev` y `vite preview`, las llamadas pasan por el servidor local para evitar el bloqueo CORS.
- Tests: unitarios del prompt y E2E con la API de Groq simulada.

### Añadido — Fase 5: progreso local
- **Historial de intentos en IndexedDB** (Dexie):
  - un registro inmutable por intento, con UUID del cliente y solo agregados;
  - se conserva al cerrar y volver a abrir la app;
  - el profe compara también con intentos de días anteriores.
- **Camino de aprendizaje de 10 días** en Practicar. Cada día tiene un objetivo y sus pasos, que combinan ejercicios y frases de canción. Se desbloquea al superar (≥ 80 %) el anterior.
- **Racha** de días seguidos, con la mejor racha.
- **Pestaña Progreso:**
  - racha, días del camino, días practicados y minutos cantando;
  - calendario de 5 semanas y media semanal;
  - mejor resultado por ejercicio y por frase;
  - borrar el progreso.
- **Estrellas de tu mejor resultado** en cada ejercicio.
- Tests:
  - unitarios de racha, resumen y camino;
  - E2E que supera el día 1, comprueba la racha y el progreso, recarga la página y borra el progreso.

### Mejorado — Guía con instrumentos grabados y extracción de MP3 mucho más precisa
- **La guía suena con grabaciones reales nota a nota**, ya no con osciladores, que sonaban "a órgano":
  - piano de cola Salamander;
  - voces «uuh»;
  - silbido;
  - flauta;
  - cuerdas.
- Una nota cada 3 semitonos (C2–C7), procesadas con `web/scripts/build-samples.py`:
  - **afinación corregida nota a nota**: el silbido y la flauta derivaban hasta 30 c y ahora quedan a < 1 c;
  - volumen igualado;
  - bucles en fase para que las notas largas se sostengan sin cortes;
  - un MP3 por instrumento: 3,1 MB en total, que se descargan al elegir el instrumento.
- **Fraseo de cantante:** las notas ligadas se funden entre sí con un breve deslizamiento, sin re-atacar. El vibrato aparece poco a poco en las notas largas y estas crecen un poco al sostenerse.
- **Mezcla de estudio** (`audio/mix.ts`):
  - melodía al frente con algo de presencia;
  - acompañamiento detrás, más bajo y sin agudos;
  - reverb de sala con predelay y cola que se oscurece;
  - compresor suave en la salida.
- Si las grabaciones no se pueden cargar, suenan los instrumentos sintetizados de antes (`audio/synth.ts`).
- Créditos y licencias de los sonidos en Ajustes y en `web/public/samples/CREDITS.md` (CC BY 3.0 / CC BY-SA 3.0).
- **Extracción de la melodía de MP3, medida con una mezcla realista** (`src/dev/real-mix.ts`):
  - **Escenario de prueba:** instrumentos grabados y cantante con ataques desde abajo, vibrato y desafinaciones; piano, bajo, cuerdas, batería y reverb.
  - **Resultado:** notas con la altura correcta, de **37–85 % a 80–97 %** según el caso. Ejemplos:
    - estéreo: 73 % → 97 %;
    - voz 4 dB bajo la banda: 37 % → 95 %;
    - mucho vibrato: 63 % → 95 %.
  - **Cambios:**
    - el realce del centro conserva un 30 % del resto, porque con reverb la voz no está perfectamente centrada;
    - un contorno que ataca fuerte solo se descarta como piano o bajo si después se sigue apagando, porque la voz se sostiene;
    - preferencia por la voz superior frente a acompañamientos más graves;
    - se descarta lo que queda más de 13 semitonos por debajo del registro de la melodía (el bajo).
  - Se probó también la red Basic Pitch (Spotify) como saliencia: empeoraba (55 % de notas bien) y tardaba casi lo que dura la canción. Se descartó.
- Tests:
  - E2E con la mezcla realista en 5 escenarios, con umbrales;
  - E2E de instrumentos ampliado: carga de grabaciones, notas y acordes exactos, desviación media < 8 c;
  - umbrales de la extracción sintética actualizados.

### Mejorado — Sonido de la guía, acordes y frases tipo karaoke
- **Instrumentos sintetizados a elegir** (Ajustes → Sonido de la guía): piano, voz «uuh», silbido, flauta y cuerdas.
  - Los que sostienen el sonido tocan **ligado** (una voz por frase que se desliza de nota a nota), con vibrato natural.
  - El piano tiene parciales con inarmonicidad de cuerda y ataque de martillo.
  - Todos pasan por reverberación de sala. Se generan en el dispositivo, sin muestras grabadas.
- **Acompañamiento con acordes** (activable): acordes de piano o colchón de cuerdas bajo la melodía, en las canciones.
  - Catálogo: acordes escritos a mano en cada frase.
  - Canciones importadas: **acordes reconocidos del propio audio** (`core/songs/chord-recognition.ts`: cromagrama + bajo + plantillas de 24 tríadas + Viterbi).
- **Acordes visibles** sobre la línea de la melodía, como en un karaoke.
- **Frases tipo karaoke en las canciones importadas:** líneas de unos 4–9 s elegidas con programación dinámica, cortando en las respiraciones más largas y nunca en mitad de un ligado. Las partes instrumentales largas separan secciones.
- **Melodía más limpia:** se funden notas cortísimas espurias, se quitan saltos sueltos de octava y se cierran los huecos breves (legato).
- Tests: reconocimiento de acordes (100 % en la mezcla estéreo de prueba), limpieza y segmentación tipo karaoke; E2E que renderiza cada instrumento y comprueba con la propia app que toca las notas y los acordes exactos.

### Corregido — Importar canciones desde MP3
- **La extracción de la melodía no funcionaba con canciones reales** (voz + instrumentos): usaba el detector monofónico del micrófono, que acertaba el 0 % en una mezcla, así que apenas sonaba la guía y las frases no tenían sentido.
- Nueva **extracción de la melodía principal de música polifónica** (`core/songs/melody-extraction.ts`, estilo Melodia):
  - aislamiento del centro estéreo y saliencia por suma armónica con penalización de suboctava;
  - contornos de altura y filtros de voz/no voz: decaimiento de instrumentos pulsados, centrado, armonicidad y vibrato;
  - corrección de octavas y separación de sílabas repetidas.
  - Medido en mezclas sintéticas: **92–100 %** de altura correcta en estéreo, frente al 0 % anterior (`pnpm bench:melody`).
- Frases más comprensibles: se unen las demasiado cortas, se descartan los fragmentos, y cada una muestra su minuto, su número de notas y su forma melódica.
- **Escuchar la melodía extraída:** ▶ en cada frase y "Escuchar toda la melodía", con botón para parar (`audioEngine.stopGuide`).
- Indicador de **calidad de la extracción** (buena, media o baja) con consejos, y aviso si el archivo es mono.
- La importación conserva el estéreo y analiza a 22,05 kHz.
- 10 tests de extracción con umbrales, benchmark comparativo y E2E con una canción completa estéreo.

### Añadido — Entrenamiento por canción (Fase 8a, adelantada)
- **Pestaña Canciones** con 4 canciones seguras: Estrellita y Martinillo (tradicionales), Oda a la alegría (melodía de dominio público con letra original) y Luz de puerto (original). La melodía está escrita como datos: notas, pulsos y sílabas.
- **Perfil vocal dinámico** (`core/profile/vocal-profile.ts`):
  - Rangos detectado, fiable y cómodo, que aprenden de cada ejercicio y frase.
  - Rendimiento por registro, errores frecuentes y saltos difíciles.
- **Tono recomendado** (`core/songs/key.ts`):
  - Elige la tonalidad (±12 semitonos) con mayor acierto esperado según tu historial de notas, estabilidad, saltos y notas largas, y aprende de cómo cantas de verdad en cada tonalidad.
  - Interfaz "Tu versión recomendada / Probar versión original"; con detalles técnicos, las tonalidades y los semitonos.
- **Análisis de rango de la canción** con avisos por sección y **dificultad para ti**: afinación, rango, notas agudas, saltos y ritmo, con estrellas.
- **Práctica por frases:**
  - Letra bajo cada nota en la línea de la melodía e **indicaciones en vivo** ("↓ Un poco bajo: sube un poco", "La melodía sube ↑ prepárate").
  - Puntuación ✓ ⚠ ✗, **problema principal**, **frase más débil** y medición de la mejora ("Antes 51 % → ahora 74 %").
- **De la frase al entrenamiento** (`core/songs/training.ts`): progresión de ejercicios en las alturas exactas de la frase y del tono elegido. Por ejemplo, para un salto: mitad → mitad → completo → sostener → frase lenta → frase normal.
- **Importar una canción desde audio** (MP3, M4A, WAV…):
  - La melodía se extrae en el dispositivo, con el mismo detector de pitch, en un Web Worker.
  - Incluye corrección de afinación global, segmentación en notas y frases, y tonalidad estimada.
  - El audio no se sube, no se guarda y no se reproduce. Antes de analizar se confirma el uso personal y educativo. Las canciones importadas se pueden borrar.
- Documentación: ADR-010, investigación de fuentes de melodía, plan de la fase 8a y ADR-008/009 actualizados.
- 42 tests nuevos (canciones, perfil y transcripción) y 3 E2E.

### Cambiado
- Los ejercicios y la medición de "Mi voz" alimentan el perfil vocal.
- La guía sonora respeta los silencios entre notas. La línea de tiempo muestra sílabas. El ejecutor de ejercicios admite una tónica fija y su propio catálogo, para los ejercicios generados.

### Añadido — Fase 4: profesor virtual
- **"Tu profe"** en el resultado de cada ejercicio: titular, qué se oyó, consejos para probar ("Prueba esto:") y hasta dos observaciones secundarias.
- **Clasificación de errores** (`core/teacher/diagnose.ts`), con prioridad: no se oyó, otra octava, no sigue la melodía, faltan notas, notas lejos, sirena (dirección, recorrido y cortes), salto corto o largo, algo bajo o alto, cae al final, inestable, casi, superado o excelente, y vibrato (informativo).
- **Lecciones como datos** (`core/teacher/content.ts`), en lenguaje acústico y sin diagnosticar el cuerpo.
- **Demostraciones sonoras "🔊 Escúchalo"**:
  - Nota correcta, la tuya y la correcta otra vez.
  - El salto correcto frente al tuyo.
  - Nota estable frente a nota que baila o que cae.
  - La melodía más lenta, la sirena completa y la misma nota en otra octava.
- **Árbol de decisión del siguiente paso:**
  - Si superas el ejercicio, propone el siguiente.
  - Al tercer fallo seguido por lo mismo, propone algo más fácil (menos exigencia o un ejercicio más sencillo).
  - Si detecta que cantas en otra octava, ofrece permitirlo.
  - Si mejoras respecto al intento anterior, lo celebra.
- **Coach en vivo en "Canta libre"** (`core/teacher/live.ts`): consejos tras 2 s por encima o por debajo, 2,5 s cerca o 3 s afinado.
- Historial de intentos por ejercicio durante la sesión.
- Silencios (`rest`) en las guías sonoras; los tipos de guía pasan a `core/exercises/guide.ts`.
- 54 tests del profesor y 5 E2E nuevos o ampliados.

### Cambiado
- La estabilidad ya no cuenta la tendencia lineal: una caída continua se diagnostica como "cae al final", no como "inestable".

### Eliminado
- `core/exercises/feedback.ts`: el profesor virtual lo sustituye.

### Cambiado
- **Interfaz sencilla por defecto:**
  - Las notas se nombran en solfeo (Do, Re, Mi…), sin octavas, cents ni Hz.
  - Mensajes en lenguaje cotidiano: "¡Afinado!", "Sube un poco", "Baja bastante".
  - La aguja va de "más grave" a "más agudo".
- **Navegación reorganizada:** Practicar (ejercicios, pantalla inicial), Canta libre (antes "Afinador"), Mi voz y Ajustes.
- **Ejercicios con nombres y descripciones cotidianas:**
  - "Mantén una nota", "Do-re-mi", "Salto pequeño", "Escalera de cinco notas", "Sirena hacia arriba"…
  - La lista muestra un dibujo de la forma de la melodía, la dificultad (●○○) y la duración.
  - La altura se ajusta con "− grave / agudo +".
- **Resultado:** de 0 a 3 estrellas, "¡Superado!" o "Casi… inténtalo otra vez", "afinado el X % del tiempo" y una etiqueta sencilla por nota.
- **Feedback sin jerga** ("quedó baja (bastante)"), con versión técnica opcional. Si dos mensajes dicen lo mismo, solo se muestra uno.
- **"Mi voz":** el resultado se explica como "tu zona cómoda abarca N notas".
- Texto de bienvenida y aviso de Bluetooth más claros.

### Añadido
- Pantalla **Ajustes**:
  - Cuánto te corregimos: Relajado, Normal o Exigente.
  - Si vale cantar en otra octava.
  - Volver a medir la voz.
  - **Mostrar detalles técnicos** (C4, cents, Hz, tabla por nota y diagnóstico), desactivado por defecto.
- `solfegeName()` y modo detallado opcional en los mensajes.
- Ramas `dev` (desarrollo) y `changes` (ajustes); `main` es la principal.

## [0.2.0] — 2026-10-05 · Fase 3: ejercicios

### Añadido
- Catálogo de 9 ejercicios originales definidos como datos: notas sostenidas, secuencia do-re-mi, intervalos (tercera mayor y quinta justa), escalas (5 notas y mayor completa) y sirenas (ascendente y de ida y vuelta).
- Transposición automática al rango vocal calibrado, con ajuste manual de la tónica (±1 semitono).
- Flujo de llamada y respuesta: guía de referencia (notas y deslizamientos), cuenta atrás con claqueta y canto con línea de tiempo.
- Evaluación pura (`core/exercises/evaluate.ts`):
  - Por nota: estado, puntuación, accuracy, mediana de cents, estabilidad, vibrato y caída al final.
  - Intervalos medidos en cents.
  - Sirenas evaluadas como trayectoria: cobertura, dirección y cortes.
  - Compensación de latencia.
- Análisis de estabilidad y detección de vibrato, que no penaliza (`core/exercises/stability.ts`).
- Feedback básico con reglas declarativas y lenguaje acústico (`core/exercises/feedback.ts`).
- Pantalla de ejercicios: lista, ejecución, línea de tiempo en canvas y resultado con tabla por nota.
- Motor de audio: `playGuide` (notas y deslizamientos), `countdown`, `now()` y `latencyS()`.
- 29 tests unitarios nuevos (incluida una integración audio sintético → detector → evaluación) y 3 E2E de ejercicios.
- Documentación: `docs/planning/` (roadmap y planes de fase), `docs/memory/` (contexto para retomar el trabajo), este changelog y `CLAUDE.md`.

### Cambiado
- `docs/PLAN.md` se mueve a `docs/planning/PLAN.md`.
- La nota de referencia del afinador usa la nueva guía (`audio/guide.ts`, que sustituye a `reference-tone.ts`).

### Corregido
- La supresión del micrófono tras la guía ya no se queda bloqueada si el temporizador se adelanta al reloj de audio.
- La supresión se reinicia al volver a activar el micrófono (cada AudioContext empieza en t = 0).

## [0.1.0] — 2026-10-05 · Fase 2: motor de pitch

### Añadido
- Plan técnico afinado y ADR-001 a ADR-009 (backend con monolito modular y Clean Architecture; importación de canciones tipo karaoke).
- Prototipo web (React + Vite + TypeScript) sin backend:
  - Detectores McLeod (MPM) y YIN con FFT, dentro de un AudioWorklet.
  - `PitchTracker`: ruido de fondo adaptativo, detección de voz con histéresis y mediana.
  - Afinador con nota, cents, Hz, confianza, aguja y trayectoria en canvas.
  - Nota objetivo con llamada y respuesta; modo de octava configurable; precisión del intento (≥ 80 %, sin los primeros 250 ms).
  - Calibración del rango vocal y aviso de micrófono Bluetooth.
  - Panel de diagnóstico: latencias, estimaciones por segundo y estado de EC/NS/AGC.
- 62 tests unitarios, 3 E2E con micrófono falso, benchmark sintético y de WAV, y CI en GitHub Actions.
