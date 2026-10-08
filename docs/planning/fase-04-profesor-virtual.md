# Fase 4 — Profesor virtual

**Estado:** implementado (sin publicar, en `dev`). Falta validar los consejos con un profesor de canto y con alumnos reales.

## Objetivo
Que la app no se limite a decir "bajo" o "alto": debe explicar qué pasó, proponer qué probar, **demostrarlo con sonido** y decidir el siguiente paso. Todo con lenguaje acústico y sin diagnosticar el cuerpo (spec §17).

## Arquitectura (`web/src/core/teacher/`, TS puro)

```
ExerciseEvaluation ──► diagnose() ──► [Diagnosis…] ordenados por prioridad
                                            │
             intentos anteriores ──►  advise() (árbol de decisión)
                                            │
                     LESSONS (datos) ──► titular · explicación · consejos · demo · siguiente paso
```

| Módulo | Responsabilidad |
|---|---|
| `diagnose.ts` | Taxonomía de errores y clasificación de un intento |
| `content.ts` | Lecciones como datos: titular, explicación, consejos, línea corta y demostración sonora por diagnóstico |
| `teacher.ts` | Árbol de decisión: problema principal, observaciones secundarias sin repetirse, progreso y siguiente paso |
| `live.ts` | Coach en vivo para "Canta libre": reglas por duración |
| `format.ts` | Modo sencillo ("un poco", Do) o detallado (−40 c, C4) |

## Épica 4.1 — Clasificación de errores

Orden de prioridad (lo primero que hay que corregir va antes):

| # | Diagnóstico | Se detecta cuando… |
|---|---|---|
| 1 | No se oyó | Ninguna nota con voz |
| 2 | Otra octava | Con "octava exacta", la mitad o más de las notas están a ±12 semitonos (±60 c) |
| 3 | No sigue la melodía | La melodía se mueve ≥ 2 semitonos y la voz < 1 |
| 4 | Faltan notas | Alguna nota sin voz |
| 5 | Notas lejos | Alguna nota a más de un semitono |
| 6–8 | Sirena: dirección / recorrido / cortes | Dirección < 70 % (si cubrió ≥ 30 %) · cobertura < 80 % · más de 1 corte |
| 9–10 | Salto corto / largo | Error del intervalo > 30 c |
| 11–12 | Algo bajo / alto | La mitad o más de las notas al mismo lado, a ≤ 1 semitono |
| 13 | Cae al final | Nota sostenida con caída ≥ 20 c en el último tercio |
| 14 | Inestable | Estabilidad < 0,35 sin vibrato (sin contar la tendencia lineal) |
| 15 | Casi | No supera el 80 % y no hay un error claro |
| — | Excelente / Superado / Vibrato | Positivos; el vibrato es solo informativo |

| Tarea | Criterio de aceptación | Estado |
|---|---|---|
| Taxonomía y prioridad | Cada intento de prueba produce el diagnóstico esperado (16 casos) | ✅ |
| Sin redundancias | "Sigue la melodía" oculta "notas lejos" y "algo bajo/alto"; máximo 2 observaciones secundarias | ✅ |
| Superado con margen de mejora | El titular felicita y añade "Para mejorar: …" | ✅ |
| Estabilidad sin tendencia | Una caída continua es "cae al final", no "inestable" | ✅ |

## Épica 4.2 — Mensajes correctivos y ejemplos de audio

| Tarea | Criterio de aceptación | Estado |
|---|---|---|
| Lecciones como datos | Añadir o editar un consejo no toca la UI | ✅ |
| Demostraciones ("🔊 Escúchalo") | Bajo/alto: nota correcta → la tuya → correcta · salto correcto frente al tuyo · nota estable frente a nota que baila o que cae · melodía más lenta · sirena completa · misma nota en otra octava | ✅ |
| Lenguaje | Modo sencillo sin cents, Hz ni C4; detallado con cifras | ✅ (test) |
| Sin diagnóstico del cuerpo | Ningún texto menciona diafragma, cuerdas vocales, laringe, garganta, tensión, postura ni músculos | ✅ (test) |

## Épica 4.3 — Árbol de decisión: siguiente paso

| Situación | Siguiente paso |
|---|---|
| Otra octava | Botón "Permitir cantar en otra octava" |
| Superado | "Siguiente: <ejercicio> →" |
| 1.º o 2.º fallo, o fallos por motivos distintos | Repetir |
| 3.er fallo seguido por el mismo motivo | Algo más fácil: menos exigencia (si no estaba en Relajado) y/o un ejercicio más fácil del mismo tipo (o "Mantén una nota") |
| No se oyó | Repetir (siempre) |
| Mejora de ≥ 5 puntos frente al intento anterior | "¡Mejor que el intento anterior!" |

Los intentos se guardan en memoria durante la sesión (`features/exercises/history.ts`); en la Fase 5 pasan a IndexedDB.

## Épica 4.4 — Coach en vivo ("Canta libre")

Reglas por duración (spec §18), como datos en `LIVE_RULES`: 2 s por debajo → "piensa la nota un poquito más arriba"; 2 s por encima → "más relajado y un poquito más abajo"; 2,5 s cerca → "busca el centro"; 3 s afinado → felicitación. Un frame suelto no rompe la racha (0,3 s de tolerancia) y el mensaje se mantiene 1,5 s.

## Pruebas
- `core/teacher/teacher.test.ts` (54 tests): diagnóstico de 17 casos, demostraciones válidas, árbol de decisión, progreso, lenguaje sencillo y detallado, ausencia de diagnósticos físicos, coach en vivo.
- E2E: profe felicita y lleva al siguiente ejercicio; "Sigue la melodía" con demostración; detección de otra octava y cambio de ajuste; sirena; consejo en vivo.

## Pendiente
- [ ] Revisar los textos con un profesor de canto.
- [ ] Medir con alumnos si los consejos ayudan: ¿mejora el siguiente intento?
- [ ] Persistir el historial (Fase 5) para que el profesor recuerde entre sesiones.
