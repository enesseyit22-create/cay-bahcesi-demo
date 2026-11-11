import {
  loadImageFromFile,
  drawImageToCanvas,
  processToBinary,
  paintBinary,
} from "./lib/preprocess.js";
import { vectorize, buildPreviewSvg } from "./lib/vectorize.js";
import { pathsToDxf, downloadText, stampName } from "./lib/dxf.js";
import {
  MATERIALS,
  SHEET_PRESETS,
  buildJob,
  buildExportSvg,
} from "./lib/cam.js";
import {
  PLANS,
  loadSubscription,
  getPlan,
  getLimits,
  loadUsage,
  recordExport,
  canExport,
  purchase,
  restorePurchases,
  formatPrice,
  onboardingDone,
  setOnboardingDone,
  saveSubscription,
} from "./lib/subscription.js";
import {
  LASER_PRESETS,
  summarizeJobCalc,
  mmToInch,
  inchToMm,
  pxAtDpiToMm,
  scaleFromWidth,
} from "./lib/calc.js";
import {
  initI18n,
  applyI18n,
  t,
  setLang,
  getLang,
  LANGS,
} from "./lib/i18n.js";
import {
  APP_VERSION,
  APP_BUILD,
  checkForUpdate,
  applyUpdate,
  ignoreUpdate,
  getManifestUrl,
  setManifestUrl,
  watchServiceWorker,
} from "./lib/ota.js";

function formatDurationI18n(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return t("dur.sec", { n: sec.toFixed(1) });
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return t("dur.min", { m, s });
  const h = Math.floor(m / 60);
  return t("dur.hr", { h, m: m % 60 });
}

function fillLangSelects() {
  for (const sel of [$("#langSelect"), $("#langSelectAccount")]) {
    if (!sel) continue;
    sel.innerHTML = "";
    for (const l of LANGS) {
      const o = document.createElement("option");
      o.value = l.code;
      o.textContent = l.label;
      if (l.code === getLang()) o.selected = true;
      sel.appendChild(o);
    }
  }
}

function refreshLanguage(code) {
  if (code) setLang(code);
  applyI18n();
  fillLangSelects();
  // re-translate option labels inside selects that use data-i18n
  document.querySelectorAll("option[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  refreshSubscriptionUI();
  refreshOtaLabels();
  if (latestOta) showOtaBanner(latestOta);
  if (!$("#view-calc").hidden) runCalc();
  if (!$("#view-cam").hidden) refreshCam();
  if (!$("#view-export").hidden) refreshExport();
  // onboarding next label
  const onbNext = $("#onbNext");
  if (onbNext && typeof onbIndex !== "undefined") {
    onbNext.textContent = onbIndex >= 2 ? t("onb.start") : t("onb.next");
  }
}

const state = {
  sourceReady: false,
  binary: null,
  width: 0,
  height: 0,
  cut: [],
  engrave: [],
  stats: {},
  job: null,
  preset: "sketch",
  billing: "yearly",
};

const $ = (sel) => document.querySelector(sel);
const sourceCanvas = $("#sourceCanvas");
const processCanvas = $("#processCanvas");
const sourceEmpty = $("#sourceEmpty");
const studioStatus = $("#studioStatus");
const svgPreview = $("#svgPreview");
const camSvgPreview = $("#camSvgPreview");
const cutPreview = $("#cutPreview");
const camDialog = $("#camDialog");
const liveVideo = $("#liveVideo");
const snapCanvas = $("#snapCanvas");
const paywall = $("#paywall");

let mediaStream = null;
let overlayRaf = 0;

/* ---------- UI chrome ---------- */
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2800);
}

function refreshSubscriptionUI() {
  const sub = loadSubscription();
  const plan = getPlan(sub.planId);
  const usage = loadUsage();
  const limits = getLimits();
  const remain = Number.isFinite(limits.exportsPerDay)
    ? Math.max(0, limits.exportsPerDay - usage.exports)
    : "∞";

  const planName = t(`plan.${plan.id}.name`);
  $("#planBadge").textContent = planName;
  $("#metricExports").textContent = String(usage.exports);
  $("#metricRemain").textContent = String(remain);
  $("#metricPlan").textContent = plan.id === "free" ? t("brand.free") : planName;
  $("#exportPlanPill").textContent = planName;
  $("#accountPlanName").textContent = planName;
  $("#accountPlanMeta").textContent = `${sub.source === "sandbox" ? "Sandbox" : "Store"} · ${
    sub.billing || "—"
  } · ${sub.productId || "kerf_free"}`;

  const locked = !limits.dxf;
  $("#cardDxf").classList.toggle("is-locked", locked);
  $("#cardBoth").classList.toggle("is-locked", locked);
  renderPlanCards();
}

