# Fase 8a — Entrenamiento por canción (adelantada)

**Estado:** MVP implementado (sin publicar, en `dev`). Decisiones en [ADR-010](../adr/ADR-010-song-training.md); fuentes de melodía en [la investigación](../research/fuentes-de-melodia.md).

## Bucle que demuestra el MVP (spec §20)

```
Elegir canción → Medir la voz → Analizar el rango → Recomendar tono → Cantar una frase
→ Comparar melodía y voz en vivo → Puntuar → Frase más débil → Entrenamiento → Volver a cantar → Mejora medida
```

| Paso | Dónde | Estado |
|---|---|---|
| Elegir canción | Pestaña **Canciones**: 4 canciones seguras + importadas | ✅ |
| Medir la voz | "Mi voz" + perfil dinámico que aprende de cada intento | ✅ |
| Analizar rango | Avisos: "Estribillo: tiene notas por encima de tu zona cómoda" | ✅ |
| Recomendar tono | "Tu versión recomendada" + versión original; con detalles: tonalidades, semitonos y acierto esperado | ✅ |
| Dificultad para ti | Afinación, rango, notas agudas, saltos y ritmo (★) + valoración general | ✅ |
| Cantar una frase | Guía → cuenta atrás → canto con letra bajo cada nota y melodía visual | ✅ |
| Feedback en vivo | "↓ Un poco bajo: sube un poco", "La melodía sube ↑ prepárate", "✓ ¡Así! Vas con la melodía" | ✅ |
| Puntuar | Porcentaje por frase ✓ ⚠ ✗ | ✅ |
| Frase más débil + problema principal | "Tu frase más débil: Frase 8 · Problema principal: las notas agudas («mí»)" | ✅ |
| Entrenamiento | Progresión generada en las alturas exactas de la frase y del tono elegido | ✅ |
| Volver a cantar y medir mejora | "Antes 51 % → ahora 74 % (+23) ¡Mejoras!" | ✅ |
| Aprender el mejor tono | Lo cantado en cada tonalidad se mezcla con la estimación | ✅ |

## Contenido (spec §15)

| Canción | Licencia | Rango | Para qué sirve |
|---|---|---|---|
| Estrellita | Tradicional | C4–A4 | Fácil, saltos de quinta |
| Martinillo | Tradicional | C4–D5 | Notas rápidas (corcheas), salto descendente |
| Oda a la alegría | Melodía de dominio público, letra original | A3–A4 | Grados conjuntos, nota grave final |
| Luz de puerto | Original | A3–E5 | Estribillo agudo, saltos, nota aguda larga final: el caso "grave → agudo → aguda sostenida" |

Las canciones comerciales mencionadas en el spec ("La Nave del Olvido", "Que Lloro") **no se incluyen**: su melodía y su letra tienen derechos. El usuario puede importarlas para su práctica personal (ver abajo).

## Importar una canción desde audio (petición del equipo)

El usuario carga un MP3, M4A o WAV y, opcionalmente, el fragmento ("desde / hasta"). La app extrae la melodía **en el dispositivo** y la convierte en una canción con frases. Se practica aquí y luego se canta con el original en YouTube.

- El audio no se sube, no se guarda y la app no lo reproduce; solo queda la melodía, en local, y se puede borrar.
- Antes de analizar, el usuario confirma el uso personal y educativo.
- Calidad: muy buena con voz sola o pistas de voz; aproximada con la mezcla completa. La mejora es la separación de voz (fase 8c).

## Pruebas
- `core/songs/songs.test.ts` (34 tests):
  - catálogo, plan, guía con silencios y análisis de rango (A3–E5 frente a A3–D5);
  - perfil dinámico: ampliación, recorte, detectado / fiable / cómodo;
  - recomendador: grave, aguda, encaja, sin perfil, "no basta con caber" y aprende de la interpretación;
  - dificultad personal, problema por frase, entrenamiento, indicaciones en vivo, y todas las frases de todas las canciones.
- `core/songs/transcribe.test.ts` (8 tests): notas exactas con voz limpia, desafinación global, vibrato, ruido, frases y tonalidad.
- E2E (`e2e/songs.spec.ts`): versión recomendada → frase → problema → entrenamiento; frase más débil; importar, practicar y borrar.

## Pendiente
- [ ] Validar con alumnos que el bucle produce mejora.
- [ ] Editar canciones importadas: borrar frases que no sean de la voz y añadir letra.
- [ ] "Cantar la canción entera" encadenando frases (opcional: el spec prioriza las frases).
- [ ] Separación de voz (8c) e importación de UltraStar/MIDI (8b).
