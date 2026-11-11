import {
  loadImageFromFile,
  drawImageToCanvas,
  processToBinary,
  paintBinary,
} from "./lib/preprocess.js";
import { vectorize, buildSvg, pathLength } from "./lib/vectorize.js";
import { pathsToDxf, downloadText } from "./lib/dxf.js";
import {
  scalePathsToWidth,
  applyKerf,
  buildExportSvg,
  totalPathLengthMm,
  bboxOfPaths,
} from "./lib/cam.js";

const state = {
  sourceReady: false,
  binary: null,
  width: 0,
  height: 0,
  paths: [],
  cam: null,
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

/* ---------- Hero canvas (laser path ambience) ---------- */
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
    for (let i = 0; i < 5; i++) {
      const pts = [];
      const cx = w * (0.15 + Math.random() * 0.7);
      const cy = h * (0.2 + Math.random() * 0.55);
      const r = Math.min(w, h) * (0.08 + Math.random() * 0.18);
      const n = 3 + ((Math.random() * 4) | 0);
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2 - Math.PI / 2;
        const jitter = 0.85 + Math.random() * 0.3;
        pts.push({ x: cx + Math.cos(a) * r * jitter, y: cy + Math.sin(a) * r * jitter });
      }
      paths.push({ pts, phase: Math.random() * Math.PI * 2, speed: 0.35 + Math.random() * 0.4 });
    }
  }

  function frame(ts) {
    if (!t0) t0 = ts;
    const t = (ts - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.25 * devicePixelRatio;
    for (const p of paths) {
      const prog = (Math.sin(t * p.speed + p.phase) * 0.5 + 0.5) * 0.85 + 0.15;
      const n = Math.max(2, Math.floor(p.pts.length * prog));
      ctx.beginPath();
      ctx.strokeStyle = `rgba(94,200,255,${0.12 + prog * 0.28})`;
      ctx.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(p.pts[i].x, p.pts[i].y);
      ctx.stroke();
      // amber “laser head”
      const head = p.pts[n - 1];
      ctx.beginPath();
      ctx.fillStyle = "rgba(232,163,23,0.85)";
      ctx.arc(head.x, head.y, 2.5 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();

/* ---------- Navigation ---------- */
function showView(name) {
  document.querySelectorAll(".view").forEach((el) => {
    const on = el.dataset.view === name;
    el.hidden = !on;
    el.classList.toggle("is-active", on);
  });
  if (name === "cam") refreshCamPreview();
}

document.querySelectorAll("[data-nav]").forEach((el) => {
  el.addEventListener("click", () => showView(el.dataset.nav));
});

/* ---------- Stage tabs ---------- */
function showStage(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.stage === name);
  });
  document.querySelectorAll(".stage-panel").forEach((p) => {
    const on = p.dataset.panel === name;
    p.hidden = !on;
    p.classList.toggle("is-active", on);
  });
}

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => showStage(t.dataset.stage));
});

/* ---------- Image ingest ---------- */
async function ingestImage(img) {
  drawImageToCanvas(img, sourceCanvas, 1200);
  sourceEmpty.hidden = true;
  state.sourceReady = true;
  studioStatus.textContent = "Kaynak hazır";
  showView("studio");
  showStage("source");
  reprocess();
  showStage("process");
}

async function ingestFile(file) {
  if (!file) return;
  const img = await loadImageFromFile(file);
  await ingestImage(img);
}

$("#fileInput").addEventListener("change", (e) => ingestFile(e.target.files?.[0]));
$("#fileInputStudio").addEventListener("change", (e) => ingestFile(e.target.files?.[0]));
$("#ctaCamera").addEventListener("click", openCamera);
$("#btnOpenCamera").addEventListener("click", openCamera);

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
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
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
function optsFromUi() {
  return {
    threshold: +$("#thr").value,
    blur: +$("#blur").value,
    invert: $("#invert").checked,
    edgeMode: $("#edgeMode").checked,
  };
}

function reprocess() {
  if (!state.sourceReady) return;
  const { binary, width, height } = processToBinary(sourceCanvas, optsFromUi());
  state.binary = binary;
  state.width = width;
  state.height = height;
  paintBinary(processCanvas, binary, width, height);
  $("#thrVal").textContent = $("#thr").value;
  $("#blurVal").textContent = $("#blur").value;
}

["thr", "blur", "invert", "edgeMode"].forEach((id) => {
  $("#" + id).addEventListener("input", reprocess);
  $("#" + id).addEventListener("change", reprocess);
});

function runVectorize() {
  if (!state.binary) reprocess();
  if (!state.binary) return;
  studioStatus.textContent = "Vektörleştiriliyor…";
  const simplify = +$("#simp").value;
  $("#simpVal").textContent = simplify.toFixed(1);
  const result = vectorize(state.binary, state.width, state.height, simplify);
  state.paths = result.paths;
  const svg = buildSvg({
    paths: result.paths,
    width: result.width,
    height: result.height,
  });
  svgPreview.innerHTML = svg.replace(/^<\?xml[^>]*>/, "");
  studioStatus.textContent = `${result.contourCount} kontur`;
  showStage("vector");
  buildCamState();
  requestAnimationFrame(() => drawCutOverlay());
}