function renderPlanCards() {
  const host = $("#planCards");
  if (!host) return;
  const current = loadSubscription().planId;
  host.innerHTML = "";
  for (const plan of PLANS) {
    const price =
      plan.id === "free"
        ? t("plan.freePrice")
        : state.billing === "yearly"
          ? `${formatPrice(plan.priceYearly)} ${t("plan.perYear")}`
          : `${formatPrice(plan.priceMonthly)} ${t("plan.perMonth")}`;
    const name = t(`plan.${plan.id}.name`);
    const badge = plan.badge ? t(`plan.${plan.id}.badge`) : "";
    const feats = ["f1", "f2", "f3", "f4", "f5"]
      .map((f) => t(`plan.${plan.id}.${f}`))
      .filter((s) => s && !s.startsWith("plan."));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `plan-card${plan.id === "pro" ? " is-featured" : ""}${
      plan.id === current ? " is-current" : ""
    }`;
    btn.innerHTML = `
      <div class="row">
        <h3>${name}</h3>
        ${badge ? `<span class="plan-badge">${badge}</span>` : `<span></span>`}
      </div>
      <div class="price">${price}</div>
      <p class="muted" style="margin:6px 0 0">${t(`plan.${plan.id}.blurb`)}</p>
      <ul>${feats.map((f) => `<li>${f}</li>`).join("")}</ul>
    `;
    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        await purchase(plan.id, state.billing);
        refreshSubscriptionUI();
        toast(t("toast.proActive", { plan: name }));
        if (plan.id !== "free") paywall.close();
      } catch (e) {
        toast(e.message || t("toast.purchaseFail"));
      } finally {
        btn.disabled = false;
      }
    });
    host.appendChild(btn);
  }
}

function openPaywall() {
  refreshSubscriptionUI();
  paywall.showModal();
}

/* ---------- Onboarding ---------- */
let onbIndex = 0;
let onboardingWired = false;
function setupOnboarding() {
  const root = $("#onboarding");
  const dots = $("#onbDots");
  dots.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("span");
    if (i === onbIndex) s.classList.add("is-active");
    dots.appendChild(s);
  }
  if (!onboardingDone()) root.hidden = false;

  function paint() {
    document.querySelectorAll(".onb-slide").forEach((el, i) => {
      el.classList.toggle("is-active", i === onbIndex);
    });
    [...dots.children].forEach((d, i) => d.classList.toggle("is-active", i === onbIndex));
    $("#onbNext").textContent = onbIndex >= 2 ? t("onb.start") : t("onb.next");
  }

  if (!onboardingWired) {
    onboardingWired = true;
    $("#onbNext").addEventListener("click", () => {
      if (onbIndex >= 2) {
        setOnboardingDone();
        root.hidden = true;
        return;
      }
      onbIndex += 1;
      paint();
    });
    $("#onbSkip").addEventListener("click", () => {
      setOnboardingDone();
      root.hidden = true;
    });
  }
  paint();
}

/* ---------- Nav ---------- */
function showView(name) {
  document.querySelectorAll(".view").forEach((el) => {
    const on = el.dataset.view === name;
    el.hidden = !on;
    el.classList.toggle("is-active", on);
  });
  document.querySelectorAll(".tabbar-item").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.nav === name);
  });
  if (name === "cam") refreshCam();
  if (name === "export") refreshExport();
  if (name === "calc") {
    fillCalcFromJob(false);
    runCalc();
  }
  if (name === "account") refreshSubscriptionUI();
}

function showStage(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.stage === name));
  document.querySelectorAll(".stage-panel").forEach((p) => {
    const on = p.dataset.panel === name;
    p.hidden = !on;
    p.classList.toggle("is-active", on);
  });
}

document.querySelectorAll("[data-nav]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    showView(el.dataset.nav);
  });
});
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showStage(t.dataset.stage)));

$("#btnOpenPaywall").addEventListener("click", openPaywall);
$("#btnUpgrade").addEventListener("click", openPaywall);
$("#paywallClose").addEventListener("click", () => paywall.close());
$("#paywallRestore").addEventListener("click", async () => {
  const r = await restorePurchases();
  refreshSubscriptionUI();
  toast(r.message);
});
$("#btnRestore").addEventListener("click", async () => {
  const r = await restorePurchases();
  refreshSubscriptionUI();
  toast(r.message);
});

document.querySelectorAll("[data-billing]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-billing]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.billing = btn.dataset.billing;
    renderPlanCards();
  });
});

$("#btnResetOnb").addEventListener("click", () => {
  localStorage.removeItem("kerf.onboarding.v1");
  onbIndex = 0;
  $("#onboarding").hidden = false;
  setupOnboarding();
});

