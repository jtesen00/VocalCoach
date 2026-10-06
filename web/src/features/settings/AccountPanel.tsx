import { useState } from 'react';
import { ApiError } from '../../api/client';
import { accountStore, login, logout, pendingCount, register, syncNow } from '../../shared/account';
import { useAttempts } from '../../shared/progress-store';

const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? 'hace un momento' : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
};

/** Ajustes → Tu cuenta (opcional): copia de seguridad y sincronización entre dispositivos. */
export function AccountPanel() {
  const account = accountStore.use();
  useAttempts(); // refresca el contador de pendientes
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (account.user) {
    const pending = pendingCount();
    return (
      <fieldset>
        <legend>Tu cuenta</legend>
        <p>
          <strong>{account.user.displayName}</strong> <span className="hint">({account.user.email})</span>
        </p>
        <p className="hint" role="status">
          {account.syncError
            ? `No se pudo sincronizar: ${account.syncError}`
            : pending
              ? `${pending} ${pending === 1 ? 'intento pendiente' : 'intentos pendientes'} de subir.`
              : account.lastSyncAt
                ? `✓ Todo sincronizado (${ago(account.lastSyncAt)}).`
                : 'Sincronizando…'}
        </p>
        <p>
          <button onClick={() => void syncNow()}>Sincronizar ahora</button>{' '}
          <button className="link" onClick={() => void logout()}>Cerrar sesión</button>
        </p>
      </fieldset>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await register(form.email, form.password, form.name);
      else await login(form.email, form.password);
      setForm({ email: '', password: '', name: '' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset>
      <legend>Tu cuenta (opcional)</legend>
      <p className="hint">Sin cuenta todo funciona igual en este dispositivo. Con cuenta, tu progreso se guarda en el servidor y lo ves en todos tus dispositivos. Tu voz nunca se sube.</p>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === 'register' && (
          <label>Tu nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required maxLength={50} /></label>
        )}
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required /></label>
        <label>
          Contraseña
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 8 : 1} />
        </label>
        <p>
          <button className="primary" disabled={busy}>{busy ? 'Un momento…' : mode === 'register' ? 'Crear cuenta' : 'Entrar'}</button>{' '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            {mode === 'login' ? '¿No tienes cuenta? Crear una' : 'Ya tengo cuenta'}
          </button>
        </p>
      </form>
      {error && <p className="notice error" role="alert">{error}</p>}
    </fieldset>
  );
}
