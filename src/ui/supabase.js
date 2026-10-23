/* Cliente REST mínimo de Supabase (igual que la referencia). */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const SUPABASE_CONFIGURED =
  SUPABASE_URL.indexOf('tu-proyecto') === -1 && SUPABASE_ANON_KEY.indexOf('tu-anon-key') === -1 &&
  SUPABASE_URL.indexOf('PEGAR') === -1 && SUPABASE_ANON_KEY.indexOf('PEGAR') === -1;

function headers() {
  return { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
}
export function supabaseGet(path) {
  return fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: headers(), cache: 'no-store' });
}
export function supabaseSend(path, method, body, prefer) {
  const h = headers();
  if (prefer) h['Prefer'] = prefer;
  return fetch(SUPABASE_URL + '/rest/v1/' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
}
/* Lectura con reintentos (1 reintento = 2 intentos en total). */
export function supabaseGetWithRetry(path, attempts) {
  const max = attempts || 2;
  function attempt(n) {
    return supabaseGet(path)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(err => { if (n < max) return attempt(n + 1); throw err; });
  }
  return attempt(1);
}