$("#btnSandboxFree").addEventListener("click", () => {
  saveSubscription({
    planId: "free",
    billing: "monthly",
    status: "active",
    source: "sandbox",
    updatedAt: Date.now(),
    expiresAt: null,
  });
  refreshSubscriptionUI();
  toast(t("toast.freeBack"));
});

/* ---------- Material selects ---------- */
const materialSel = $("#material");
const sheetSel = $("#sheet");
MATERIALS.forEach((m) => {
  const o = document.createElement("option");
  o.value = m.id;
  o.textContent = m.label;
  materialSel.appendChild(o);
});
SHEET_PRESETS.forEach((s) => {
  const o = document.createElement("option");
  o.value = s.id;
  o.textContent = s.label;
  sheetSel.appendChild(o);
});
materialSel.value = "ply3";
sheetSel.value = "300x200";
materialSel.addEventListener("change", () => {
  const m = MATERIALS.find((x) => x.id === materialSel.value);
  if (m) {
    $("#kerfMm").value = m.kerf;
    const match = SHEET_PRESETS.find((s) => s.w === m.sheet[0] && s.h === m.sheet[1]);
    if (match) sheetSel.value = match.id;
  }
  refreshCam();
});

/* ---------- Presets ---------- */
document.querySelectorAll("[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.preset = btn.dataset.preset;
    applyPreset(state.preset);
    if (state.sourceReady) reprocess();
  });
});

function applyPreset(name) {
  if (name === "sketch") {
    $("#adaptive").checked = true;
    $("#blur").value = 1;
    $("#thr").value = 0;
    $("#clean").value = 1;
    $("#vecMode").value = "cut";
    $("#processHint").textContent = t("hint.sketch");
  } else if (name === "print") {
    $("#adaptive").checked = false;
    $("#blur").value = 0;
    $("#thr").value = 0;
    $("#clean").value = 1;
    $("#vecMode").value = "cut";
    $("#processHint").textContent = t("hint.print");
  } else {
    $("#adaptive").checked = false;
    $("#blur").value = 1;
    $("#thr").value = 0;
    $("#clean").value = 0;
    $("#vecMode").value = "centerline";
    $("#processHint").textContent = t("hint.edge");
  }
  syncLabels();
}

function syncLabels() {
  $("#blurVal").textContent = $("#blur").value;
  $("#thrVal").textContent = $("#thr").value;
  $("#cleanVal").textContent = $("#clean").value;
  $("#simpVal").textContent = (+$("#simp").value).toFixed(1);
  $("#minAreaVal").textContent = $("#minArea").value;
}

/* ---------- Ingest ---------- */
async function ingestImage(img) {
  drawImageToCanvas(img, sourceCanvas, 1600);
  sourceEmpty.hidden = true;
  state.sourceReady = true;
  $("#btnToProcess").disabled = false;
  studioStatus.textContent = t("studio.sourceReady");
  showView("studio");
  showStage("source");
  reprocess();
  showStage("process");
}

async function ingestFile(file) {
  if (!file) return;
  await ingestImage(await loadImageFromFile(file));
}

$("#fileInput").addEventListener("change", (e) => ingestFile(e.target.files?.[0]));
$("#fileInputStudio").addEventListener("change", (e) => ingestFile(e.target.files?.[0]));
$("#ctaCamera").addEventListener("click", openCamera);
$("#btnOpenCamera").addEventListener("click", openCamera);
$("#btnToProcess").addEventListener("click", () => {
  reprocess();
  showStage("process");
});
$("#ctaDemo").addEventListener("click", seedDemo);

async function openCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    liveVideo.srcObject = mediaStream;
    camDialog.showModal();
  } catch {
    toast(t("toast.noCamera"));
    $("#fileInput").click();
  }
}

function stopCamera() {
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  liveVideo.srcObject = null;
}

$("#btnCloseCam").addEventListener("click", () => {
  camDialog.close();
  stopCamera();
});

$("#btnSnap").addEventListener("click", async () => {
  const v = liveVideo;
  snapCanvas.width = v.videoWidth || 1280;
  snapCanvas.height = v.videoHeight || 720;
  snapCanvas.getContext("2d").drawImage(v, 0, 0);
  camDialog.close();
  stopCamera();
  const img = new Image();
  img.src = snapCanvas.toDataURL("image/jpeg", 0.92);
  await img.decode();
  await ingestImage(img);
});

/* ---------- Process / Vector ---------- */
function processOpts() {
  const mode = state.preset === "edge" ? "edge" : state.preset === "print" ? "print" : "sketch";
  return {
    mode,
    blur: +$("#blur").value,
    threshold: +$("#thr").value,
    adaptive: $("#adaptive").checked,
    invert: $("#invertAuto").checked ? "auto" : false,
    clean: +$("#clean").value,
    autoCrop: $("#autoCrop").checked,
  };
}

