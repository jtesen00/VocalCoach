/// <reference types="vite-plugin-pwa/react" />
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Fase 7 — PWA: aviso de actualización, instalación, estado sin conexión y almacenamiento
 * persistente. El service worker (vite-plugin-pwa) guarda la app y los sonidos para usarla
 * sin internet; en desarrollo no se registra.
 */

/** "Hay una versión nueva": se actualiza cuando el usuario quiere (nunca a mitad de un ejercicio). */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (needRefresh) {
    return (
      <p className="notice pwa-banner" role="status">
        Hay una versión nueva de Vocal Coach.{' '}
        <button className="small primary" onClick={() => void updateServiceWorker(true)}>Actualizar</button>{' '}
        <button className="small" onClick={() => setNeedRefresh(false)}>Más tarde</button>
      </p>
    );
  }
  if (offlineReady) {
    return (
      <p className="notice pwa-banner" role="status">
        ✓ Lista para usar sin internet.{' '}
        <button className="small" onClick={() => setOfflineReady(false)}>Vale</button>
      </p>
    );
  }
  return null;
}

const onlineSubscribe = (l: () => void) => {
  window.addEventListener('online', l);
  window.addEventListener('offline', l);
  return () => {
    window.removeEventListener('online', l);
    window.removeEventListener('offline', l);
  };
};

/** true si hay conexión (para el profe con IA, lo único que la necesita). */
export function useOnline(): boolean {
  return useSyncExternalStore(onlineSubscribe, () => navigator.onLine);
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // se ofrece desde Ajustes, no con el aviso del navegador
    deferred = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installListeners.forEach((l) => l());
  });
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Ajustes → Instalar la app. */
export function InstallSection() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    installListeners.add(l);
    return () => void installListeners.delete(l);
  }, []);
  if (isStandalone()) return <p className="hint">✓ Estás usando la app instalada.</p>;
  if (deferred) {
    return (
      <p>
        <button
          className="primary"
          onClick={async () => {
            const e = deferred!;
            await e.prompt();
            await e.userChoice;
            deferred = null;
            force((n) => n + 1);
          }}
        >
          📲 Instalar Vocal Coach
        </button>{' '}
        <span className="hint">Se abre como una app y funciona sin internet.</span>
      </p>
    );
  }
  if (isIos()) return <p className="hint">Para instalarla en iPhone o iPad: botón <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>.</p>;
  return <p className="hint">Para instalarla, usa la opción «Instalar» o «Añadir a pantalla de inicio» del menú de tu navegador.</p>;
}
