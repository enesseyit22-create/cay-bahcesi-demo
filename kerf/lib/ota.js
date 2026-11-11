/**
 * KERF OTA — over-the-air update checks for PWA (+ Capacitor-ready hooks).
 *
 * Host `ota-manifest.json` on any HTTPS CDN / GitHub raw / your server.
 * Override remote URL anytime: localStorage kerf.ota.manifestUrl
 *   e.g. https://cdn.example.com/kerf/ota-manifest.json
 */

export const APP_VERSION = "1.2.0";
export const APP_BUILD = 12;
export const DEFAULT_MANIFEST = "./ota-manifest.json";

const LS_URL = "kerf.ota.manifestUrl";
const LS_IGNORED = "kerf.ota.ignoredBuild";
const LS_LAST = "kerf.ota.lastCheck";

export function getManifestUrl() {
  try {
    return localStorage.getItem(LS_URL) || DEFAULT_MANIFEST;
  } catch {
    return DEFAULT_MANIFEST;
  }
}

export function setManifestUrl(url) {
  const v = (url || "").trim();
  if (!v) localStorage.removeItem(LS_URL);
  else localStorage.setItem(LS_URL, v);
  return getManifestUrl();
}

function parseBuild(manifest) {
  const b = Number(manifest?.build);
  if (Number.isFinite(b)) return b;
  // fallback: encode semver as rough build
  const m = String(manifest?.version || "0.0.0").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return 0;
  return (+m[1] * 100000) + (+m[2] * 1000) + (+m[3]);
}

export async function fetchManifest(url = getManifestUrl(), { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const u = new URL(url, location.href);
    u.searchParams.set("_", String(Date.now())); // bust CDN/browser cache
    const res = await fetch(u.toString(), {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`OTA ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{
 *   status: 'upToDate'|'available'|'forced'|'error',
 *   local: {version:string, build:number},
 *   remote?: object,
 *   notes?: string,
 *   error?: string
 * }>}
 */
export async function checkForUpdate({ lang = "en" } = {}) {
  const local = { version: APP_VERSION, build: APP_BUILD };
  try {
    const remote = await fetchManifest();
    const remoteBuild = parseBuild(remote);
    const minBuild = Number(remote.minBuild) || 1;
    localStorage.setItem(LS_LAST, String(Date.now()));

    if (remoteBuild <= APP_BUILD) {
      return { status: "upToDate", local, remote, notes: pickNotes(remote, lang) };
    }

    const ignored = Number(localStorage.getItem(LS_IGNORED) || 0);
    const forced = !!remote.force || APP_BUILD < minBuild;
    if (!forced && ignored === remoteBuild) {
      return { status: "upToDate", local, remote, notes: pickNotes(remote, lang), deferred: true };
    }

    return {
      status: forced ? "forced" : "available",
      local,
      remote,
      remoteBuild,
      notes: pickNotes(remote, lang),
    };
  } catch (e) {
    return { status: "error", local, error: e.message || String(e) };
  }
}

function pickNotes(remote, lang) {
  const notes = remote?.notes;
  if (!notes) return "";
  if (typeof notes === "string") return notes;
  return notes[lang] || notes.en || notes.tr || Object.values(notes)[0] || "";
}

export function ignoreUpdate(build) {
  localStorage.setItem(LS_IGNORED, String(build));
}

export async function clearAppCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
}

/** Ask waiting service worker to activate, then reload. */
export async function applyUpdate({ hard = true } = {}) {
  try {
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      // also poke update
      await reg?.update?.();
    }
  } catch {
    /* ignore */
  }

  if (hard) await clearAppCaches();

  // Capacitor Live Update hook (Capgo / Appflow) — no-op on web
  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      const mod = window.Capacitor.Plugins?.CapacitorUpdater;
      if (mod?.download && mod?.set) {
        // Native plugins manage bundle swap; web reload still helps WebView assets
      }
    }
  } catch {
    /* ignore */
  }

  const url = new URL(location.href);
  url.searchParams.set("ota", String(Date.now()));
  location.replace(url.toString());
}

export function watchServiceWorker(onUpdateReady) {
  if (!navigator.serviceWorker) return () => {};
  let regRef = null;
  navigator.serviceWorker.ready.then((reg) => {
    regRef = reg;
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          onUpdateReady?.({ source: "serviceWorker" });
        }
      });
    });
  });
  const onController = () => onUpdateReady?.({ source: "controllerchange", reloading: true });
  navigator.serviceWorker.addEventListener("controllerchange", onController);
  return () => {
    navigator.serviceWorker.removeEventListener("controllerchange", onController);
    regRef = null;
  };
}

export function lastCheckLabel() {
  const ts = Number(localStorage.getItem(LS_LAST) || 0);
  if (!ts) return null;
  return new Date(ts);
}