function reprocess() {
  if (!state.sourceReady) return;
  syncLabels();
  const { binary, width, height, threshold } = processToBinary(sourceCanvas, processOpts());
  state.binary = binary;
  state.width = width;
  state.height = height;
  paintBinary(processCanvas, binary, width, height);
  $("#processHint").textContent = `Eşik≈${Math.round(threshold)} · ${width}×${height}px`;
}

["blur", "thr", "clean", "adaptive", "autoCrop", "invertAuto"].forEach((id) => {
  const el = $("#" + id);
  el.addEventListener("input", reprocess);
  el.addEventListener("change", reprocess);
});

function runVectorize() {
  if (!state.binary) reprocess();
  if (!state.binary) return;
  studioStatus.textContent = t("studio.vectorizing");
  syncLabels();
  const mode = $("#vecMode").value;
  const simplify = +$("#simp").value;
  const minArea = +$("#minArea").value;
  // Yield so UI can paint status before heavy work
  setTimeout(() => {
    const t0 = performance.now();
    const result = vectorize(state.binary, state.width, state.height, {
      simplify,
      minArea,
      mode,
    });
    state.cut = result.cut;
    state.engrave = result.engrave;
    state.stats = result.stats;
    svgPreview.innerHTML = buildPreviewSvg({
      cut: result.cut,
      engrave: result.engrave,
      width: result.width,
      height: result.height,
    });
    const c = result.stats.cutPaths || 0;
    const e = result.stats.engravePaths || 0;
    const ms = Math.round(performance.now() - t0);
    studioStatus.textContent = `${c} cut · ${e} eng`;
    $("#vecStats").textContent = `CUT ${c} · delik ${result.stats.holes || 0} · ENGRAVE ${e} · ${result.width}×${result.height}px · ${ms} ms`;
    showStage("vector");
    buildJobState();
    requestAnimationFrame(() => startOverlay());
  }, 30);
}

$("#btnVectorize").addEventListener("click", runVectorize);
["simp", "minArea", "vecMode"].forEach((id) => {
  $("#" + id).addEventListener("input", () => {
    syncLabels();
    if (state.binary) runVectorize();
  });
  $("#" + id).addEventListener("change", () => {
    if (state.binary) runVectorize();
  });
});
$("#showCut").addEventListener("change", () => ($("#showCut").checked ? startOverlay() : stopOverlay()));

function stopOverlay() {
  cancelAnimationFrame(overlayRaf);
  cutPreview.width = 0;
  cutPreview.height = 0;
}

function startOverlay() {
  stopOverlay();
  if (!$("#showCut").checked) return;
  const tick = () => {
    const host = svgPreview;
    if (!host.querySelector("svg") || !$("#showCut").checked) return;
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * devicePixelRatio));
    const h = Math.max(1, Math.floor(rect.height * devicePixelRatio));
    if (rect.width < 2 || rect.height < 2) {
      overlayRaf = requestAnimationFrame(tick);
      return;
    }
    cutPreview.width = w;
    cutPreview.height = h;
    cutPreview.style.width = rect.width + "px";
    cutPreview.style.height = rect.height + "px";
    const ctx = cutPreview.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const y = (performance.now() / 16) % h;
    const g = ctx.createLinearGradient(0, y - 24, 0, y + 24);
    g.addColorStop(0, "rgba(13,122,120,0)");
    g.addColorStop(0.5, "rgba(13,122,120,0.35)");
    g.addColorStop(1, "rgba(13,122,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 24, w, 48);
    overlayRaf = requestAnimationFrame(tick);
  };
  overlayRaf = requestAnimationFrame(tick);
}

/* ---------- CAM / Export ---------- */
function sheetSize() {
  const s = SHEET_PRESETS.find((x) => x.id === sheetSel.value) || SHEET_PRESETS[2];
  return { w: s.w, h: s.h };
}

function buildJobState() {
  if (!state.cut.length && !state.engrave.length) {
    state.job = null;
    return null;
  }
  const sheet = sheetSize();
  state.job = buildJob({
    cutPixel: state.cut,
    engravePixel: state.engrave,
    widthMm: +$("#widthMm").value || 100,
    kerfMm: +$("#kerfMm").value || 0,
    kerfDir: $("#kerfDir").value,
    sheetW: sheet.w,
    sheetH: sheet.h,
    margin: +$("#marginMm").value || 0,
  });
  return state.job;
}

