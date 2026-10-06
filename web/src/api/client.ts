/**
 * Cliente de la API (Fase 6). La cuenta es opcional: sin ella todo funciona en el
 * dispositivo. En desarrollo, `/api` se reenvía al backend local (vite.config.ts);
 * publicado, la URL sale de VITE_API_URL (es pública, no es un secreto).
 */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...rest.headers },
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.', 0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const p = body as { detail?: string; code?: string; title?: string } | null;
    const message = res.status === 429 ? 'Demasiados intentos. Espera un minuto.' : (p?.detail ?? `Error del servidor (${res.status}).`);
    throw new ApiError(message, res.status, p?.code ?? p?.title ?? null);
  }
  return body as T;
}
