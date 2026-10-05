# Roadmap

Orden conceptual del spec: pitch → visualización → scoring → ejercicios → feedback pedagógico → progresión → offline/PWA → canciones → backend → IA. **No se invierte** porque una funcionalidad parezca más vistosa.

| Fase | Contenido | Estado | Puerta de salida |
|---|---|---|---|
| 0–1 | Investigación, plan, ADRs | ✅ Hecho | ADRs aceptados |
| 2 | Motor de pitch: captura, MPM/YIN, voicing, afinador, rango vocal, llamada y respuesta, aviso Bluetooth, diagnóstico, benchmark | ✅ Implementado · ⏳ falta medir en dispositivos reales | Criterios de [PLAN §9](PLAN.md#9-testing-y-benchmarks) en desktop + 1 Android + 1 iPhone |
| 3 | Ejercicios: nota sostenida, secuencias, intervalos, escalas, sirenas, transposición al rango, scoring, estabilidad/vibrato, feedback básico | ✅ Implementado · ⏳ falta validar con grabaciones reales | Evaluación coherente con el juicio de un profesor en ≥ 80 % de 30 intentos grabados |
| 4 | Profesor virtual: reglas pedagógicas ampliadas, ejemplos de audio, árbol de decisión | Pendiente | |
| 5 | Progreso local: IndexedDB (Dexie), learning path por días, rachas, estadísticas, mejor resultado por ejercicio | Pendiente | |
| 7 | PWA: instalación, offline, `storage.persist()` (se adelanta al backend) | Pendiente | |
| 6 | Backend .NET (ADR-004): auth, sync de intentos, catálogo | Pendiente | |
| 8a | Canciones / karaoke local (ADR-009) | Pendiente | Puntuación estable entre repeticiones |
| 8b | Extracción automática de melodía (servidor) | Pendiente | Melodía utilizable sin edición en ≥ 70 % de canciones de prueba |
| 9 | Demostraciones cantadas con IA (ADR-008) | Pendiente | |

## Deuda y validaciones abiertas

- Medición en dispositivos reales (checklist en [`../benchmarks/`](../benchmarks/README.md)).
- Set de grabaciones reales con consentimiento para validar detector y scoring.
- Calibrar con datos los umbrales provisionales: tolerancias por nivel, estabilidad (40 c → 0), inestable (< 0,35), sin voz (< 30 %), sirena (cobertura ≥ 80 %, dirección ≥ 70 %, ≤ 1 corte).
- Test de calibración de latencia (palmada o clic), que se necesita antes del karaoke.
