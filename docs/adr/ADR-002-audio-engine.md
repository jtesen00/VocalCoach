# ADR-002 — Motor de audio

**Estado:** Aceptado · **Fecha:** 2026-10-05

## Decisión
- Captura con `getUserMedia` **desactivando** `echoCancellation`, `noiseSuppression` y `autoGainControl`.
- **AudioWorklet** con ring buffer; detector ejecutado en el worklet cada 512 muestras (ventana 2048).
- Comunicación al hilo principal con **`postMessage`** (~94 msg/s).
- Usar siempre el `sampleRate` real del `AudioContext`.

## Descartado (por ahora)
- **SharedArrayBuffer:** exige COOP/COEP; sin ganancia medible a esta tasa.
- **WebAssembly:** el detector con FFT en JS cabe holgadamente en el presupuesto. Reevaluar solo si el benchmark en Android de gama media supera 2 ms/frame.
- **Web Worker extra:** solo si el detector no cabe en el worklet.
- **ScriptProcessorNode / AnalyserNode** para detección: obsoleto / sin control de timing.

## Consecuencias
El código de DSP es TS puro sin globals del navegador → se ejecuta igual en worklet, Vitest y arnés Node.