function refreshCam() {
  const job = buildJobState();
  const el = $("#camMeta");
  if (!job) {
    el.classList.remove("warn");
    el.innerHTML = `<p>${t("cam.waitVector")}</p>`;
    camSvgPreview.innerHTML = "";
    return;
  }
  el.classList.toggle("warn", !job.fits);
  const mat = MATERIALS.find((m) => m.id === materialSel.value)?.label || "";
  el.innerHTML = `<p>
    1px → ${job.scale.toFixed(4)} mm<br>
    ${job.widthMm.toFixed(2)} × ${job.heightMm.toFixed(2)} mm<br>
    ${job.sheetW} × ${job.sheetH} mm · ${job.fits ? t("cam.fits") : t("cam.overflow")}<br>
    CUT ${job.cutLength.toFixed(0)} mm · ENGRAVE ${job.engraveLength.toFixed(0)} mm<br>
    ${mat} · kerf ${$("#kerfMm").value} mm
  </p>`;
  const svg = buildExportSvg({
    cut: job.cut,
    engrave: job.engrave,
    widthMm: job.widthMm,
    heightMm: job.heightMm,
    sheetW: job.sheetW,
    sheetH: job.sheetH,
  });
  camSvgPreview.innerHTML = svg
    .replace(/^<\?xml[^>]*>/, "")
    .replace(
      "<desc>",
      `<rect x="0" y="0" width="${job.sheetW}" height="${job.sheetH}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.4"/><desc>`
    );
}

function refreshExport() {
  refreshCam();
  refreshSubscriptionUI();
  const job = state.job;
  const meta = $("#exportMeta");
  const list = $("#exportChecks");
  list.innerHTML = "";
  if (!job) {
    meta.innerHTML = `<p>${t("export.noVector")}</p>`;
    return;
  }
  const gate = canExport("svg");
  meta.innerHTML = `<p>CUT ${job.cut.length} · ENGRAVE ${job.engrave.length} · ${job.widthMm.toFixed(1)}×${job.heightMm.toFixed(1)} mm · ${
    Number.isFinite(gate.remaining) ? gate.remaining : "∞"
  }</p>`;
  const checks = [
    { ok: job.cut.length + job.engrave.length > 0, text: t("export.pathOk") },
    { ok: job.fits, text: job.fits ? t("export.fitsOk") : t("export.fitsBad") },
    { ok: getLimits().dxf, text: getLimits().dxf ? t("export.dxfOpen") : t("export.dxfClosed") },
    { ok: gate.ok, text: gate.ok ? t("export.quotaOk") : gate.message },
  ];
  for (const c of checks) {
    const li = document.createElement("li");
    li.className = c.ok ? "ok" : "bad";
    li.textContent = (c.ok ? "✓ " : "✗ ") + c.text;
    list.appendChild(li);
  }
}

["widthMm", "kerfMm", "kerfDir", "marginMm", "sheet"].forEach((id) => {
  $("#" + id).addEventListener("change", refreshCam);
  $("#" + id).addEventListener("input", refreshCam);
});

function currentSvg() {
  const job = buildJobState();
  if (!job) return null;
  let svg = buildExportSvg({
    cut: job.cut,
    engrave: job.engrave,
    widthMm: job.widthMm,
    heightMm: job.heightMm,
    sheetW: job.sheetW,
    sheetH: job.sheetH,
    title: "KERF cut job",
  });
  if (!getLimits().noWatermark) {
    svg = svg.replace(
      "</svg>",
      `<text x="4" y="${(job.sheetH - 3).toFixed(2)}" font-size="3.2" fill="#888888" font-family="sans-serif">KERF Free</text></svg>`
    );
  }
  return svg;
}

function currentDxf() {
  const job = buildJobState();
  if (!job) return null;
  return pathsToDxf({ cut: job.cut, engrave: job.engrave, height: job.sheetH, flipY: true });
}

async function gatedExport(kind, run) {
  const gate = canExport(kind);
  if (!gate.ok) {
    toast(gate.message);
    openPaywall();
    return;
  }
  await run();
  recordExport();
  refreshSubscriptionUI();
  toast(t("toast.download"));
}

$("#btnExportSvg").addEventListener("click", () =>
  gatedExport("svg", async () => {
    const svg = currentSvg();
    if (!svg) return;
    downloadText(stampName("kerf_cut", "svg"), svg, "image/svg+xml");
  })
);

$("#btnExportDxf").addEventListener("click", () =>
  gatedExport("dxf", async () => {
    const dxf = currentDxf();
    if (!dxf) return;
    downloadText(stampName("kerf_cut", "dxf"), dxf, "application/dxf");
  })
);

