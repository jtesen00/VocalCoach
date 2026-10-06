#!/usr/bin/env python3
"""
Prepara los sonidos grabados de la guía (`public/samples/`).

Para cada instrumento toma una nota cada 3 semitonos (C, D#, F#, A) de C2 a C7 y:
  1. la pasa a mono 44,1 kHz y recorta el silencio inicial;
  2. mide su afinación real (centésimas) para corregirla al tocar;
  3. iguala el volumen entre notas;
  4. en los instrumentos que derivan de altura (silbido, flauta, voz), la corrige nota a nota
     ("afinación plana": la guía debe ser una referencia exacta; el vibrato se añade al tocar);
  5. en los instrumentos sostenidos, prepara un bucle con fundido cruzado ya aplicado
     para que las notas largas se mantengan sin cortes ni clics;
  6. junta todas las notas en un único MP3 ("sprite") con ranuras de duración fija.

Genera `public/samples/<id>.mp3` y `public/samples/manifest.json`.

Fuentes (ver `public/samples/CREDITS.md`):
  piano    Salamander Grand Piano          https://raw.githubusercontent.com/Tonejs/audio/master/salamander/<C4|Ds4|Fs4|A4>.mp3
  voz      FluidR3_GM voice_oohs           https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/voice_oohs-mp3.js
  silbido  MusyngKite whistle              .../MusyngKite/whistle-mp3.js
  flauta   FluidR3_GM flute                .../FluidR3_GM/flute-mp3.js
  cuerdas  MusyngKite string_ensemble_1    .../MusyngKite/string_ensemble_1-mp3.js

Uso: python3 scripts/build-samples.py <carpeta_fuentes>
  donde <carpeta_fuentes> contiene `sal/<C4|Ds4|...>.mp3` y `<Soundfont>_<instrumento>/<C4|Eb4|...>.mp3`
  (los .js de midi-js-soundfonts se extraen con `--extract`). Requiere numpy y ffmpeg.
"""
import base64
import glob
import json
import os
import re
import subprocess
import sys

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'samples')
NOTES = [m for m in range(36, 97, 3)]  # C2 … C7
SHARP = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B']
FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

INSTRUMENTS = {
    # slot: duración de cada ranura (s). sustain: bucle para notas largas.
    'piano': {'src': 'sal/{sharp}.mp3', 'slot': 4.0, 'sustain': False, 'kbps': 96},
    'voz': {'src': 'FluidR3_GM_voice_oohs/{flat}.mp3', 'slot': 2.6, 'sustain': True, 'kbps': 80, 'flatten': True},
    'silbido': {'src': 'MusyngKite_whistle/{flat}.mp3', 'slot': 2.6, 'sustain': True, 'kbps': 80, 'flatten': True},
    'flauta': {'src': 'MusyngKite_flute/{flat}.mp3', 'slot': 2.6, 'sustain': True, 'kbps': 80, 'flatten': True},
    'cuerdas': {'src': 'MusyngKite_string_ensemble_1/{flat}.mp3', 'slot': 2.6, 'sustain': True, 'kbps': 80},
}

PRE_ROLL = 0.004  # s antes del ataque
LOOP_START = 0.9  # s (tras el ataque)
XFADE = 0.35  # s de fundido cruzado del bucle


def name(midi, table):
    return f'{table[midi % 12]}{midi // 12 - 1}'


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def onset(x):
    env = np.abs(x)
    thr = 0.02 * env.max()
    i = int(np.argmax(env > thr))
    return max(0, i - int(PRE_ROLL * SR))


def pitch_cents(x, midi, harmonics=(1, 2, 3)):
    """Desviación media (centésimas) del parcial fundamental respecto a la nota nominal."""
    f0 = 440 * 2 ** ((midi - 69) / 12)
    seg = x[int(0.35 * SR):int(1.6 * SR)]
    if len(seg) < 4096:
        seg = x
    n = 1 << 18
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n))
    fr = np.fft.rfftfreq(n, 1 / SR)
    # Se busca el fundamental y se confirma con el 2.º parcial (los graves tienen el fundamental débil).
    best = None
    for k in harmonics:
        m = (fr > f0 * k * 0.97) & (fr < f0 * k * 1.03)
        if not m.any():
            continue
        i = np.argmax(spec * m)
        # Interpolación parabólica.
        a, b, c = np.log(spec[i - 1:i + 2] + 1e-12)
        p = 0.5 * (a - c) / (a - 2 * b + c)
        f = (i + p) * SR / n / k
        if best is None or spec[i] > best[0]:
            best = (spec[i], f)
    return 1200 * np.log2(best[1] / f0)


def f0_track(x, midi, hop=441, win=4096):
    """Frecuencia fundamental cada `hop` muestras (Hz). Se sigue el parcial más fuerte entre los
    tres primeros (en los graves el fundamental puede ser débil) y se divide por su orden."""
    f0 = 440 * 2 ** ((midi - 69) / 12)
    n = 1 << 15
    fr = np.fft.rfftfreq(n, 1 / SR)
    w = np.hanning(win)
    specs = [np.abs(np.fft.rfft(x[i:i + win] * w, n)) for i in range(0, len(x) - win, hop)]
    mean = np.mean(specs, axis=0)
    bands = {k: np.nonzero((fr > f0 * k * 0.94) & (fr < f0 * k * 1.06))[0] for k in (1, 2, 3)}
    k = max(bands, key=lambda h: mean[bands[h]].max())
    idx = bands[k]
    out = []
    for spec in specs:
        j = idx[np.argmax(spec[idx])]
        a, b, c = np.log(spec[j - 1:j + 2] + 1e-12)
        p = 0.5 * (a - c) / (a - 2 * b + c)
        out.append((j + p) * SR / n / k)
    return np.array(out), hop, win


