import { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../../audio/engine';
import type { GuideEvent } from '../../core/exercises/guide';

/** Reproduce una guía (frase o melodía entera) con la posibilidad de pararla. */
export function ListenButton({ events, label, playingLabel = '■ Parar', className }: { events: () => GuideEvent[]; label: string; playingLabel?: string; className?: string }) {
  const [playing, setPlaying] = useState(false);
  const run = useRef(0);
  useEffect(() => () => {
    if (run.current) audioEngine.stopGuide();
  }, []);
  const toggle = async () => {
    if (playing) {
      run.current = 0;
      audioEngine.stopGuide();
      setPlaying(false);
      return;
    }
    const id = ++run.current;
    setPlaying(true);
    await audioEngine.playGuide(events()).done;
    if (run.current === id) {
      run.current = 0;
      setPlaying(false);
    }
  };
  return (
    <button className={className} onClick={toggle} aria-pressed={playing}>
      {playing ? playingLabel : label}
    </button>
  );
}
