# Registro de decisiones

Formato: fecha · decisión · motivo · referencia. Lo más reciente arriba.

## 2026-10-07 · Fase 9
- **Demostraciones cantadas: primero una voz por formantes en el dispositivo**, no un modelo de IA. · Gratis, privada, sin conexión y sin licencias de voces; basta para enseñar dónde va cada sílaba. · ADR-008, [fase-09](../planning/fase-09-demostraciones-cantadas.md).
- **La guía cantada va desactivada por defecto** (suena a robot); se ofrece con un botón en cada frase y un ajuste.
- **Multi-IA con respaldo automático** (Groq, Gemini, Grok) en la web y en el servidor. · Petición del equipo; los planes gratuitos se agotan.
- **Modelos elegidos por patrón sobre la lista del proveedor**, no por nombre fijo. · Los catálogos rotan cada pocos meses.

## 2026-10-06 · Fase 8c
- **Separación de voz en el navegador, no en servidor:** HT-Demucs FT (voz, MIT) en ONNX con ONNX Runtime Web (WebGPU o WASM). · Regla «el audio nunca sale del dispositivo»; sin coste de GPU. · [fase-08c](../planning/fase-08c-separacion-de-voz.md), ADR-009.
- **Opcional y bajo demanda:** 166 MB de modelo, descargados solo si el usuario lo pide, de una revisión fija de Hugging Face y con SHA-256 verificado. Fuera del precaché de la PWA.
- **No se activa por defecto:** mejora mucho la voz enterrada en la banda, pero empeora la voz grave en la mezcla realista y tarda ~2–5× tiempo real sin GPU.
- **Editar canciones importadas sobre un borrador con «Deshacer»**, conservando los ids de las frases (y su progreso).

## 2026-10-05 (mediodía) · Sonido y karaoke
- **Instrumentos sintetizados en el dispositivo** (Web Audio) en lugar de muestras: sin descargas, sin derechos de terceros y offline. Los sostenidos se tocan ligados (una voz por frase). · Feedback: la guía "no tenía cuerpo".
- **Acordes:** escritos a mano en el catálogo y **reconocidos del audio** en las importaciones; se tocan y se muestran como en un karaoke.
- **Líneas tipo karaoke por programación dinámica** (4–9 s, cortes en respiraciones), no por umbral de silencio fijo. · Feedback: las frases eran fragmentos.
- **Validar el sonido con las herramientas de la app:** cada instrumento se renderiza (OfflineAudioContext) y se comprueban las notas con el detector y los acordes con el reconocedor.

## 2026-10-05 (mañana) · Importar MP3: extracción polifónica
- **El detector monofónico no sirve para canciones completas** (0 % medido): la importación usa extracción de la melodía principal estilo Melodia (saliencia armónica + estéreo + contornos). · Feedback del equipo tras probar un MP3 real.
- **Antes de ajustar, medir:** mezcla sintética reproducible con verdad conocida (`core/songs/test-mix.ts`) y métricas tipo MIREX; los umbrales se eligieron con esa medición y quedan fijados en tests.
- **Sin modelos de IA todavía**: la extracción por DSP es offline, ligera y sin descargas; la separación de voz con IA (fase 8c) queda para mezclas mono, densas o con coros.
- **La melodía extraída se puede escuchar** frase a frase y entera: sin eso el usuario no puede saber si la extracción es correcta.

## 2026-10-05 (madrugada) · Entrenamiento por canción
- **Se adelanta la Fase 8a** (canciones) por ser el diferenciador del producto. · Actualización incremental del spec. · [ADR-010](../adr/ADR-010-song-training.md)
- **Una frase es un `ExercisePlan`**: se reutilizan el motor de pitch, la evaluación, la UI y el profesor; no hay un detector distinto para canciones. · Spec §18.
- **Tono recomendado por acierto esperado, no por "que quepa"**, y lo cantado de verdad en cada tono pesa cada vez más. · Spec §6–8.
- **Zona cómoda = notas con ≥ 80 % y estables en ≥ 2 intentos distintos**; la medición inicial solo es el punto de partida. · Spec §4: nunca por una nota aislada.
- **La versión se fija al empezar a practicar.** · Si no, el aprendizaje cambiaba el tono a mitad de la práctica (bug encontrado en E2E).
- **Sin canciones comerciales en el catálogo**, ni siquiera la melodía escrita a mano: tiene derechos. · Spec §15.
- **Importar MP3 en local** (petición del equipo): se extrae la melodía en el dispositivo, uso personal y educativo confirmado por el usuario, el audio no se sube, no se guarda y no se reproduce. Se canta con el original fuera de la app (YouTube). · [investigación](../research/fuentes-de-melodia.md)
- **Datos de perfil y canciones en `localStorage`** de momento: son pequeños. Pasan a IndexedDB en la Fase 5.

