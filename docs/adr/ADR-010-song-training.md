# ADR-010 — Entrenamiento por canción

**Estado:** Aceptado (MVP implementado) · **Fecha:** 2026-10-05

## Contexto
Actualización incremental del spec: el usuario elige una canción y la app entiende su voz, le recomienda el tono, compara su voz con la melodía en tiempo real, encuentra la frase débil y genera entrenamiento para esa frase. Es el diferenciador del producto.

## Decisión

**Reutilizar, no duplicar.** Cada frase se convierte en el mismo `ExercisePlan` que los ejercicios (`phrasePlan`). Así se reutilizan el motor de pitch, la evaluación, la línea de tiempo, la orquestación (guía → cuenta atrás → canto) y el profesor. No existe un detector de pitch específico para canciones (spec §18).

Componentes del spec y dónde viven:

| Componente | Implementación |
|---|---|
| Song Engine / Melody Engine | `core/songs/types.ts`, `melody.ts`, `catalog.ts` |
| Phrase Engine | `phrasePlan()` y `allPhrases()` |
| Vocal Profile Engine / Vocal Range Engine | `core/profile/vocal-profile.ts` |
| Key Recommendation Engine | `core/songs/key.ts` |
| Song Scoring Engine | `core/songs/scoring.ts` |
| Adaptive Training Engine | `core/songs/training.ts` (+ el profesor de la Fase 4 en cada ejercicio) |
| Feedback en tiempo real | `core/songs/live.ts` |
| Importación desde audio | `core/songs/transcribe.ts` + `audio/melody-import.ts` (Web Worker) |

**Entidades (spec §19): solo las necesarias.**

| Entidad | ¿Se crea? | Motivo |
|---|---|---|
| Song, SongSection, SongPhrase, MelodyNote | Sí | Modelo mínimo de canción |
| Melody | No | Es la lista de notas de cada frase |
| VocalProfile | Sí | Incluye los rangos detectado, fiable y cómodo (VocalRange como tipo de valor) |
| PhrasePerformance | Sí, como `PhraseRecord` local | Último, mejor y anterior resultado por tonalidad (para medir la mejora y aprender el tono) |
| SongPerformance | No como entidad | Es el conjunto de `PhraseRecord` de la canción |
| KeyRecommendation, SongDifficulty, TrainingRecommendation | Calculadas, no guardadas | Dependen del perfil del momento |

**Perfil vocal dinámico.**
- **Detectado:** lo que la voz ha producido alguna vez.
- **Fiable:** notas con ≥ 60 % de acierto.
- **Cómodo:** notas con ≥ 80 % de acierto y estables, en ≥ 2 intentos distintos. La medición de "Mi voz" es solo la primera estimación: la zona se amplía y se recorta con los resultados.

Una nota aislada nunca decide el rango.

**Tono recomendado = mayor acierto esperado, no "que quepa".** Para cada transposición entre −12 y +12 se estima el acierto de cada nota con un suavizado bayesiano: un valor a priori según la zona (cómoda 0,85 · fiable 0,65 · detectada 0,4 · fuera, decreciente) combinado con la precisión real del usuario en esa nota. La estabilidad solo matiza lo que acierta. Los saltos grandes se multiplican por la tasa de acierto de ese salto. La media se pondera por duración, y las notas largas pesan ×1,5.

Lo cantado de verdad en cada tonalidad se mezcla con la estimación, con peso n / (n + 3). Hay una leve preferencia por la original: −0,4 % por semitono, y se mantiene la original si está a menos de 1 punto de la mejor.

**Dificultad personal (spec §13).** Afinación, rango, notas agudas, saltos y ritmo, de 1 a 5 estrellas, para esta voz y esta tonalidad.

**Frases (spec §9–10).**
- Puntuación: acierto ponderado por tiempo × cobertura (no se exige voz en cada sílaba).
- Problema principal, por prioridad: sin voz → melodía → salto → agudas → graves → nota larga → sesgo.
- La frase más débil (< 80) se propone para entrenar.
- Entrenamiento: progresión de ejercicios en las alturas exactas de la frase en el tono elegido, que acaba siempre con la frase despacio y luego a velocidad normal. Ejemplo para un salto: mitad → mitad → completo → sostener la nota de llegada → frase lenta → frase normal.

**Versión fijada al practicar.** El tono aprendido cambia la próxima recomendación, nunca una práctica en curso.

**Datos locales.** Perfil, progreso y canciones importadas se guardan en `localStorage`; en la Fase 5 pasan a IndexedDB y en la 6 se sincronizan.

## Consecuencias
- El catálogo propio es pequeño (4 canciones seguras). La vía para "cualquier canción" es la importación local (ADR-009 y la investigación de fuentes de melodía).
- El backend (Fase 6) tendrá un módulo `Songs` (catálogo) y `Practice` guardará `PhraseRecord` como intentos inmutables.
