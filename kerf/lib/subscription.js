/**
 * Subscription entitlements for KERF.
 * Sandbox purchases work offline via localStorage.
 * Native App Store / Play Billing can replace `purchase()` later (RevenueCat / StoreKit / Play Billing).
 */

export const PLANS = [
  {
    id: "free",
    name: "Ücretsiz",
    priceMonthly: 0,
    priceYearly: 0,
    badge: null,
    blurb: "Deneme ve hızlı şablonlar",
    features: [
      "Günde 3 dışa aktarım",
      "SVG export",
      "Temel line-art",
      "Kerf önizleme",
    ],
    limits: { exportsPerDay: 3, dxf: false, bothMode: false, noWatermark: false, sheets: ["a4", "300x200"] },
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 149,
    priceYearly: 1190,
    badge: "Popüler",
    blurb: "Atölye ve freelance için",
    features: [
      "Sınırsız SVG + DXF",
      "CUT + ENGRAVE katmanları",
      "Gelişmiş kerf & sac",
      "Filigransız çıktı",
      "Tüm malzeme hazır ayarları",
    ],
    limits: { exportsPerDay: Infinity, dxf: true, bothMode: true, noWatermark: true, sheets: "all" },
  },
  {
    id: "workshop",
    name: "Workshop",
    priceMonthly: 349,
    priceYearly: 2990,
    badge: "Atölye",
    blurb: "Ekip ve üretim hattı",
    features: [
      "Pro’daki her şey",
      "Öncelikli iş kuyruğu notu",
      "Toplu dışa aktarım hazırlığı",
      "Mağaza içi aile / ekip slotu*",
    ],
    limits: { exportsPerDay: Infinity, dxf: true, bothMode: true, noWatermark: true, sheets: "all", workshop: true },
  },
];

const KEY = "kerf.subscription.v1";
const USAGE_KEY = "kerf.usage.v1";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function loadSubscription() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || !raw.planId) return defaultSub();
    return raw;
  } catch {
    return defaultSub();
  }
}

function defaultSub() {
  return {
    planId: "free",
    billing: "monthly",
    status: "active",
    source: "sandbox",
    updatedAt: Date.now(),
    expiresAt: null,
  };
}

export function saveSubscription(sub) {
  localStorage.setItem(KEY, JSON.stringify(sub));
  return sub;
}

export function getPlan(planId = loadSubscription().planId) {
  return PLANS.find((p) => p.id === planId) || PLANS[0];
}

export function getLimits() {
  return getPlan().limits;
}

export function loadUsage() {
  try {
    const u = JSON.parse(localStorage.getItem(USAGE_KEY) || "null");
    if (!u || u.day !== today()) return { day: today(), exports: 0 };
    return u;
  } catch {
    return { day: today(), exports: 0 };
  }
}

export function recordExport() {
  const u = loadUsage();
  u.exports += 1;
  u.day = today();
  localStorage.setItem(USAGE_KEY, JSON.stringify(u));
  return u;
}

export function canExport(kind = "svg") {
  const limits = getLimits();
  const usage = loadUsage();
  if (kind === "dxf" && !limits.dxf) {
    return { ok: false, reason: "dxf", message: "DXF dışa aktarım Pro abonelik gerektirir." };
  }
  if (kind === "both" && (!limits.dxf || !limits.bothMode)) {
    return { ok: false, reason: "both", message: "SVG + DXF paketi Pro ile açılır." };
  }
  if (usage.exports >= limits.exportsPerDay) {
    return {
      ok: false,
      reason: "quota",
      message: `Günlük ücretsiz hak doldu (${limits.exportsPerDay}/gün). Pro’ya geçin.`,
    };
  }
  return { ok: true, remaining: limits.exportsPerDay - usage.exports };
}

/**
 * Sandbox purchase — replace with StoreKit / Play Billing / RevenueCat.
 * @returns {Promise<{ok:boolean, subscription: object}>}
 */
export async function purchase(planId, billing = "yearly") {
  if (planId === "free") {
    const sub = saveSubscription(defaultSub());
    return { ok: true, subscription: sub };
  }
  const plan = getPlan(planId);
  if (!plan || plan.id === "free") throw new Error("Geçersiz plan");

  // Simulate store sheet latency
  await new Promise((r) => setTimeout(r, 650));

  const expiresAt =
    billing === "yearly"
      ? Date.now() + 365 * 24 * 3600 * 1000
      : Date.now() + 30 * 24 * 3600 * 1000;

  const sub = saveSubscription({
    planId,
    billing,
    status: "active",
    source: "sandbox",
    productId: `kerf_${planId}_${billing}`,
    updatedAt: Date.now(),
    expiresAt,
  });
  return { ok: true, subscription: sub };
}

export async function restorePurchases() {
  await new Promise((r) => setTimeout(r, 400));
  const sub = loadSubscription();
  if (sub.planId !== "free" && sub.status === "active") {
    return { ok: true, subscription: sub, message: "Satın alımlar geri yüklendi (sandbox)." };
  }
  return { ok: false, subscription: sub, message: "Geri yüklenecek aktif abonelik bulunamadı." };
}

export function formatPrice(amount) {
  if (!amount) return "Ücretsiz";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function onboardingDone() {
  return localStorage.getItem("kerf.onboarding.v1") === "1";
}

export function setOnboardingDone() {
  localStorage.setItem("kerf.onboarding.v1", "1");
}
