# Fase 9 — Demostraciones cantadas y multi-IA

**Estado:** implementada (en `dev`). Sigue el ADR-008: se sube la escalera de menor a mayor riesgo y, por ahora, solo se implementa el primer peldaño (sin IA para el audio). La IA de texto pasa a ser **multi-proveedor**.

## Qué incluye

### 1. Voz sintética que canta la letra (peldaño 1 del ADR-008)
- **Síntesis por formantes en el dispositivo** (`audio/singer.ts`), sin modelos, sin descargas y sin voces de terceros:
  - fuente: pulso glótico y un poco de aire;
  - 5 formantes en paralelo que se mueven de un sonido al siguiente;
  - consonantes: nasales y líquidas con su propio filtro, cortes y explosiones (p, t, k), ruido filtrado (s, f, j, ch) y vibrantes (r, rr);
  - altura ligada entre notas, vibrato en las notas largas y F1 que sube con la fundamental en las notas agudas, como hacen los cantantes;
  - voz grave o aguda según la altura de la melodía, ya en el tono del usuario.
- **Del texto al canto, en el núcleo puro** (`core/singing/`):
  - `phonemes.ts`: reglas ortográficas del español (seseo), diptongos, hiatos con tilde, ataques y codas;
  - `score.ts`: partitura cantada. Las consonantes de ataque se adelantan para que la vocal caiga en el pulso, la vocal ocupa al menos el 55 % de la nota y las notas sin sílaba alargan la vocal anterior (melisma);
  - `formants.ts`: formantes de las 5 vocales para voz grave y aguda.
- **Dónde se oye:**
  - «🗣 Escúchala cantada» en cada frase con letra;
  - con **Ajustes → Que la guía cante la letra**: la guía de las frases, «Escuchar despacio», el ▶ de cada frase y el karaoke con la guía de la app. Desactivado por defecto: suena a robot.

### 2. Multi-IA (Groq, Google Gemini y xAI Grok)
- **Web (clave propia, para pruebas):**
  - se pueden conectar varios proveedores en Ajustes y elegir el preferido;
  - si el preferido falla (límite del plan gratuito, red o modelo retirado), responde el siguiente;
  - los tres tienen API compatible con OpenAI: un solo cliente (`ai/providers.ts`) y un intermediario local por proveedor en desarrollo;
  - el modelo **se elige de la lista de cada proveedor** (`core/ai/models.ts`), porque los catálogos rotan: Gemini Flash más nuevo sin variantes de imagen, voz ni vista previa; Grok rápido sin razonamiento; Groq por lista de preferidos;
  - la clave de la versión anterior (solo Groq) se migra sola.
- **Servidor** (con cuenta): `Coach:Groq`, `Coach:Gemini` y `Coach:Xai`, cada uno con su clave por variable de entorno o user-secrets, y `Coach:Order` para el orden de respaldo. Sin modelo fijo, se elige con la misma lógica que en la web.

### 3. «💡 ¿Cómo la canto? (IA)»
- Ideas de interpretación para cada frase (spec §17: frase + melodía objetivo + características vocales del usuario):
  - dónde respirar;
  - qué vocal sostener o abrir;
  - cómo preparar los saltos;
  - qué intención dar a la frase.
- A la IA va **solo texto** (`core/ai/phrase-prompt.ts`): la letra, las notas en do-re-mi con sus sílabas, silencios y notas largas, saltos grandes, cuántas notas quedan fuera de la zona cómoda y el último resultado. Nunca audio.

## Decisiones
- **Peldaño 1 antes que la IA de audio:** la voz por formantes es gratis, privada, funciona sin conexión y no tiene problemas de licencia. Sirve para lo pedagógico: dónde va cada sílaba.
- **Peldaños 2 y 3 (síntesis de canto con IA y conversión a la voz del usuario):** siguen pendientes, por coste de GPU, licencias de las voces y consentimiento (ADR-008). El motor ya recibe una partitura cantada (`SungScore`): un proveedor de IA podría generar el audio desde ella sin tocar la interfaz.
- **El LLM no oye ni decide:** el diagnóstico sigue siendo del profe por reglas; el LLM redacta ideas a partir de datos.
- **Respaldo automático entre proveedores** en lugar de elegir uno: los planes gratuitos se agotan a menudo.

## Pruebas
- **Unitarias:**
  - fonemas y sílabas;
  - partitura cantada (adelanto de consonantes, silencios, melismas, notas cortas);
  - elección de modelo de cada proveedor;
  - prompt de interpretación.
- **E2E:**
  - voz sintética renderizada y comprobada con la app: todas las notas afinadas (< 30 c) en voz grave y aguda, volumen parecido al de la guía, y vocales distinguibles por sus formantes;
  - «Escúchala cantada» y la práctica con la guía cantada;
  - respaldo de Groq a Gemini;
  - migración de la clave antigua;
  - «¿Cómo la canto?» con Grok simulado.
- **API:**
  - elección de modelo;
  - respaldo y límites;
  - modelo elegido una sola vez;
  - `<think>` eliminado.

## Pendiente
- Escuchar con usuarios si la voz sintética ayuda o molesta, y mejorarla (consonantes, transición entre vocales).
- Probar con claves reales de Gemini y Grok: CORS desde el navegador en producción y nombres de modelo actuales.
- Peldaño 2: síntesis de canto con IA (voces con licencia comercial) como proveedor de `SungScore`.
