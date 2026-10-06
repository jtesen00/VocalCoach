import { useState } from 'react';
import { LEARNING_PATH, pathState } from '../../core/progress/path';
import { localDay, summarize } from '../../core/progress/progress';
import { stars } from '../../shared/labels';
import { clearProgress, useAttempts } from '../../shared/progress-store';
import type { Settings } from '../../shared/settings';
import { Stars } from '../songs/Stars';
import { stepTitle } from './PathCard';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Progreso: racha, días practicados, evolución y mejor resultado por ejercicio. Todo en el dispositivo. */
export function ProgressPage({ settings }: { settings: Settings }) {
  const { attempts, ready } = useAttempts();
  const [confirm, setConfirm] = useState(false);
  if (!ready) return <p className="hint">Cargando tu progreso…</p>;
  const today = localDay(Date.now());
  const s = summarize(attempts, today);
  const done = pathState(attempts).filter((d) => d.status === 'done').length;
  const maxDay = Math.max(1, ...s.calendar.map((c) => c.attempts));
  // El calendario empieza en lunes: se rellenan huecos antes del primer día mostrado.
  const firstDow = (new Date(`${s.calendar[0].day}T12:00`).getDay() + 6) % 7;
  const items = [...s.byItem.values()].sort((a, b) => b.lastAt - a.lastAt);

  if (attempts.length === 0) {
    return (
      <section className="progress" aria-label="Progreso">
        <h2>Tu progreso</h2>
        <p>Aún no hay intentos. Haz tu primer ejercicio en <strong>Practicar</strong> y aquí verás tu racha, tus días y cómo mejoras.</p>
        <p className="hint">Tu progreso se guarda solo en este dispositivo.</p>
      </section>
    );
  }

  return (
    <section className="progress" aria-label="Progreso">
      <h2>Tu progreso</h2>
      <ul className="stat-tiles">
        <li><strong>🔥 {s.streak.current}</strong><span>{s.streak.current === 1 ? 'día de racha' : 'días seguidos'}</span></li>
        <li><strong>{done}/{LEARNING_PATH.length}</strong><span>días del camino</span></li>
        <li><strong>{s.daysPracticed}</strong><span>{s.daysPracticed === 1 ? 'día practicado' : 'días practicados'}</span></li>
        <li><strong>{s.minutes < 1 ? '< 1' : Math.round(s.minutes)}</strong><span>minutos cantando</span></li>
      </ul>
      {s.streak.best > s.streak.current && <p className="hint">Tu mejor racha: {s.streak.best} días.</p>}
      {!s.streak.practicedToday && s.streak.current > 0 && <p className="notice">Practica hoy para no perder tu racha.</p>}

      <h3>Tus días</h3>
      <div className="calendar" role="img" aria-label={`Has practicado ${s.calendar.filter((c) => c.attempts).length} de los últimos ${s.calendar.length} días`}>
        {WEEKDAYS.map((d) => <span key={d} className="dow">{d}</span>)}
        {Array.from({ length: firstDow }, (_, i) => <span key={`pad${i}`} />)}
        {s.calendar.map((c) => (
          <span
            key={c.day}
            className={`cell${c.day === today ? ' today' : ''}`}
            style={{ opacity: c.attempts ? 0.35 + (0.65 * c.attempts) / maxDay : 1 }}
            data-on={c.attempts > 0 || undefined}
            title={`${c.day}: ${c.attempts} ${c.attempts === 1 ? 'intento' : 'intentos'}`}
          />
        ))}
      </div>

      <h3>Cómo vas mejorando</h3>
      <p className="hint">Puntuación media de cada semana (la última es esta).</p>
      <div className="weekly" role="img" aria-label="Puntuación media por semana">
        {s.weekly.map((v, i) => (
          <span key={i} className="bar" title={v === null ? 'sin práctica' : `${Math.round(v)} %`}>
            <span style={{ height: `${v ?? 0}%` }} />
            {settings.showDetails && <small>{v === null ? '–' : Math.round(v)}</small>}
          </span>
        ))}
      </div>

      <h3>Tus mejores resultados</h3>
      <ul className="best-list">
        {items.map((it) => (
          <li key={it.itemId}>
            <span>{stepTitle({ kind: it.kind, itemId: it.itemId })}</span>
            <Stars value={stars(it.best, it.bestPassed)} max={3} label="Mejor resultado" />
            <span className="hint">
              {it.attempts} {it.attempts === 1 ? 'intento' : 'intentos'}
              {settings.showDetails && ` · mejor ${Math.round(it.best)} % · último ${Math.round(it.last)} %`}
            </span>
          </li>
        ))}
      </ul>
      {settings.showDetails && (
        <p className="hint">{s.attempts} intentos · {s.passed} superados ({Math.round((100 * s.passed) / s.attempts)} %).</p>
      )}

      <p className="hint">Tu progreso se guarda solo en este dispositivo.</p>
      {!confirm ? (
        <button className="link" onClick={() => setConfirm(true)}>Borrar mi progreso</button>
      ) : (
        <p className="notice warn">
          ¿Borrar todos tus intentos, tu racha y el camino? No se puede deshacer.{' '}
          <button onClick={() => { void clearProgress(); setConfirm(false); }}>Sí, borrar</button>{' '}
          <button className="link" onClick={() => setConfirm(false)}>Cancelar</button>
        </p>
      )}
    </section>
  );
}
