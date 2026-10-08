# Fase 8b — Archivos de melodía y canción entera (karaoke)

**Estado:** implementada (en `dev`). Sigue ADR-009, con la decisión del equipo de que **la app nunca reproduce el audio original**.

## Qué incluye
- **Importar archivos de melodía** (Canciones → Importar), todo en el dispositivo:
  - **UltraStar `.txt`**:
    - tempo, `#GAP` y modo relativo;
    - notas doradas;
    - sílabas habladas o rap: sin nota, se conserva su texto;
    - dúos: se toma la primera voz;
    - archivos antiguos en Windows-1252.
  - **MIDI `.mid` y karaoke `.kar`**:
    - mapa de tempo;
    - elige la pista de la melodía: la que trae letra, la que se llama voz/vocal/melodía o, si no, la más cantable (sin batería ni acordes);
    - una nota a la vez (la más aguda);
    - letra y saltos de línea de los `.kar`.
  - **MusicXML** `.musicxml`/`.xml` y **`.mxl`** comprimido:
    - parte con letra y voz 1;
    - ligaduras, acordes (nota más aguda) y `backup`/`forward`;
    - tempo por `<sound>` o metrónomo;
    - sílabas con `syllabic`.
- **Melodía exacta y con letra:**
  - las frases salen de las líneas de la letra del archivo; si no las trae, se cortan como líneas de karaoke;
  - cada nota muestra su sílaba en la línea de tiempo;
  - la tonalidad se estima para recomendar tu tono.
- **Cantar la canción entera** (🎤 en cada canción):
  - **Con la guía de la app:** cuenta atrás; suenan la melodía (se puede quitar) y los acordes en tu tono recomendado; el micro sigue escuchando.
  - **Con la canción original:** solo en las importadas. La pones tú fuera de la app y pulsas «Empezar» a la vez. Si la letra va desfasada, se ajusta en pasos de ¼ s. Vale cualquier octava.
  - En ambos casos:
    - **auriculares obligatorios**: si no, el micro oye la música;
    - letra resaltada sílaba a sílaba y avance de la línea siguiente;
    - tu voz sobre la melodía de la frase;
    - puntuación de cada frase al terminarla y resumen final, con «Entrenar la frase más difícil».
  - Cada frase cuenta en tu progreso (Fase 5).
- **Sincronía** (Ajustes): mide el retraso real del dispositivo con 8 clics que el micro oye por el altavoz (mediana). Se usa al comparar tu voz con la melodía en el tiempo, en el karaoke y en los ejercicios.

## Decisiones
- **Sin reproducir el original** (petición del equipo: uso educativo, sin reproducir ni comercializar). Para cantar con la canción real, el usuario la pone en otra app y la app se sincroniza con «Empezar» y el ajuste fino.
- **Lectores en el núcleo puro** (`core/songs/formats/`), sin DOM: un lector XML mínimo para MusicXML. Solo la descompresión de `.mxl` usa el navegador (`DecompressionStream`).
- **Sin MusicXML "timewise"** (es raro): se pide exportar como "partwise".

## Pruebas
- **Unitarias:**
  - UltraStar, MIDI (generado byte a byte en el test), MusicXML y `.mxl` (zip creado en el test);
  - detección del formato;
  - línea de tiempo del karaoke;
  - estimación del retraso.
- **E2E:**
  - importar un UltraStar y ver la letra;
  - cantar la canción entera con el original;
  - karaoke del catálogo con la guía.

## Pendiente
- Validar con usuarios el modo «con la canción original»: ¿basta pulsar «Empezar» a la vez, o hace falta sincronizar con una palmada?
- Editar la letra o las frases de una canción importada.
- Puntuación estable entre repeticiones (puerta de salida del roadmap): medir con grabaciones reales.
