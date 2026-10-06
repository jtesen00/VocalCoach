# Roadmap

Orden conceptual del spec: pitch → visualización → scoring → ejercicios → feedback pedagógico → progresión → offline/PWA → canciones → backend → IA. **No se invierte** porque una funcionalidad parezca más vistosa. Excepción acordada: el entrenamiento por canción (8a) se adelanta porque es el diferenciador del producto (actualización incremental del spec) y se apoya en lo ya validado (pitch, ejercicios, profesor).

| Fase | Contenido | Estado | Puerta de salida |
|---|---|---|---|
| 0–1 | Investigación, plan, ADRs | ✅ Hecho | ADRs aceptados |
| 2 | Motor de pitch: captura, MPM/YIN, voicing, afinador, rango vocal, llamada y respuesta, aviso Bluetooth, diagnóstico, benchmark | ✅ Implementado · ⏳ falta medir en dispositivos reales | Criterios de [PLAN §9](PLAN.md#9-testing-y-benchmarks) en desktop + 1 Android + 1 iPhone |
| 3 | Ejercicios: nota sostenida, secuencias, intervalos, escalas, sirenas, transposición al rango, scoring, estabilidad/vibrato, feedback básico | ✅ Implementado · ⏳ falta validar con grabaciones reales | Evaluación coherente con el juicio de un profesor en ≥ 80 % de 30 intentos grabados |
| 4 | Profesor virtual: clasificación de errores, consejos como datos, demostraciones sonoras, árbol de decisión, coach en vivo ([detalle](fase-04-profesor-virtual.md)) | ✅ Implementado (en `dev`) · ⏳ falta revisión pedagógica | Un profesor de canto valida los textos; el siguiente intento mejora tras el consejo |
| 5 | Progreso local: IndexedDB (Dexie), learning path por días, rachas, estadísticas, mejor resultado por ejercicio ([detalle](fase-05-progreso.md)) | ✅ Implementado (en `dev`) · ⏳ falta validar el camino con usuarios | El usuario vuelve al día siguiente y ve su avance |
| 7 | PWA: instalación, offline, `storage.persist()` (se adelanta al backend) ([detalle](fase-07-pwa.md)) | ✅ Implementado (en `dev`) · ⏳ falta probar en móviles reales | Se instala y se practica sin conexión en Android y iPhone |
| 6 | Backend .NET (ADR-004): cuentas, sync de intentos, progreso por outbox e intermediario de IA ([detalle](fase-06-backend.md)) | ✅ Implementado (en `dev`) · ⏳ falta desplegar | Un intento hecho en un dispositivo aparece en otro con la misma cuenta |
| **8a** | **Entrenamiento por canción** (adelantada por ser el diferenciador): perfil vocal dinámico, tono recomendado, dificultad personal, frases, entrenamiento generado e importación local desde MP3 ([detalle](fase-08a-canciones.md), ADR-010) | ✅ Implementado (en `dev`) · ⏳ falta validar con alumnos | El bucle completo produce mejora medible en la frase entrenada |
| 8b | Importar canción + archivo de melodía (UltraStar/MIDI/MusicXML), modo libre (ADR-009) | Pendiente | Puntuación estable entre repeticiones |
| 8c | Separación de voz para extraer la melodía de mezclas completas (servidor o WebGPU) | Pendiente | Melodía utilizable sin edición en ≥ 70 % de canciones de prueba |
| 9 | Demostraciones cantadas con IA (ADR-008) | Pendiente | |

## Deuda y validaciones abiertas

- Medición en dispositivos reales (checklist en [`../benchmarks/`](../benchmarks/README.md)).
- Set de grabaciones reales con consentimiento para validar detector y scoring.
- Calibrar con datos los umbrales provisionales: tolerancias por nivel, estabilidad (40 c → 0), inestable (< 0,35), sin voz (< 30 %), sirena (cobertura ≥ 80 %, dirección ≥ 70 %, ≤ 1 corte).
- Test de calibración de latencia (palmada o clic), que se necesita antes del karaoke.
- Calibrar el recomendador de tono (valores a priori por zona, peso de lo observado) con datos reales.
- Editar canciones importadas (borrar frases que no sean de la voz, añadir letra).