## 2026-10-05 (noche) · Fase 4
- **El profesor es determinista y basado en reglas, sin LLM:** diagnóstico (taxonomía con prioridad), lecciones como datos y árbol de decisión. · Predecible, gratis, offline y testeable; un LLM no aporta para corregir afinación y no puede escuchar el audio. · [fase-04](../planning/fase-04-profesor-virtual.md)
- **Un solo problema principal por intento**, más un máximo de 2 observaciones secundarias sin redundancias. · Un alumno principiante no puede corregir cinco cosas a la vez.
- **Demostraciones con el sintetizador de la guía**, sin grabaciones: comparan "así suena / así sonó". · Sin contenido externo ni copyright, y funciona sin conexión.
- **"Algo más fácil" solo tras 3 fallos seguidos por el mismo motivo.** · Evita frustrar sin rendirse demasiado pronto.
- **La estabilidad excluye la tendencia lineal.** · Una caída continua es otro problema ("cae al final") con otro consejo.
- **Coach en vivo por duración** (2 s bajo/alto, 3 s afinado), con 0,3 s de tolerancia a frames sueltos. · Spec §18.

## 2026-10-05 (tarde)
- **Interfaz sencilla por defecto:** solfeo sin octava, sin cents ni Hz, mensajes de acción ("Sube un poco"). Lo técnico, detrás de "Mostrar detalles técnicos" en Ajustes. · Un usuario normal solo quiere aprender a cantar y mejorar.
- **El nivel se presenta como exigencia de la corrección** (Relajado, Normal, Exigente), no como nivel del usuario.
- **Flujo de ramas:** `main` = principal y estable; `dev` = desarrollo de funcionalidades; `changes` = ajustes y correcciones. Se trabaja en `dev` o `changes` y se integra en `main` con PR. · Petición del equipo.
- **Commits y PRs sin firma de Claude:** sin `Co-Authored-By`, sin enlaces de sesión y con el autor del repositorio como autor de git. · Petición del equipo.

## 2026-10-05
- **Ejercicios como datos** en `core/exercises/catalog.ts`, relativos a una tónica y transpuestos al rango del usuario. · Añadir ejercicios sin tocar la UI. · [fase-03](../planning/fase-03-ejercicios.md)
- **Superación de un ejercicio:** accuracy global ≥ 80 % y ninguna nota sin voz. Una nota mal de cinco (80 %) supera justo el umbral. · Regla del punto 4. · `evaluate.ts`
- **Sirenas evaluadas como trayectoria** (cobertura, dirección y cortes), no como notas; el tiempo exacto no importa. · Spec §19.3.
- **El vibrato no penaliza:** se evalúa su centro; la estabilidad solo mide la deriva lenta cuando hay vibrato. · Spec §14.
- **Feedback: sesgo de afinación ≠ nota equivocada.** "Tiendes a quedarte bajo" solo para desviaciones de hasta 1 semitono; para más, se nombran las notas equivocadas. · Evita consejos engañosos.
- **Reorganización de docs:** `planning/`, `memory/`, `CHANGELOG.md`. · Petición del equipo.
- **Backend:** monolito modular, Clean Architecture por módulo, vertical slices, domain events + outbox, EF Core para comandos y Dapper para consultas. Sin MediatR ni AutoMapper (licencia comercial desde 2025). · Petición del equipo. · [ADR-004](../adr/ADR-004-backend.md)
- **Karaoke:** audio + melodía UltraStar/MIDI procesados en local; extracción automática opcional en servidor; auriculares obligatorios. · [ADR-009](../adr/ADR-009-song-import.md)
- **Requisitos añadidos 1–6** aprobados: rango vocal, llamada y respuesta, modo de octava, accuracy (≥ 80 %, sin 250 ms de ataque), aviso Bluetooth, texto + melodía. · [PLAN §2](../planning/PLAN.md#2-requisitos-añadidos-al-spec-decididos)
- **Detector por defecto MPM**; YIN como alternativa. Sin WASM ni ML en el MVP. · Benchmark: MPM más preciso y ~30 % más barato. · [ADR-003](../adr/ADR-003-pitch-detection.md)
- **Frontend React + Vite**, una sola app con `core/` puro. · [ADR-001](../adr/ADR-001-frontend.md)
- **pnpm** en lugar de npm. · npm 10.9 falla con un error interno de resolución de peers (ver learnings).