def flatten_pitch(x, midi):
    """Re-muestrea con velocidad variable para que la nota quede fija en su altura nominal."""
    f, hop, win = f0_track(x, midi)
    target = 440 * 2 ** ((midi - 69) / 12)
    # Suavizado (~50 ms) para no seguir el ruido de la medida.
    k = 5
    fs = np.convolve(np.pad(f, (k, k), mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), mode='valid')
    t_frames = np.arange(len(fs)) * hop + win / 2
    ratio = np.interp(np.arange(len(x)), t_frames, fs / target)  # >1: la grabación está alta
    # Posición de lectura: avanza 1/ratio muestras por muestra de salida.
    pos = np.cumsum(1 / ratio)
    pos = pos[pos < len(x) - 1]
    i = pos.astype(int)
    frac = pos - i
    return x[i] * (1 - frac) + x[i + 1] * frac


def loop_xfade(y, loop_len, loop_end):
    """Funde el final del bucle con lo que precede a su inicio: al saltar de loop_end a loop_start no hay discontinuidad.
    El bucle dura un número entero de periodos: los dos tramos fundidos están en fase (sin batidos)."""
    n = int(XFADE * SR)
    e = int(round(loop_end * SR))
    s = e - int(round(loop_len * SR))
    a = np.linspace(0, 1, n)
    ga, gb = np.sqrt(1 - a), np.sqrt(a)
    y = y.copy()
    y[e - n:e] = y[e - n:e] * ga + y[s - n:s] * gb
    return y


def process(cfg, src_dir):
    slot = cfg['slot']
    out = []
    meta = []
    for midi in NOTES:
        path = os.path.join(src_dir, cfg['src'].format(sharp=name(midi, SHARP), flat=name(midi, FLAT)))
        x = load(path)
        x = x[onset(x):]
        if cfg.get('flatten'):
            x = flatten_pitch(x, midi)
        tune = float(pitch_cents(x, midi, harmonics=(1,) if not cfg['sustain'] else (1, 2, 3)))
        y = np.zeros(int(slot * SR))
        n = min(len(y), len(x))
        y[:n] = x[:n]
        # Volumen: RMS de la parte estable (los sostenidos) o del primer segundo (piano).
        ref = y[int(0.3 * SR):int(1.5 * SR)] if cfg['sustain'] else y[:int(1.0 * SR)]
        rms = np.sqrt(np.mean(ref ** 2)) + 1e-9
        y *= 0.12 / rms
        entry = {'midi': midi, 'tune': round(tune, 1)}
        if cfg['sustain']:
            loop_end = slot - 0.02
            period = 1 / (440 * 2 ** ((midi - 69) / 12 + tune / 1200))
            loop_len = round((loop_end - LOOP_START) / period) * period
            loop_len = round(loop_len * SR) / SR
            y = loop_xfade(y, loop_len, loop_end)
            y[int(round(loop_end * SR)):] = 0
            entry['loop'] = [round(loop_end - loop_len, 6), round(loop_end, 6)]
        else:
            # Piano: caída final suave para que la ranura termine en silencio.
            f = int(0.4 * SR)
            y[-f:] *= np.linspace(1, 0, f) ** 2
        out.append(y)
        meta.append(entry)
    allv = np.concatenate(out)
    peak = np.abs(allv).max()
    if peak > 0.95:
        allv *= 0.95 / peak
    return allv, meta


def encode(y, path, kbps):
    pcm = (np.clip(y, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', path], input=pcm, check=True)


def extract(src_dir):
    for f in glob.glob(os.path.join(src_dir, '*.js')):
        d = f[:-3]
        os.makedirs(d, exist_ok=True)
        txt = open(f).read()
        for k, v in re.findall(r'"([A-G]b?\d)":\s*"data:audio/mp3;base64,([^"]+)"', txt):
            open(os.path.join(d, f'{k}.mp3'), 'wb').write(base64.b64decode(v))


def main():
    src = sys.argv[1]
    if '--extract' in sys.argv:
        extract(src)
    os.makedirs(OUT, exist_ok=True)
    manifest = {'sampleRate': SR, 'instruments': {}}
    for iid, cfg in INSTRUMENTS.items():
        y, meta = process(cfg, src)
        encode(y, os.path.join(OUT, f'{iid}.mp3'), cfg['kbps'])
        manifest['instruments'][iid] = {
            'file': f'{iid}.mp3',
            'slot': cfg['slot'],
            'sustain': cfg['sustain'],
            'preRoll': PRE_ROLL,
            'notes': meta,
        }
        tunes = [m['tune'] for m in meta]
        print(f'{iid:8s} afinación medida: media {np.mean(tunes):+.1f} c, máx |{np.max(np.abs(tunes)):.1f}| c')
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=1)


if __name__ == '__main__':
    main()
