# Benchmarks del motor de pitch

Criterios de aceptación: [PLAN.md §9](../PLAN.md#9-testing-y-benchmarks).

## 1. Sintético (`cd web && pnpm bench`)

Mismo código que se ejecuta en el AudioWorklet. 48 kHz, ventana 2048, salto 512, notas E2–C6 (45 notas), tono con 8 armónicos de caída tipo vocal, tras el `PitchTracker` (voicing + mediana de 3).

Resultado de referencia (2026-10-05, Node 22, CPU de servidor x86):

| Detector | Caso | Voz detectada | RPA (< 50 c) | Error mediano | Octava | ms/frame |
|---|---|---|---|---|---|---|
| MPM | limpio | 100 % | 100 % | 0,00 c | 0 % | 0,38 |
| MPM | +10 c / −20 c | 100 % | 100 % | 0,00 c | 0 % | 0,34 |
| MPM | vibrato 5,5 Hz ±50 c | 100 % | 100 % | 12,6 c* | 0 % | 0,33 |
| MPM | ruido SNR 20 dB | 100 % | 100 % | 0,23 c | 0 % | 0,36 |
| MPM | ruido SNR 10 dB | 100 % | 100 % | 1,86 c | 0 % | 0,33 |
| YIN | limpio | 100 % | 100 % | 0,02 c | 0 % | 0,50 |
| YIN | vibrato 5,5 Hz ±50 c | 100 % | 100 % | 22,5 c* | 0 % | 0,49 |
| YIN | ruido SNR 10 dB | 100 % | 99,7 % | 3,19 c | 0 % | 0,49 |

Falsos positivos de voz (silencio, ruido blanco −40/−20 dBFS, zumbido de 50 Hz + ruido): **0 %** con ambos detectores.

\* Con vibrato, el error instantáneo refleja el promediado de la ventana (~43 ms) y la mediana. No afecta a la evaluación, que usa la mediana del intento (el centro del vibrato).

**Lectura:** MPM es más preciso y ~30 % más barato que YIN. Se mantiene como detector por defecto. Coste < 0,4 ms por estimación en servidor; en un Android de gama media se espera 3–5× más, dentro del presupuesto de 2 ms. **Esto no sustituye a la medición en dispositivos reales.**

## 2. Voz real (`pnpm bench -- voz.wav [referencia.csv]`)

- WAV mono o estéreo (PCM 16/24/32 bits o float).
- `referencia.csv` opcional con líneas `t_segundos,hz` (0 = sin voz), por ejemplo exportado de una anotación manual o de un dataset con licencia compatible (verificar la licencia de cada uno). Con referencia se calcula RPA.
- Sin referencia, imprime la trayectoria detectada (t, Hz, nota, cents, clarity, nivel).

Set mínimo a grabar, siempre con consentimiento y fuera del repositorio: voces masculinas y femeninas, grave/medio/agudo, suave/fuerte, con y sin vibrato, susurrado, frases con consonantes y notas desafinadas a propósito.

## 3. Dispositivos reales — checklist

Abrir la app (HTTPS o `localhost`), activar el micrófono y desplegar **Diagnóstico**.

| Comprobación | Desktop Chrome | Desktop Safari | Android Chrome | iPhone Safari |
|---|---|---|---|---|
| Permiso y arranque desde el botón | | | | |
| EC / NS / AGC = desactivado | | | | |
| Estimaciones por segundo ≈ 86–94 | | | | |
| Latencia de entrada informada | | | | |
| Estimación extremo a extremo | | | | |
| Silencio 10 s: sin notas fantasma | | | | |
| Ventilador / TV de fondo: sin notas fantasma | | | | |
| C4 → C#4 → D4 cantados se distinguen | | | | |
| "Escuchar y cantar" por altavoz: no se detecta la referencia | | | | |
| Auriculares Bluetooth: aparece el aviso | | | | |
| Pantalla bloqueada y vuelta: la captura se recupera o se avisa | | | | |
| Switch de silencio (iOS): se oye la referencia | — | — | — | |

### Latencia extremo a extremo (medida externa)

El navegador no informa de toda la latencia del hardware. Para medirla:

1. Grabar en vídeo a cámara lenta (240 fps) la pantalla y una fuente de sonido brusca (dar una palmada cerca del micrófono cantando una nota, o un tono que empieza de golpe desde otro dispositivo).
2. Contar los fotogramas entre el inicio del sonido (visible en la onda o en el gesto) y el primer cambio en pantalla.
3. Latencia = fotogramas ÷ 240. Repetir 10 veces y dar la mediana.

Objetivo: ≤ 60 ms en desktop y ≤ 120 ms en móvil.
