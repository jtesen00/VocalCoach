# Fase 8c — Separación de voz y edición de canciones importadas

**Estado:** implementada (en `dev`). Actualiza ADR-009: la separación se hace **en el navegador**, no en un servidor, para cumplir la regla «el audio nunca sale del dispositivo».

## Qué incluye
- **«Separar la voz con IA»** al importar una canción desde audio (Canciones → Importar), opcional:
  - modelo **HT-Demucs FT, especialista en voz** (Meta, licencia MIT), exportado a ONNX por StemSplit, con los pesos en fp16 (166 MB);
  - se descarga solo si el usuario lo pide, una vez, de una revisión fija de Hugging Face (configurable con `VITE_SEPARATION_MODEL_URL`). Se comprueba su huella SHA-256 y se guarda en la Cache API (`vocalcoach-models-v1`);
  - se ejecuta en un Web Worker con ONNX Runtime Web: WebGPU si el navegador lo ofrece y, si no, WebAssembly (varios hilos si la página está aislada con COOP/COEP);
  - la mezcla se trocea en segmentos de 7,8 s con un 25 % de solapamiento y la voz se recompone con fundidos (`core/songs/separation.ts`, puro y testeado);
  - la melodía se extrae de la voz separada con el mismo `extractMelody`; los acordes, de la mezcla;
  - progreso por etapas (descarga, lectura, separación, análisis) y botón «Cancelar».
- **Ajustes → Separador de voz con IA:** estado del modelo, créditos y «Borrar para liberar espacio».
- **Calidad de la extracción:** indica si la voz se separó; si no y la calidad no es buena, sugiere reimportar con la separación.
- **Editar una canción importada** (✏️ en la canción), sobre un borrador con «Deshacer»:
  - título;
  - letra de cada frase: las sílabas, separadas por espacios o guiones, se reparten entre las notas (`distributeLyrics`);
  - octava ↑/↓ de una frase (error típico de la extracción);
  - dividir una frase en su respiración más larga, unir con la siguiente (con el silencio real entre ambas) y borrar.
  - Los ids de las frases que siguen existiendo no cambian: se conserva su progreso.

## Decisiones
- **En el dispositivo, no en servidor:** el audio no sale del dispositivo (CLAUDE.md). El servidor de GPU queda descartado para esta fase.
- **Opcional y bajo demanda:** 166 MB de modelo + 28 MB del motor WASM no entran en el precaché de la PWA. El motor se guarda en caché la primera vez que se usa.
- **Grafo sin optimizar** (`graphOptimizationLevel: 'disabled'`): al plegar las conversiones fp16 → fp32 se agota la memoria de WASM (`std::bad_alloc`).
- **Especialista en voz** (htdemucs_ft, sub-modelo de voz) en lugar del htdemucs de 4 pistas: mismo tamaño y mejor SDR de voz (9,19 dB en MUSDB18-HQ).

## Medición
- `pnpm bench:separation` (Node, mezcla sintética) y `e2e/separation-real.spec.ts` (Chromium, mezcla con instrumentos grabados y el flujo completo de importación). Ambos necesitan el modelo en `web/.models/` (no se versiona) y se omiten sin él.
- **Mezcla sintética:** la separación empeora (68 % frente a 100 % de altura correcta; 0 % en mono). Esperable: su «voz» es un tono armónico sintético que el modelo no reconoce como voz. No sirve para juzgar la separación.
- **Mezcla realista** (voz grabada, piano, cuerdas, bajo, batería y reverb; notas cantadas con la altura correcta tras el flujo completo):

  | Caso | Mezcla | Voz separada | Notas «de más» (mezcla → separada) |
  |---|---|---|---|
  | Estéreo, voz a 0 dB | 98 % | 93 % | 0 → 2 % |
  | Voz 4 dB bajo la banda | 87 % | **97 %** | 2 → 0 % |
  | Voz 8 dB bajo la banda | 68 % | **90 %** | 23 → 7 % |
  | Mono | 92 % | 95 % | 10 → 0 % |
  | Voz grave (−12) | 73 % | 63 % | 15 → 3 % |
  | Voz grave, mono | 83 % | 58 % | 15 → 7 % |

  Con la voz grave no hay errores de octava: el modelo **pierde notas** (30 % sin nota), seguramente porque la voz de prueba es una muestra «uuh» bajada una octava, poco natural. Hay que comprobarlo con voces graves reales. Quitar la máscara de centro o analizar en mono no lo arregla.
- **Velocidad sin GPU** (WASM, un hilo): ~1,6× tiempo real en Node y ~3,3× en Chromium (≈ 10 min para una canción de 3 min). Con WebGPU o varios hilos debería ser bastante más rápido; falta medirlo en dispositivos reales.
- **Conclusión:** opcional, recomendada cuando los instrumentos tapan la voz; no se activa por defecto.

## Pendiente
- Medir con MP3 reales del usuario (puerta de salida: melodía utilizable sin edición en ≥ 70 % de las canciones de prueba).
- Medir velocidad y memoria con WebGPU y en móviles (el modelo necesita ~1 GB de RAM).
- Enviar COOP/COEP en el hosting de producción (para usar varios hilos sin GPU).
- ~~Editar notas sueltas~~ Hecho: subir, bajar y borrar notas. Falta cambiar la duración, si hace falta.
