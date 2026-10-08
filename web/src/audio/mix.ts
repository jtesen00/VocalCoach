/**
 * Mezcla de la guía, como en un estudio pequeño:
 *  - melodía al frente, seca y clara;
 *  - acompañamiento detrás: más bajo, sin agudos que tapen la melodía y con más sala;
 *  - reverb de sala con predelay y agudos que se apagan antes que los graves;
 *  - compresor suave en la salida para que acordes + melodía nunca saturen.
 */
export interface Mix {
  melody: GainNode;
  accomp: GainNode;
  noise: AudioBuffer;
}

const mixes = new WeakMap<BaseAudioContext, Mix>();

/** Respuesta al impulso de una sala (~1,5 s): reflexiones tempranas + cola difusa que se oscurece. */
function roomImpulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.round(1.5 * sr);
  const pre = Math.round(0.014 * sr);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    // Reflexiones tempranas (distintas en cada canal: da anchura estéreo).
    for (let k = 0; k < 7; k++) {
      const i = pre + Math.round((0.004 + Math.random() * 0.05) * sr);
      d[i] += (Math.random() < 0.5 ? -1 : 1) * 0.5 * Math.exp(-k * 0.35);
    }
    // Cola: ruido con caída exponencial y paso bajo que se cierra con el tiempo.
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const cutoff = 0.5 * Math.exp(-t * 2.2) + 0.04; // coeficiente del filtro de un polo
      lp += cutoff * (Math.random() * 2 - 1 - lp);
      const fadeIn = Math.min(1, (i - pre) / (0.02 * sr));
      d[i] += lp * 2.2 * Math.exp(-t * 4.6) * fadeIn;
    }
  }
  return ir;
}

export function mix(ctx: BaseAudioContext): Mix {
  const cached = mixes.get(ctx);
  if (cached) return cached;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 3;
  comp.attack.value = 0.006;
  comp.release.value = 0.2;
  const out = ctx.createGain();
  out.gain.value = 1.15;
  comp.connect(out).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.normalize = true;
  reverb.buffer = roomImpulse(ctx);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  reverb.connect(reverbReturn).connect(comp);

  const melody = ctx.createGain();
  // Presencia: un poco de brillo en la zona donde el oído distingue mejor las notas.
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2500;
  presence.Q.value = 0.8;
  presence.gain.value = 2;
  melody.connect(presence).connect(comp);
  const melodySend = ctx.createGain();
  melodySend.gain.value = 0.16;
  presence.connect(melodySend).connect(reverb);

  const accomp = ctx.createGain();
  accomp.gain.value = 0.5;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2800;
  tone.Q.value = 0.5;
  const lowCut = ctx.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.frequency.value = 60;
  accomp.connect(lowCut).connect(tone).connect(comp);
  const accompSend = ctx.createGain();
  accompSend.gain.value = 0.32;
  tone.connect(accompSend).connect(reverb);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const m = { melody, accomp, noise };
  mixes.set(ctx, m);
  return m;
}
