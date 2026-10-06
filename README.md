# VocalCoach
Aplicacion para que aprendas a cantar

## Estado
Versión 0.2.0, en [`web/`](web/README.md):
- **Fase 2, motor de pitch:** afinador en tiempo real, calibración del rango vocal, llamada y respuesta, aviso de micrófono Bluetooth y panel de diagnóstico.
- **Fase 3, ejercicios:** notas sostenidas, secuencias, intervalos, escalas y sirenas, con evaluación y feedback.
- **Fase 4, profesor virtual:** diagnóstico, consejos, demostraciones sonoras y siguiente paso.
- **Fase 5, progreso:** camino de 10 días, racha y estadísticas, guardados en el dispositivo.
- **Fase 7, PWA:** instalable y funciona sin internet.
- **Fase 8a, canciones:** tono recomendado para tu voz, práctica por frases, entrenamiento de la frase débil e importación de canciones desde audio, analizado en tu dispositivo.
- **Fase 6, backend** en [`api/`](api/README.md) (.NET 10): cuenta opcional, sincronización entre dispositivos y profe con IA por el servidor.

Todo el audio se procesa en el dispositivo.

## Documentación
- [Planificación](docs/planning/README.md): plan técnico, roadmap y planes por fase
- [Changelog](docs/CHANGELOG.md)
- [Memoria del proyecto](docs/memory/README.md): estado, contexto, decisiones, convenciones y aprendizajes
- [Decisiones de arquitectura (ADRs)](docs/adr/README.md)
- [Benchmarks](docs/benchmarks/README.md)
- [Investigación](docs/research/fuentes-de-melodia.md)
