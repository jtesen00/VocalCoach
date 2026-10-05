# Fase 3 — Ejercicios

**Estado:** implementado (v0.2.0). Falta validar con grabaciones reales y con el criterio de un profesor.

Flujo de cada intento (llamada y respuesta): **guía** (el micro se ignora) → **cuenta atrás** con claqueta (3 pulsos de 0,6 s) → **canto** con la línea de tiempo → **evaluación** y feedback básico.

## Épica 3.1 — Modelo de ejercicios

| Tarea | Criterio de aceptación | Estado |
|---|---|---|
| Ejercicios como datos (`core/exercises/catalog.ts`) | Añadir un ejercicio no requiere tocar la UI | ✅ |
| Tipos: sostenida, secuencia, intervalo, escala, sirena | 9 ejercicios originales, sin copyright | ✅ |
| Plan temporal (`plan.ts`) | Segmentos con inicio/fin en s; las sirenas se interpolan | ✅ |
| Transposición al rango (`rootForRange`) | El ejercicio queda centrado en el rango calibrado; sin rango, tónica C4; ajustable ±1 semitono | ✅ |

## Épica 3.2 — Evaluación (`evaluate.ts`, funciones puras)

| Tarea | Criterio de aceptación | Estado |
|---|---|---|
| Ventana por nota | Se evalúa desde el ataque (250 ms, o media nota si es más corta) hasta el final del tramo; las transiciones no penalizan | ✅ |
| Compensación de latencia | `t` del frame − (media ventana + latencia de entrada) | ✅ |
| Estado por nota | `perfect / close / too_high / too_low / unstable / no_voice` | ✅ |
| Estabilidad (`stability.ts`) | Deriva lenta (media móvil de 200 ms) + oscilación rápida; 40 c de desviación → estabilidad 0 | ✅ |
| Vibrato | 4–8 Hz y ±15–150 c por autocorrelación; **no penaliza**, se evalúa el centro | ✅ |
| Puntuación por nota | 100 × cobertura × (0,75·accuracy + 0,25·estabilidad); cobertura = min(1, voz / 60 %) | ✅ |
| Superación | Accuracy global ≥ 80 % y ninguna nota sin voz | ✅ |
| Intervalos | Salto cantado frente al objetivo, en cents | ✅ |
| Sirenas como trayectoria | Cobertura de semitonos, dirección, cortes (≥ 150 ms); supera con ≥ 80 %, ≥ 70 % y ≤ 1 corte; no se evalúan como notas | ✅ |
| Modo "cualquier octava" | Por nota en notas; desplazamiento único en sirenas | ✅ |

## Épica 3.3 — Feedback básico (sustituido en la Fase 4 por `core/teacher/`)

Reglas declarativas en orden de prioridad, máximo 3 mensajes, lenguaje acústico (nunca fisiológico): sin voz, superado, notas sin cantar, misma nota todo el rato, sesgo bajo/alto (≤ 1 semitono), notas equivocadas, inestable, nota que cae al final, intervalo corto/largo, cortes, cobertura y dirección de la sirena, vibrato (informativo). El profesor de la Fase 4 las amplía.

## Épica 3.4 — UI (`features/exercises`)

| Tarea | Criterio de aceptación | Estado |
|---|---|---|
| Lista de ejercicios | Tipo, nivel y notas ya transpuestas | ✅ |
| Orquestación (`useExerciseRun`) | Guía → cuenta atrás → canto → evaluación, con el reloj del AudioContext; cancelable | ✅ |
| Línea de tiempo en canvas | Barras objetivo con tolerancia, rampas en sirenas, voz del usuario y cursor; fuera del render de React | ✅ |
| Resultado | Puntuación, superado o no, feedback, tabla por nota; intervalo y estadísticas de sirena | ✅ |
| Accesibilidad | Estados con texto e icono, fase anunciada con `aria-live`, controles con etiqueta | ✅ |

## Pruebas
- Unitarias (`core/exercises/exercises.test.ts`): afinado, ataque, sesgo, vibrato, inestabilidad, caída final, silencio, octavas, latencia, secuencias, transiciones, notas equivocadas o sin cantar, intervalos, sirenas (completa, rápida, con cortes, parcial, al revés, una octava abajo) e integración audio sintético → detector → evaluación.
- E2E (`e2e/exercises.spec.ts`): nota sostenida superada; secuencia transpuesta no superada; sirena no superada.

## Pendiente para cerrar la fase
- [ ] 30 intentos reales grabados y evaluados también por un profesor; ajustar umbrales (ver [ROADMAP](ROADMAP.md#deuda-y-validaciones-abiertas)).
- [ ] Probar el flujo en móvil: la guía por altavoz no debe filtrarse a la evaluación.
