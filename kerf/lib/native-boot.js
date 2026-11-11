/**
 * Capacitor native bootstrap — safe no-op on web.
 */
import { isNative, configureRevenueCat } from "./iap.js";

export async function bootNative() {
  if (!isNative()) return { native: false };

  const Cap = window.Capacitor;
  const Plugins = Cap?.Plugins || {};

  try {
    await Plugins.StatusBar?.setStyle?.({ style: "DARK" });
    await Plugins.StatusBar?.setBackgroundColor?.({ color: "#eef3f8" });
  } catch {
    /* optional */
  }

  try {
    await Plugins.SplashScreen?.hide?.();
  } catch {
    /* optional */
  }

  // Inject public RevenueCat key via meta tag if present:
  // <meta name="kerf-rc-key" content="appl_xxx or goog_xxx">
  const meta = document.querySelector('meta[name="kerf-rc-key"]');
  const key = meta?.getAttribute("content");
  if (key) {
    try {
      await configureRevenueCat(key);
    } catch (e) {
      console.warn("RevenueCat configure failed", e);
    }
  }

  try {
    Plugins.App?.addListener?.("appStateChange", ({ isActive }) => {
      if (isActive) window.dispatchEvent(new CustomEvent("kerf:resume"));
    });
  } catch {
    /* optional */
  }

  return { native: true, platform: Cap.getPlatform?.() };
}