$("#btnVectorize").addEventListener("click", runVectorize);
$("#simp").addEventListener("input", () => {
  $("#simpVal").textContent = (+$("#simp").value).toFixed(1);
  if (state.binary) runVectorize();
});
$("#showCut").addEventListener("change", drawCutOverlay);

function drawCutOverlay() {
  const host = svgPreview;
  const svg = host.querySelector("svg");
  if (!svg || !$("#showCut").checked) {
    cutPreview.width = 0;
    cutPreview.height = 0;
    return;
  }
  const rect = host.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * devicePixelRatio));
  const h = Math.max(1, Math.floor(rect.height * devicePixelRatio));
  if (!Number.isFinite(w) || !Number.isFinite(h) || rect.width < 1 || rect.height < 1) {
    requestAnimationFrame(drawCutOverlay);
    return;
  }
  cutPreview.width = w;
  cutPreview.height = h;
  cutPreview.style.width = rect.width + "px";
  cutPreview.style.height = rect.height + "px";
  const ctx = cutPreview.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const y = (performance.now() / 18) % h;
  const g = ctx.createLinearGradient(0, y - 20, 0, y + 20);
  g.addColorStop(0, "rgba(232,163,23,0)");
  g.addColorStop(0.5, "rgba(232,163,23,0.35)");
  g.addColorStop(1, "rgba(232,163,23,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 20, w, 40);
  if ($("#showCut").checked) requestAnimationFrame(drawCutOverlay);
}

/* ---------- CAM / export ---------- */
function buildCamState() {
  if (!state.paths.length) {
    state.cam = null;
    return;
  }
  const widthMm = +$("#widthMm").value || 100;
  const kerfMm = +$("#kerfMm").value || 0;
  const dir = $("#kerfDir").value;
  const scaled = scalePathsToWidth(state.paths, state.width, widthMm);
  const withKerf = applyKerf(scaled.paths, kerfMm, dir);
  const bb = bboxOfPaths(withKerf);
  state.cam = {
    paths: withKerf,
    widthMm: Math.max(bb.width, widthMm),
    heightMm: bb.height || scaled.heightMm,
    scale: scaled.scale,
  };
  const len = totalPathLengthMm(withKerf);
  $("#camMeta").innerHTML = `<p>Ölçek: 1 px → ${(scaled.scale).toFixed(3)} mm · Boyut: ${state.cam.widthMm.toFixed(1)} × ${state.cam.heightMm.toFixed(1)} mm · Yol: ${len.toFixed(0)} mm · Malzeme: ${$("#material").value}</p>`;
}

function refreshCamPreview() {
  buildCamState();
  if (!state.cam) {
    camSvgPreview.innerHTML = `<p style="color:#8a97a8;padding:24px;text-align:center">Önce stüdyoda vektör üretin</p>`;
    return;
  }
  const svg = buildExportSvg(state.cam.paths, state.cam.widthMm, state.cam.heightMm);
  camSvgPreview.innerHTML = svg.replace(/^<\?xml[^>]*>/, "").replace(/stroke="#000000"/g, 'stroke="#5ec8ff"');
}

["widthMm", "kerfMm", "kerfDir", "material"].forEach((id) => {
  $("#" + id).addEventListener("change", refreshCamPreview);
  $("#" + id).addEventListener("input", refreshCamPreview);
});

$("#btnApplyCam").addEventListener("click", refreshCamPreview);

function exportSvg() {
  buildCamState();
  if (!state.cam) return;
  const svg = buildExportSvg(state.cam.paths, state.cam.widthMm, state.cam.heightMm);
  downloadText("kerf-cut.svg", svg, "image/svg+xml");
}

function exportDxf() {
  buildCamState();
  if (!state.cam) return;
  const dxf = pathsToDxf({
    paths: state.cam.paths,
    height: state.cam.heightMm,
    flipY: true,
  });
  downloadText("kerf-cut.dxf", dxf, "application/dxf");
}

$("#btnExportSvg").addEventListener("click", exportSvg);
$("#btnExportDxf").addEventListener("click", exportDxf);
$("#btnExportSvgCam").addEventListener("click", exportSvg);
$("#btnExportDxfCam").addEventListener("click", exportDxf);

// Demo sample on first load if ?demo=1
if (new URLSearchParams(location.search).has("demo")) {
  seedDemo();
}

function seedDemo() {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 400;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 600, 400);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 6;
  ctx.strokeRect(80, 60, 440, 280);
  ctx.beginPath();
  ctx.arc(300, 200, 90, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(220, 140, 160, 120);
  const img = new Image();
  img.onload = () => ingestImage(img);
  img.src = c.toDataURL();
}
