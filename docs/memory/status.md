# Estado actual

_Última actualización: 2026-10-07 · versión 0.2.0 + Fases 4–9 (sin publicar, en `dev`)_

## Ramas
- `main`: tiene la Fase 2 (PR #1 fusionado). **La Fase 3 no llegó a `main`**: se fusionó antes del último push.
- `dev`: Fases 3 a 9. PR abierto a `main`: https://github.com/jtesen00/VocalCoach/pull/2
- `changes`: creada desde `main`, sin cambios.

## Hecho
- Fase 2 (motor de pitch) y Fase 3 (ejercicios), probadas con señales sintéticas y E2E en Chromium.
- Interfaz sencilla por defecto, con detalles técnicos opcionales en Ajustes.
- Fase 4: profesor virtual (diagnóstico, consejos, demostraciones sonoras, siguiente paso y coach en vivo).
- Fase 8a: canciones, perfil vocal dinámico, tono recomendado, dificultad personal, frases, entrenamiento generado e importación local desde MP3.
- Importación de MP3 rehecha con extracción polifónica (0 % → 92–100 % en mezclas sintéticas estéreo).
- Sonido de la guía con instrumentos a elegir, acordes (catálogo y reconocidos del audio) y frases tipo karaoke.
- Guía con **instrumentos grabados** (piano Salamander, voz, silbido, flauta y cuerdas), afinados nota a nota y tocados ligados. Mezcla con reverb y compresor. Si no cargan, suena el sintetizado.
- Extracción de MP3 medida con una **mezcla realista** de instrumentos grabados: 80–97 % de notas correctas (antes 37–85 %).
- Fase 5: progreso local en IndexedDB (Dexie), camino de 10 días, racha, pestaña Progreso y mejor resultado por ejercicio.
- Profe con IA experimental, **multi-IA** (Groq, Gemini, Grok con respaldo automático; clave del usuario en su navegador o por el servidor con cuenta; solo texto agregado).
- Fase 7: PWA instalable y sin internet (service worker, manifiesto, aviso de actualización, `storage.persist()`).
- Fase 6: backend .NET en `api/` (Identity, Practice, Progress, Coach), cuenta opcional y sincronización entre dispositivos en la web, y profe con IA por el servidor.
- Fase 8b: archivos de melodía (UltraStar, MIDI/.kar, MusicXML/.mxl) con letra, canción entera tipo karaoke (con guía o con el original fuera de la app) y calibración de sincronía.
- Fase 8c: separación de voz **en el navegador** (HT-Demucs FT en ONNX, WebGPU/WASM, opcional, modelo de 166 MB bajo demanda) y edición de canciones importadas (título, letra, octava, unir, dividir, borrar). Ayuda cuando la banda tapa la voz (68 % → 90 %), empeora la voz grave de prueba (73 % → 63 %): por eso no va por defecto.
- Fase 9: voz sintética por formantes que canta la letra (botón «Escúchala cantada» y ajuste «Que la guía cante la letra»), multi-IA e ideas de interpretación por frase con IA. Los peldaños 2–3 del ADR-008 (canto con IA, voz del usuario) siguen pendientes.
- Letra automática: sílabas del español sin guiones, «Pegar la letra entera» en el editor y edición de notas sueltas.
- Web: 299 tests unitarios y 31 E2E (+ la medición de separación, que se omite sin el modelo en `web/.models/`). API: 49 tests (10 de integración necesitan Docker). Dos workflows de CI (`web.yml` y `api.yml`).

## Siguiente
1. Medir en dispositivos reales (checklist en `docs/benchmarks/README.md`).
2. Grabar intentos reales con consentimiento; validar el detector y el scoring frente al juicio de un profesor; ajustar umbrales.
3. Revisar los textos del profesor con un profesor de canto y validar con alumnos el bucle de canciones.
3b. Probar la importación con MP3 reales del usuario, con y sin «Separar la voz con IA» (la mezcla realista es simulada); comprobar si la separación pierde de verdad las voces graves. Medir la separación con WebGPU y en móviles (~1 GB de RAM).
4. Validar con usuarios el camino de 10 días (duración y contenido) y probar la instalación de la PWA en Android y iPhone reales.
4b. Escuchar con usuarios la voz sintética (¿ayuda o molesta?) y probar claves reales de Gemini y Grok.
5. Desplegar la API y la web (decidir proveedor), configurar `VITE_API_URL` y enviar las cabeceras COOP/COEP (hilos para la separación); después, la fase 9 (demostraciones cantadas con IA).

## Preguntas abiertas
- IA: ya hay multi-IA (Groq, Gemini, Grok) en la web y en el servidor, y la letra de las importadas se reparte sin IA. ¿Siguiente: el peldaño 2 del ADR-008 (canto con IA)?
- ¿La voz sintética que canta la letra ayuda o molesta? (escuchar la muestra y probarla con alumnos).
- ¿Confirmar que Dapper se quiere para las consultas del backend? Se interpretó que sí.
- ¿Te encaja el camino de 10 días propuesto (`core/progress/path.ts`)?

## Dónde está cada cosa
- Núcleo puro: `web/src/core/` (music, pitch, scoring, range, exercises, teacher, profile, songs, singing, ai).
- Backend: `api/` (ver `api/README.md`; módulos en `api/src/Modules/`).
- Audio: `web/src/audio/` (engine, pitch-worklet, guide, devices, instruments, samples, synth, mix, singer, separation-model, separation-worker).
- IA: `web/src/ai/` (providers, ask) y `api/src/Modules/Coach`.
- Sonidos grabados: `web/public/samples/` (generados con `web/scripts/build-samples.py`; créditos en `CREDITS.md`).
- Mezcla realista para tests: `web/src/dev/real-mix.ts` (no entra en la app).
- Pantallas: `web/src/features/` (tuner, range, exercises, teacher, settings, songs).
- Datos locales: IndexedDB `vocalcoach` (tabla `attempts`, Fase 5) y `localStorage`: `vocalcoach.settings.v1`, `vocalcoach.profile.v1`, `vocalcoach.songs.v1`, `vocalcoach.imported.v1`. Modelo de separación en la Cache API `vocalcoach-models-v1`.
- Planes: `docs/planning/` · ADRs: `docs/adr/` · Benchmarks: `docs/benchmarks/`.
