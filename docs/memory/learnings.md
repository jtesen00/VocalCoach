# Aprendizajes técnicos

- **npm 10.9 falla** con `Cannot read properties of null (reading 'edgesOut')` al resolver los peers opcionales de Vitest 4. Se usa **pnpm** (`packageManager` en `package.json`; esbuild en `onlyBuiltDependencies`).
- **`performance.now()` no existe dentro del AudioWorklet en Chromium**, así que el tiempo de cómputo del detector no se puede medir en el navegador. Se mide con `pnpm bench` (~0,35 ms por estimación en servidor).
- **TypeScript no trae `lib` de AudioWorklet**: en `pitch-worklet.ts` se declaran a mano `sampleRate`, `currentTime`, `registerProcessor` y `AudioWorkletProcessor`. El worklet se empaqueta con `import url from './pitch-worklet.ts?worker&url'`.
- **El nodo del worklet debe conectarse a la salida** (a través de una ganancia 0) para que el grafo lo procese.
- **`setTimeout` y el reloj de audio derivan unos ms**: las esperas sobre tiempos de audio deben reintentar hasta que `ctx.currentTime` alcance el objetivo, nunca suponer que el timer acierta.
- **Cada AudioContext empieza en t = 0**: hay que reiniciar los instantes guardados (como la supresión del micro) al recrearlo.
- **Plegar octavas punto a punto es ambiguo a un tritono**: en las sirenas se usa un único desplazamiento de octava calculado con la mediana.
- **Media ventana de latencia:** los frames se fechan al final de la ventana (2048 muestras ≈ 43 ms); al evaluar hay que restar media ventana más la latencia de entrada.
- **Playwright local:** usar `@playwright/test@1.56.1`, que coincide con el Chromium preinstalado (`/opt/pw-browsers`, build 1194). En CI se instala con `playwright install`.
- **Con vibrato, el error instantáneo frente a la referencia es de ~12 c (MPM)**: lo causa el promediado de la ventana y la mediana. Por eso se evalúa la mediana del intento, no frames sueltos.
- **Memoizar objetos derivados que alimentan planes**: `allPhrases(song)[i]` crea un objeto nuevo en cada render; si entra en las dependencias de `useMemo`, el plan cambia y `useExerciseRun` se reinicia (el botón Empezar "no hace nada").
- **Coma flotante en duraciones**: 4,8 − 3,6 = 1,1999…; las comparaciones de "nota larga" usan tolerancia (`isLong`).
- **Una frase repite notas**: para "intentos distintos" se cuenta una vez por evaluación (`NoteStat.seen`), no por aparición.
- **Estable pero desafinado no es éxito**: la estabilidad solo pondera lo acertado.
- **Transcripción a 16 kHz** (ventana 1024, salto 256): una canción de 4 minutos se analiza en pocos segundos en un Web Worker. `OfflineAudioContext` decodifica, mezcla a mono, remuestrea y filtra en un paso.
