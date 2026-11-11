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

let mediaStream = null;
let overlayRaf = 0;

/* ---------- Hero ambience ---------- */
(function heroAnim() {
  const canvas = $("#heroCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, t0;
  const paths = [];

  function resize() {
    w = canvas.width = window.innerWidth * devicePixelRatio;
    h = canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    paths.length = 0;
    for (let i = 0; i < 6; i++) {
      const pts = [];
      const cx = w * (0.12 + Math.random() * 0.76);
      const cy = h * (0.18 + Math.random() * 0.55);
      const r = Math.min(w, h) * (0.07 + Math.random() * 0.16);
      const n = 3 + ((Math.random() * 5) | 0);
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2 - Math.PI / 2;
        const j = 0.82 + Math.random() * 0.28;
        pts.push({ x: cx + Math.cos(a) * r * j, y: cy + Math.sin(a) * r * j });
      }
      paths.push({ pts, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.45 });
    }
  }

  function frame(ts) {
    if (!t0) t0 = ts;
    const t = (ts - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.2 * devicePixelRatio;
    for (const p of paths) {
      const prog = (Math.sin(t * p.speed + p.phase) * 0.5 + 0.5) * 0.85 + 0.15;
      const n = Math.max(2, Math.floor(p.pts.length * prog));
      ctx.beginPath();
      ctx.strokeStyle = `rgba(94,200,255,${0.1 + prog * 0.28})`;
      ctx.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(p.pts[i].x, p.pts[i].y);
      ctx.stroke();
      const head = p.pts[n - 1];
      ctx.beginPath();
      ctx.fillStyle = "rgba(232,163,23,0.9)";
      ctx.arc(head.x, head.y, 2.4 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();

/* ---------- Material / sheet selects ---------- */
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

/* ---------- Nav / stages ---------- */
function showView(name) {
  document.querySelectorAll(".view").forEach((el) => {
    const on = el.dataset.view === name;
    el.hidden = !on;
    el.classList.toggle("is-active", on);
  });
  if (name === "cam") refreshCam();
  if (name === "export") refreshExport();
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
  el.addEventListener("click", () => showView(el.dataset.nav));
});
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => showStage(t.dataset.stage));
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
    $("#vecMode").value = "both";
    $("#processHint").textContent = "Eskiz: Sauvola adaptif eşik + temizlik";
  } else if (name === "print") {
    $("#adaptive").checked = false;
    $("#blur").value = 0;
    $("#thr").value = 0;
    $("#clean").value = 1;
    $("#vecMode").value = "cut";
    $("#processHint").textContent = "Basılı şablon: Otsu global eşik, kapalı kesim";
  } else {
    $("#adaptive").checked = false;
    $("#blur").value = 1;
    $("#thr").value = 0;
    $("#clean").value = 0;
    $("#vecMode").value = "centerline";
    $("#processHint").textContent = "Kenar: Sobel mag + merkez çizgi kazıma";
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
  studioStatus.textContent = "Kaynak hazır";
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
    studioStatus.textContent = "Kamera yok — galeri kullan";
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

/* ---------- Process ---------- */
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
  $("#processHint").textContent = `Eşik≈${Math.round(threshold)} · ${width}×${height} px · mürekkep ayrıldı`;
}

["blur", "thr", "clean", "adaptive", "autoCrop", "invertAuto"].forEach((id) => {
  const el = $("#" + id);
  el.addEventListener("input", reprocess);
  el.addEventListener("change", reprocess);
});

function runVectorize() {
  if (!state.binary) reprocess();
  if (!state.binary) return;
  studioStatus.textContent = "Vektör…";
  syncLabels();
  const result = vectorize(state.binary, state.width, state.height, {
    simplify: +$("#simp").value,
    minArea: +$("#minArea").value,
    mode: $("#vecMode").value,
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
  const holes = result.stats.holes || 0;
  studioStatus.textContent = `${c} cut · ${e} eng`;
  $("#vecStats").textContent = `CUT yolları: ${c} · delik: ${holes} · ENGRAVE: ${e} · tuval ${result.width}×${result.height} px`;
  showStage("vector");
  buildJobState();
  requestAnimationFrame(() => startOverlay());
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
$("#showCut").addEventListener("change", () => {
  if ($("#showCut").checked) startOverlay();
  else stopOverlay();
});

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
    const svg = host.querySelector("svg");
    if (!svg || !$("#showCut").checked) return;
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
    g.addColorStop(0, "rgba(232,163,23,0)");
    g.addColorStop(0.5, "rgba(232,163,23,0.32)");
    g.addColorStop(1, "rgba(232,163,23,0)");
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
    el.innerHTML = "<p>Önce stüdyoda vektör üretin.</p>";
    camSvgPreview.innerHTML = "";
    return;
  }
  el.classList.toggle("warn", !job.fits);
  const mat = MATERIALS.find((m) => m.id === materialSel.value)?.label || "";
  el.innerHTML = `<p>
    Ölçek: 1 px → ${job.scale.toFixed(4)} mm<br>
    Parça: ${job.widthMm.toFixed(2)} × ${job.heightMm.toFixed(2)} mm<br>
    Sac: ${job.sheetW} × ${job.sheetH} mm ${job.fits ? "· sığar" : "· SIĞMIYOR — genişliği veya sacı büyütün"}<br>
    CUT yolu: ${job.cutLength.toFixed(0)} mm · ENGRAVE: ${job.engraveLength.toFixed(0)} mm<br>
    Malzeme: ${mat} · kerf ${$("#kerfMm").value} mm
  </p>`;

  const svg = buildExportSvg({
    cut: job.cut,
    engrave: job.engrave,
    widthMm: job.widthMm,
    heightMm: job.heightMm,
    sheetW: job.sheetW,
    sheetH: job.sheetH,
  });
  // preview: tint sheet border
  camSvgPreview.innerHTML = svg
    .replace(/^<\?xml[^>]*>/, "")
    .replace(
      "<desc>",
      `<rect x="0" y="0" width="${job.sheetW}" height="${job.sheetH}" fill="none" stroke="rgba(138,151,168,0.35)" stroke-width="0.4"/><desc>`
    );
}

function refreshExport() {
  const job = buildJobState();
  refreshCam();
  const meta = $("#exportMeta");
  const list = $("#exportChecks");
  list.innerHTML = "";
  if (!job) {
    meta.innerHTML = "<p>Vektör yok.</p>";
    return;
  }
  meta.innerHTML = `<p>Hazır paket · CUT ${job.cut.length} · ENGRAVE ${job.engrave.length} · ${job.widthMm.toFixed(1)}×${job.heightMm.toFixed(1)} mm</p>`;
  const checks = [
    { ok: job.cut.length + job.engrave.length > 0, text: "En az bir yol var" },
    { ok: job.fits, text: job.fits ? "Parça saca sığıyor" : "Parça sacdan taşuyor" },
    { ok: job.cutLength > 0 || job.engraveLength > 0, text: "Yol uzunluğu hesaplandı" },
    { ok: +$("#kerfMm").value >= 0, text: `Kerf ofseti: ${$("#kerfMm").value} mm` },
    { ok: true, text: "SVG: CUT=#FF0000 · ENGRAVE=#0000FF (LightBurn)" },
    { ok: true, text: "DXF: katman CUT/ENGRAVE · INSUNITS=mm" },
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
$("#btnApplyCam").addEventListener("click", refreshCam);

function currentSvg() {
  const job = buildJobState();
  if (!job) return null;
  return buildExportSvg({
    cut: job.cut,
    engrave: job.engrave,
    widthMm: job.widthMm,
    heightMm: job.heightMm,
    sheetW: job.sheetW,
    sheetH: job.sheetH,
    title: "KERF cut job",
  });
}

function currentDxf() {
  const job = buildJobState();
  if (!job) return null;
  return pathsToDxf({
    cut: job.cut,
    engrave: job.engrave,
    height: job.sheetH,
    flipY: true,
  });
}

function exportSvg() {
  const svg = currentSvg();
  if (!svg) return;
  downloadText(stampName("kerf_cut", "svg"), svg, "image/svg+xml");
}

function exportDxf() {
  const dxf = currentDxf();
  if (!dxf) return;
  downloadText(stampName("kerf_cut", "dxf"), dxf, "application/dxf");
}

$("#btnExportSvg").addEventListener("click", exportSvg);
$("#btnExportDxf").addEventListener("click", exportDxf);
$("#btnExportBoth").addEventListener("click", () => {
  exportSvg();
  setTimeout(exportDxf, 250);
});

/* ---------- Demo template (laser-ready emblem) ---------- */
function seedDemo() {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 600;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 900, 600);
  ctx.strokeStyle = "#111";
  ctx.fillStyle = "#111";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // outer plate
  roundRect(ctx, 90, 70, 720, 460, 28);
  ctx.stroke();

  // inner window (hole)
  ctx.lineWidth = 8;
  roundRect(ctx, 160, 140, 280, 200, 12);
  ctx.stroke();

  // mounting holes
  [[200, 470], [700, 470], [200, 120], [700, 120]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();
  });

  // KERF lettering as thick strokes (centerline fodder)
  ctx.lineWidth = 14;
  ctx.font = "bold 120px sans-serif";
  ctx.strokeText("KERF", 480, 310);

  // gear-ish cutout
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

applyPreset("sketch");
syncLabels();

if (new URLSearchParams(location.search).has("demo")) {
  seedDemo();
}
