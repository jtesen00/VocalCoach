# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico; mientras la versión sea 0.x, cada fase es una versión menor.

## [Sin publicar]

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