$("#btnExportBoth").addEventListener("click", () =>
  gatedExport("both", async () => {
    const svg = currentSvg();
    const dxf = currentDxf();
    if (!svg || !dxf) return;
    downloadText(stampName("kerf_cut", "svg"), svg, "image/svg+xml");
    setTimeout(() => downloadText(stampName("kerf_cut", "dxf"), dxf, "application/dxf"), 250);
  })
);

/* ---------- Workshop calculator ---------- */
const laserSel = $("#cLaserPreset");
LASER_PRESETS.forEach((p) => {
  const o = document.createElement("option");
  o.value = p.id;
  o.textContent = `${p.label} · P${p.power} S${p.speed}`;
  laserSel.appendChild(o);
});
laserSel.value = "ply3";

function fillCalcFromJob(toastOnEmpty = true) {
  const job = buildJobState();
  if (!job) {
    if (toastOnEmpty) toast(t("toast.needVector"));
    return false;
  }
  $("#cPartW").value = job.widthMm.toFixed(2);
  $("#cPartH").value = job.heightMm.toFixed(2);
  $("#cKerf").value = $("#kerfMm").value;
  $("#cKerfDir").value = $("#kerfDir").value;
  $("#cSheetW").value = job.sheetW;
  $("#cSheetH").value = job.sheetH;
  $("#cMargin").value = $("#marginMm").value;
  $("#cCutLen").value = job.cutLength.toFixed(1);
  $("#cEngLen").value = job.engraveLength.toFixed(1);
  $("#cCutPaths").value = job.cut.length;
  $("#cPxW").value = state.width || 0;
  // rough travel estimate: 15% of path
  $("#cTravel").value = ((job.cutLength + job.engraveLength) * 0.12).toFixed(0);
  return true;
}

function applyLaserPreset() {
  const p = LASER_PRESETS.find((x) => x.id === laserSel.value);
  if (!p) return;
  $("#cCutSpeed").value = p.speed;
  $("#cPierce").value = p.pierce;
  $("#cPasses").value = p.passes;
  // engrave typically faster
  $("#cEngSpeed").value = Math.max(p.speed * 6, 40);
  toast(`${p.label} · ~${p.power}%`);
  runCalc();
}

