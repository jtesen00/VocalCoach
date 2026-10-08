# Fase 2 — Prototipo del motor de pitch

**Estado:** implementado (v0.1.0). Falta medir en dispositivos reales.

## Alcance entregado

| Requisito (spec §69) | Implementación |
|---|---|
| Permiso y captura del micrófono | `audio/engine.ts`: `getUserMedia` sin EC/NS/AGC; errores explicados al usuario |
| Detectar sonido con voz | `core/pitch/tracker.ts`: ruido de fondo adaptativo + clarity + histéresis |
| Estimar frecuencia | `core/pitch/mpm.ts` (por defecto) y `yin.ts`, con FFT, en el AudioWorklet |
| Nota y cents | `core/music/notes.ts`: MIDI continuo |
| Mostrar en tiempo real | `features/tuner`: lectura a 15 Hz + trayectoria en canvas a 60 fps |
| Confianza | Clarity de MPM (1 − CMNDF en YIN) |
| Diagnóstico de latencia | Panel: media ventana, latencia de entrada, worklet → UI, estimaciones por segundo |
| Sin backend | ✅ |

Además se entregaron los requisitos añadidos 1–5 del [PLAN §2](PLAN.md#2-requisitos-añadidos-al-spec-decididos): rango vocal, llamada y respuesta, modo de octava, accuracy, aviso Bluetooth.

## Pendiente para cerrar la fase
- [ ] Checklist de dispositivos ([benchmarks](../benchmarks/README.md)).
- [ ] Grabaciones reales y `pnpm bench -- voz.wav ref.csv`.
