import { store } from '../engine/store';

/** SHA of a newer deployed build, or null while we're up to date. */
export const newVersion = store<string | null>(null);

const POLL_MS = 10_000;

async function check() {
  if (document.visibilityState !== 'visible' || newVersion.get()) return;
  try {
    // Query string + no-store bypasses both the browser and GitHub Pages caches.
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return; // dev server has no version.json
    const { sha } = (await res.json()) as { sha?: string };
    if (sha && sha !== __BUILD_SHA__) newVersion.set(sha);
  } catch {
    /* offline */
  }
}

/** Reload with a cache-busting URL so the new index.html is fetched, not the cached one. */
export function applyUpdate() {
  const params = new URLSearchParams(location.search);
  params.set('v', newVersion.get() ?? String(Date.now()));
  location.replace(`${location.pathname}?${params}`);
}

export function startUpdateChecks() {
  if (import.meta.env.DEV) return;
  setInterval(check, POLL_MS);
  document.addEventListener('visibilitychange', check);
  check();
}