function runCalc() {
  const partW = +$("#cPartW").value || 0;
  const partH = +$("#cPartH").value || 0;
  const pxW = +$("#cPxW").value || 0;
  const dpi = +$("#cDpi").value || 0;

  let scaleNote = "";
  if (pxW > 0 && partW > 0) {
    const s = scaleFromWidth(pxW, partW);
    scaleNote = `Ölçek ${s.toFixed(4)} mm/px`;
  } else if (pxW > 0 && dpi > 0) {
    scaleNote = `DPI ${dpi}: ${pxW}px ≈ ${pxAtDpiToMm(pxW, dpi).toFixed(2)} mm`;
  }

  const summary = summarizeJobCalc({
    partW,
    partH,
    sheetW: +$("#cSheetW").value || 0,
    sheetH: +$("#cSheetH").value || 0,
    margin: +$("#cMargin").value || 0,
    gap: +$("#cGap").value || 0,
    kerfMm: +$("#cKerf").value || 0,
    kerfDir: $("#cKerfDir").value,
    cutLenMm: +$("#cCutLen").value || 0,
    engraveLenMm: +$("#cEngLen").value || 0,
    cutSpeedMms: +$("#cCutSpeed").value || 1,
    engraveSpeedMms: +$("#cEngSpeed").value || 1,
    pierceSec: +$("#cPierce").value || 0,
    cutPaths: +$("#cCutPaths").value || 0,
    travelMm: +$("#cTravel").value || 0,
    travelSpeedMms: +$("#cTravelSpeed").value || 1,
    passes: +$("#cPasses").value || 1,
    qty: +$("#cQty").value || 1,
    pricePerSheet: +$("#cSheetPrice").value || 0,
    hourlyRate: +$("#cHourly").value || 0,
    setupFee: +$("#cSetup").value || 0,
    marginPercent: +$("#cMarginPct").value || 0,
  });

  const mmIn = +$("#cMmIn").value || 0;
  const inMm = +$("#cInMm").value || 0;
  $("#cUnitOut").textContent = `${mmIn} mm = ${mmToInch(mmIn).toFixed(4)} in · ${inMm} in = ${inchToMm(inMm).toFixed(3)} mm`;

  const preset = LASER_PRESETS.find((x) => x.id === laserSel.value);
  const host = $("#calcResults");
  const rot = summary.nest.orientation === "rotated" ? `, ${t("calc.rotated")}` : "";
  host.innerHTML = `
    <div class="calc-card"><span>${t("calc.r.afterKerf")}</span><b>${summary.afterKerf.widthMm.toFixed(2)} × ${summary.afterKerf.heightMm.toFixed(2)} mm</b></div>
    <div class="calc-card"><span>${t("calc.r.inch")}</span><b>${summary.inch.width.toFixed(3)} × ${summary.inch.height.toFixed(3)} in</b></div>
    <div class="calc-card"><span>${t("calc.r.area")}</span><b>${(summary.partAreaMm2 / 100).toFixed(2)} cm²</b></div>
    <div class="calc-card"><span>${t("calc.r.util")}</span><b>%${summary.utilization.toFixed(1)}</b></div>
    <div class="calc-card"><span>${t("calc.r.nest")}</span><b>${summary.nest.count} (${summary.nest.cols}×${summary.nest.rows}${rot})</b></div>
    <div class="calc-card"><span>${t("calc.r.pierce")}</span><b>${summary.pierces}</b></div>
    <div class="calc-card"><span>${t("calc.r.time")}</span><b>${formatDurationI18n(summary.time.totalSec)}</b></div>
    <div class="calc-card"><span>${t("calc.r.timeQty")}</span><b>${formatDurationI18n(summary.time.totalSec * (+$("#cQty").value || 1))}</b></div>
    <div class="calc-card"><span>${t("calc.r.material")}</span><b>${summary.material.sheetsNeeded} ${t("calc.sheets")} · ${summary.material.totalMaterial.toFixed(0)}</b></div>
    <div class="calc-card"><span>${t("calc.r.machine")}</span><b>${summary.machineCost.toFixed(0)}</b></div>
    <div class="calc-card wide"><span>${t("calc.r.quote", { pct: summary.quote.marginPercent })}</span><b>${t("calc.unit")} ${summary.quote.sellPerUnit.toFixed(0)} · ${t("calc.total")} ${summary.quote.sellTotal.toFixed(0)} · ${t("calc.profit")} ${summary.quote.profit.toFixed(0)}</b></div>
    <div class="calc-card wide"><span>${t("calc.r.timeDetail")}</span><b>${t("calc.cut")} ${formatDurationI18n(summary.time.cutSec)} · ${t("calc.engrave")} ${formatDurationI18n(summary.time.engraveSec)} · ${t("calc.r.pierce")} ${formatDurationI18n(summary.time.pierceSec)} · ${t("calc.travelLabel")} ${formatDurationI18n(summary.time.travelSec)}</b></div>
    <div class="calc-card wide"><span>${t("calc.r.laser")}</span><b>${preset ? `${preset.label} · ~${preset.power}% · ${preset.passes}×` : "—"} ${scaleNote ? "· " + scaleNote : ""}</b></div>
  `;
}

function pushCalcToCam() {
  $("#widthMm").value = $("#cPartW").value;
  $("#kerfMm").value = $("#cKerf").value;
  $("#kerfDir").value = $("#cKerfDir").value;
  $("#marginMm").value = $("#cMargin").value;
  // match sheet preset if possible
  const w = +$("#cSheetW").value;
  const h = +$("#cSheetH").value;
  const match = SHEET_PRESETS.find((s) => s.w === w && s.h === h);
  if (match) sheetSel.value = match.id;
  refreshCam();
  showView("cam");
  toast(t("toast.sentCam"));
}

$("#btnCalcFromJob").addEventListener("click", () => {
  if (fillCalcFromJob(true)) {
    runCalc();
    toast(t("toast.filledCam"));
  }
});
$("#btnCalcPreset").addEventListener("click", applyLaserPreset);
$("#btnCalcRun").addEventListener("click", runCalc);
$("#btnCalcToCam").addEventListener("click", pushCalcToCam);
laserSel.addEventListener("change", applyLaserPreset);

[
  "cPartW",
  "cPartH",
  "cKerf",
  "cKerfDir",
  "cPxW",
  "cDpi",
  "cSheetW",
  "cSheetH",
  "cMargin",
  "cGap",
  "cQty",
  "cCutLen",
  "cEngLen",
  "cCutSpeed",
  "cEngSpeed",
  "cCutPaths",
  "cPierce",
  "cTravel",
  "cTravelSpeed",
  "cPasses",
  "cSheetPrice",
  "cHourly",
  "cSetup",
  "cMarginPct",
  "cMmIn",
  "cInMm",
].forEach((id) => {
  const el = $("#" + id);
  if (!el) return;
  el.addEventListener("input", runCalc);
  el.addEventListener("change", runCalc);
});

