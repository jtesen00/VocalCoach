# ADR-009 — Importación de canciones (modo karaoke)

**Estado:** Aceptado (revisado: la extracción local de la melodía se adelanta) · **Fecha:** 2026-10-05

## Contexto
Los usuarios quieren cargar las canciones que les gustan y ver en tiempo real si las cantan afinadas. Un MP3 es una mezcla de voz e instrumentos: no trae la melodía como dato. Además, la música por altavoz contamina la detección y el contenido suele tener copyright.

## Revisión (petición del equipo)
Se adelanta un **nivel C local**: el usuario carga un MP3/M4A/WAV de cualquier canción, y la app extrae en el dispositivo cómo se canta la melodía (`core/songs/transcribe.ts`). La melodía se practica en la app y después el usuario canta con el original por su cuenta (por ejemplo en YouTube). El audio no se sube, no se guarda y la app no lo reproduce. Detalles y limitaciones en [la investigación de fuentes de melodía](../research/fuentes-de-melodia.md). La separación de voz con IA, para mejorar el resultado con la mezcla completa, sigue siendo el siguiente paso (8c).

## Decisión original
1. **Fase 8b, local:** importar **audio (MP3/M4A/WAV) + melodía (UltraStar `.txt` o MIDI; MusicXML más adelante)**. Todo se procesa y guarda en el dispositivo (IndexedDB/OPFS). Sin melodía hay **modo libre**: trayectoria del usuario sobre la música, sin puntuación.
2. **Fase 8c, opcional:** extracción automática de la melodía desde el audio (separación de voz tipo Demucs + pitch tracking + alineación opcional de la letra) como **trabajo en servidor** (cola en Postgres + GPU serverless). Solo con consentimiento explícito: el audio se borra tras procesarse y solo se conserva la melodía derivada, privada para el usuario. Se evaluará hacerlo en el navegador con WebGPU.
3. **Auriculares obligatorios** en modo karaoke. El modo altavoz con cancelación de eco es un experimento que hay que medir.
4. **Sincronización** con compensación de latencia de entrada y salida más un test de calibración. Tolerancia temporal de ±100–150 ms.
5. **Octava** detectada automáticamente por canción (clase de nota o desplazamiento fijo). Se transpone la melodía objetivo, no el audio.
6. La app **no distribuye** canciones ni letras comerciales. El catálogo propio es original o de dominio público.

## Consecuencias
- El motor de pitch y el scoring se reutilizan tal cual. Lo nuevo es el modelo `Song → Phrase → Note(t, duración, midi, sílaba)`, los parsers de UltraStar/MIDI y el timeline.
- El nivel 8c añade el primer componente Python/GPU, compartido con la Fase 9.
