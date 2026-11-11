/**
 * Store IAP bridge for KERF.
 * - Web / sandbox: localStorage entitlements (existing subscription.js)
 * - Native: expects Capacitor plugin `Purchases` (RevenueCat) OR
 *   custom `KerfBilling` plugin exposing getProducts / purchase / restore.
 *
 * Product IDs (create identically in App Store Connect + Play Console):
 *   kerf_pro_monthly, kerf_pro_yearly,
 *   kerf_workshop_monthly, kerf_workshop_yearly
 */

import { purchase as sandboxPurchase, restorePurchases as sandboxRestore, saveSubscription } from "./subscription.js";

export const PRODUCT_IDS = {
  pro_monthly: "kerf_pro_monthly",
  pro_yearly: "kerf_pro_yearly",
  workshop_monthly: "kerf_workshop_monthly",
  workshop_yearly: "kerf_workshop_yearly",
};

export function isNative() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

function getPlugin(name) {
  try {
    return window.Capacitor?.Plugins?.[name] || null;
  } catch {
    return null;
  }
}

/** Map product id → plan + billing */
export function planFromProductId(productId) {
  if (!productId) return null;
  if (productId.includes("workshop")) {
    return { planId: "workshop", billing: productId.includes("year") ? "yearly" : "monthly" };
  }
  if (productId.includes("pro")) {
    return { planId: "pro", billing: productId.includes("year") ? "yearly" : "monthly" };
  }
  return null;
}

export function productIdFor(planId, billing) {
  if (planId === "free") return null;
  const key = `${planId}_${billing === "yearly" ? "yearly" : "monthly"}`;
  return PRODUCT_IDS[key] || null;
}

/**
 * Fetch store products when native billing is available.
 */
export async function getProducts() {
  if (!isNative()) {
    return Object.entries(PRODUCT_IDS).map(([key, id]) => ({
      id,
      key,
      title: id,
      priceString: "Sandbox",
      sandbox: true,
    }));
  }

  const purchases = getPlugin("Purchases");
  if (purchases?.getOfferings) {
    const offerings = await purchases.getOfferings();
    const pkgs = offerings?.current?.availablePackages || [];
    return pkgs.map((p) => ({
      id: p.product?.identifier || p.identifier,
      title: p.product?.title,
      priceString: p.product?.priceString,
      package: p,
      source: "revenuecat",
    }));
  }

  const billing = getPlugin("KerfBilling");
  if (billing?.getProducts) {
    return billing.getProducts({ productIds: Object.values(PRODUCT_IDS) });
  }

  return [];
}

/**
 * Purchase a plan. Uses RevenueCat / KerfBilling on native, sandbox on web.
 */
export async function purchasePlan(planId, billing = "yearly") {
  if (planId === "free") {
    return sandboxPurchase("free", billing);
  }

  const productId = productIdFor(planId, billing);

  if (isNative()) {
    const purchases = getPlugin("Purchases");
    if (purchases?.purchasePackage || purchases?.purchaseStoreProduct) {
      const products = await getProducts();
      const match = products.find((p) => p.id === productId) || products[0];
      if (!match) throw new Error("Product not found in store");
      let result;
      if (match.package && purchases.purchasePackage) {
        result = await purchases.purchasePackage({ aPackage: match.package });
      } else {
        result = await purchases.purchaseStoreProduct({ product: match });
      }
      const active = result?.customerInfo?.entitlements?.active || {};
      const entitled = active.pro || active.workshop || active[planId];
      if (!entitled && !result?.productIdentifier) {
        throw new Error("Purchase not completed");
      }
      const sub = saveSubscription({
        planId,
        billing,
        status: "active",
        source: "appstore",
        productId: productId || result?.productIdentifier,
        updatedAt: Date.now(),
        expiresAt: entitled?.expirationDate ? Date.parse(entitled.expirationDate) : null,
      });
      return { ok: true, subscription: sub };
    }

    const billingPlugin = getPlugin("KerfBilling");
    if (billingPlugin?.purchase) {
      const result = await billingPlugin.purchase({ productId });
      const sub = saveSubscription({
        planId,
        billing,
        status: "active",
        source: result.platform || "store",
        productId,
        updatedAt: Date.now(),
        expiresAt: result.expiresAt || null,
        purchaseToken: result.purchaseToken || null,
      });
      return { ok: true, subscription: sub };
    }

    // Native shell without billing plugin yet → sandbox so UI keeps working
    const fallback = await sandboxPurchase(planId, billing);
    fallback.subscription.source = "sandbox-native";
    saveSubscription(fallback.subscription);
    return fallback;
  }

  return sandboxPurchase(planId, billing);
}

export async function restorePlan() {
  if (isNative()) {
    const purchases = getPlugin("Purchases");
    if (purchases?.restorePurchases) {
      const info = await purchases.restorePurchases();
      const active = info?.customerInfo?.entitlements?.active || info?.entitlements?.active || {};
      if (active.workshop) {
        const sub = saveSubscription({
          planId: "workshop",
          billing: "yearly",
          status: "active",
          source: "appstore",
          productId: PRODUCT_IDS.workshop_yearly,
          updatedAt: Date.now(),
          expiresAt: active.workshop.expirationDate ? Date.parse(active.workshop.expirationDate) : null,
        });
        return { ok: true, subscription: sub, message: "Restored Workshop" };
      }
      if (active.pro) {
        const sub = saveSubscription({
          planId: "pro",
          billing: "yearly",
          status: "active",
          source: "appstore",
          productId: PRODUCT_IDS.pro_yearly,
          updatedAt: Date.now(),
          expiresAt: active.pro.expirationDate ? Date.parse(active.pro.expirationDate) : null,
        });
        return { ok: true, subscription: sub, message: "Restored Pro" };
      }
      return { ok: false, subscription: null, message: "No active subscription" };
    }

    const billingPlugin = getPlugin("KerfBilling");
    if (billingPlugin?.restore) {
      const result = await billingPlugin.restore();
      const mapped = planFromProductId(result?.productId);
      if (!mapped) return { ok: false, subscription: null, message: "Nothing to restore" };
      const sub = saveSubscription({
        ...mapped,
        status: "active",
        source: result.platform || "store",
        productId: result.productId,
        updatedAt: Date.now(),
        expiresAt: result.expiresAt || null,
      });
      return { ok: true, subscription: sub, message: "Restored" };
    }
  }

  return sandboxRestore();
}

/** Optional RevenueCat configure — call once at native boot with public SDK key from env injection */
export async function configureRevenueCat(apiKey, appUserId) {
  if (!isNative() || !apiKey) return false;
  const purchases = getPlugin("Purchases");
  if (!purchases?.configure) return false;
  await purchases.configure({ apiKey, appUserID: appUserId || null });
  return true;
}