/* ---------- Demo ---------- */
function seedDemo() {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 600;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 900, 600);
  ctx.strokeStyle = "#111";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 10;
  roundRect(ctx, 90, 70, 720, 460, 28);
  ctx.stroke();
  ctx.lineWidth = 8;
  roundRect(ctx, 160, 140, 280, 200, 12);
  ctx.stroke();
  [
    [200, 470],
    [700, 470],
    [200, 120],
    [700, 120],
  ].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.lineWidth = 14;
  ctx.font = "bold 120px sans-serif";
  ctx.strokeText("KERF", 480, 310);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(620, 420, 55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(620, 420, 22, 0, Math.PI * 2);
  ctx.stroke();
  const img = new Image();
  img.onload = () => ingestImage(img);
  img.src = c.toDataURL();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- OTA ---------- */
let latestOta = null;

function refreshOtaLabels() {
  const cur = $("#otaCurrent");
  if (cur) cur.textContent = t("ota.current", { version: APP_VERSION, build: APP_BUILD });
  const input = $("#otaManifestInput");
  if (input && !input.dataset.dirty) input.value = getManifestUrl();
}

function showOtaBanner(result) {
  const banner = $("#otaBanner");
  if (!banner) return;
  if (result.status !== "available" && result.status !== "forced") {
    banner.hidden = true;
    return;
  }
  latestOta = result;
  banner.hidden = false;
  banner.classList.toggle("is-force", result.status === "forced");
  const ver = result.remote?.version || "?";
  $("#otaBannerTitle").textContent =
    result.status === "forced"
      ? t("ota.banner.force", { version: ver })
      : t("ota.banner.title", { version: ver });
  $("#otaBannerNotes").textContent = result.notes || "";
  $("#otaLater").hidden = result.status === "forced";
}

async function runOtaCheck({ manual = false } = {}) {
  const statusEl = $("#otaStatus");
  if (statusEl) statusEl.textContent = t("ota.checking");
  const result = await checkForUpdate({ lang: getLang() });
  latestOta = result;
  if (statusEl) {
    if (result.status === "upToDate") {
      statusEl.textContent = t("ota.upToDate", { version: APP_VERSION });
    } else if (result.status === "error") {
      statusEl.textContent = t("ota.error", { error: result.error || "" });
    } else {
      statusEl.textContent = t("ota.available", { version: result.remote?.version || "?" });
    }
  }
  showOtaBanner(result);
  if (manual && result.status === "upToDate") toast(t("ota.upToDate", { version: APP_VERSION }));
  if (manual && result.status === "error") toast(t("ota.error", { error: result.error || "" }));
  return result;
}

$("#otaCheckBtn")?.addEventListener("click", () => runOtaCheck({ manual: true }));
$("#otaSaveUrl")?.addEventListener("click", () => {
  const v = $("#otaManifestInput")?.value || "";
  setManifestUrl(v);
  $("#otaManifestInput").dataset.dirty = "";
  toast(t("ota.manifestSave"));
  runOtaCheck({ manual: true });
});
$("#otaManifestInput")?.addEventListener("input", () => {
  $("#otaManifestInput").dataset.dirty = "1";
});
$("#otaUpdate")?.addEventListener("click", async () => {
  toast(t("ota.applying"));
  await applyUpdate({ hard: true });
});
$("#otaLater")?.addEventListener("click", () => {
  if (latestOta?.remoteBuild) ignoreUpdate(latestOta.remoteBuild);
  $("#otaBanner").hidden = true;
});

watchServiceWorker((info) => {
  if (info?.source === "serviceWorker") {
    showOtaBanner({
      status: "available",
      remote: { version: APP_VERSION },
      notes: "",
      remoteBuild: APP_BUILD + 1,
    });
  }
});

/* boot */
initI18n();
fillLangSelects();
$("#langSelect")?.addEventListener("change", (e) => refreshLanguage(e.target.value));
$("#langSelectAccount")?.addEventListener("change", (e) => refreshLanguage(e.target.value));

setupOnboarding();
applyPreset("sketch");
syncLabels();
refreshSubscriptionUI();
applyI18n();
refreshOtaLabels();
document.querySelectorAll("option[data-i18n]").forEach((el) => {
  el.textContent = t(el.getAttribute("data-i18n"));
});

if (new URLSearchParams(location.search).has("demo")) {
  setOnboardingDone();
  $("#onboarding").hidden = true;
  seedDemo();
}

// URL ?lang=de support
const langQ = new URLSearchParams(location.search).get("lang");
if (langQ) refreshLanguage(langQ);

// Strip ota cache-buster from URL after load
if (new URLSearchParams(location.search).has("ota")) {
  const clean = new URL(location.href);
  clean.searchParams.delete("ota");
  history.replaceState({}, "", clean.pathname + clean.search + clean.hash);
}

// Auto-check shortly after launch (non-blocking)
setTimeout(() => runOtaCheck({ manual: false }), 1200);
