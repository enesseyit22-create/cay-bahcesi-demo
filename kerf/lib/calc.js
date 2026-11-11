/**
 * Workshop calculators for laser / CNC jobs.
 * All linear units default to millimeters unless noted.
 */

export function pxToMm(px, scaleMmPerPx) {
  return px * scaleMmPerPx;
}

export function mmToPx(mm, scaleMmPerPx) {
  return scaleMmPerPx > 0 ? mm / scaleMmPerPx : 0;
}

/** Scale from known real width */
export function scaleFromWidth(pixelWidth, realWidthMm) {
  if (!pixelWidth) return 0;
  return realWidthMm / pixelWidth;
}

/** Final outer size after kerf (out = part grows by ~kerf on each side ≈ +kerf total on width if bilateral approx) */
export function sizeAfterKerf(widthMm, heightMm, kerfMm, dir = "out") {
  const k = dir === "none" ? 0 : dir === "out" ? kerfMm : -kerfMm;
  return {
    widthMm: Math.max(0, widthMm + k),
    heightMm: Math.max(0, heightMm + k),
    deltaMm: k,
  };
}

export function rectangleAreaMm2(w, h) {
  return Math.max(0, w) * Math.max(0, h);
}

export function utilizationPercent(partArea, sheetArea) {
  if (sheetArea <= 0) return 0;
  return Math.min(100, (partArea / sheetArea) * 100);
}

/** How many axis-aligned copies fit (simple grid nesting) */
export function copiesOnSheet(partW, partH, sheetW, sheetH, gap = 2, margin = 5) {
  const usableW = sheetW - margin * 2;
  const usableH = sheetH - margin * 2;
  if (partW <= 0 || partH <= 0 || usableW <= 0 || usableH <= 0) {
    return { count: 0, cols: 0, rows: 0, orientation: "normal" };
  }
  const fit = (pw, ph) => {
    const cols = Math.floor((usableW + gap) / (pw + gap));
    const rows = Math.floor((usableH + gap) / (ph + gap));
    return { cols: Math.max(0, cols), rows: Math.max(0, rows), count: Math.max(0, cols) * Math.max(0, rows) };
  };
  const a = fit(partW, partH);
  const b = fit(partH, partW); // rotated
  if (b.count > a.count) return { ...b, orientation: "rotated" };
  return { ...a, orientation: "normal" };
}

/**
 * Cut time estimate.
 * @param {{ cutLenMm: number, engraveLenMm: number, cutSpeedMms: number, engraveSpeedMms: number, pierces: number, pierceSec: number, travelMm?: number, travelSpeedMms?: number }} p
 */
export function estimateTimeSec(p) {
  const cut = p.cutSpeedMms > 0 ? p.cutLenMm / p.cutSpeedMms : 0;
  const eng = p.engraveSpeedMms > 0 ? p.engraveLenMm / p.engraveSpeedMms : 0;
  const pierce = (p.pierces || 0) * (p.pierceSec || 0);
  const travel =
    (p.travelMm || 0) > 0 && (p.travelSpeedMms || 0) > 0 ? p.travelMm / p.travelSpeedMms : 0;
  const total = cut + eng + pierce + travel;
  return { cutSec: cut, engraveSec: eng, pierceSec: pierce, travelSec: travel, totalSec: total };
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${sec.toFixed(1)} sn`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return `${m} dk ${s} sn`;
  const h = Math.floor(m / 60);
  return `${h} sa ${m % 60} dk`;
}

export function materialCost(sheetAreaMm2, pricePerSheet, sheetW, sheetH, partAreaMm2, qty = 1) {
  const sheetArea = sheetW * sheetH;
  const sheetsNeeded =
    sheetArea > 0 ? Math.ceil((partAreaMm2 * qty) / Math.max(sheetArea * 0.92, 1)) : 0;
  // more accurate with nesting:
  return {
    sheetsNeeded,
    totalMaterial: sheetsNeeded * pricePerSheet,
    areaMm2: partAreaMm2 * qty,
  };
}

export function materialCostFromNesting(pricePerSheet, copiesPerSheet, qty) {
  const sheets = copiesPerSheet > 0 ? Math.ceil(qty / copiesPerSheet) : 0;
  return { sheetsNeeded: sheets, totalMaterial: sheets * pricePerSheet };
}

export function machineCost(totalSec, hourlyRate) {
  return (totalSec / 3600) * hourlyRate;
}

export function jobQuote({
  material,
  machine,
  setupFee = 0,
  qty = 1,
  marginPercent = 30,
}) {
  const direct = material + machine + setupFee;
  const perUnitDirect = qty > 0 ? direct / qty : direct;
  const sellPerUnit = perUnitDirect * (1 + marginPercent / 100);
  const sellTotal = sellPerUnit * qty;
  const profit = sellTotal - direct;
  return { direct, perUnitDirect, sellPerUnit, sellTotal, profit, marginPercent };
}

/** mm <-> inch */
export function mmToInch(mm) {
  return mm / 25.4;
}
export function inchToMm(inch) {
  return inch * 25.4;
}

/** DPI helpers: pixels at dpi → mm */
export function pxAtDpiToMm(px, dpi) {
  if (!dpi) return 0;
  return (px / dpi) * 25.4;
}

export function mmToPxAtDpi(mm, dpi) {
  return (mm / 25.4) * dpi;
}

/**
 * Reference laser presets (CO2 hobby/prosumer). Guidance only — calibrate on machine.
 */
export const LASER_PRESETS = [
  { id: "ply3", label: "Kontrplak 3 mm", power: 55, speed: 12, passes: 1, pierce: 0.4 },
  { id: "ply6", label: "Kontrplak 6 mm", power: 75, speed: 6, passes: 2, pierce: 0.6 },
  { id: "acryl3", label: "Akrilik 3 mm", power: 40, speed: 10, passes: 1, pierce: 0.35 },
  { id: "acryl5", label: "Akrilik 5 mm", power: 55, speed: 6, passes: 1, pierce: 0.5 },
  { id: "mdf3", label: "MDF 3 mm", power: 60, speed: 10, passes: 1, pierce: 0.45 },
  { id: "card", label: "Karton", power: 15, speed: 40, passes: 1, pierce: 0.15 },
  { id: "leather2", label: "Deri 2 mm", power: 25, speed: 20, passes: 1, pierce: 0.25 },
];

export function applyPassesToTime(timeSec, passes) {
  return timeSec * Math.max(1, passes || 1);
}

/** Count closed paths ≈ pierces for laser */
export function estimatePierces(cutPathCount) {
  return Math.max(0, cutPathCount | 0);
}

export function summarizeJobCalc(input) {
  const {
    partW,
    partH,
    sheetW,
    sheetH,
    margin = 5,
    gap = 2,
    kerfMm = 0,
    kerfDir = "out",
    cutLenMm = 0,
    engraveLenMm = 0,
    cutSpeedMms = 12,
    engraveSpeedMms = 80,
    pierceSec = 0.4,
    cutPaths = 0,
    travelMm = 0,
    travelSpeedMms = 200,
    passes = 1,
    qty = 1,
    pricePerSheet = 80,
    hourlyRate = 250,
    setupFee = 40,
    marginPercent = 30,
  } = input;

  const after = sizeAfterKerf(partW, partH, kerfMm, kerfDir);
  const partArea = rectangleAreaMm2(after.widthMm, after.heightMm);
  const sheetArea = rectangleAreaMm2(sheetW, sheetH);
  const util = utilizationPercent(partArea, sheetArea);
  const nest = copiesOnSheet(after.widthMm, after.heightMm, sheetW, sheetH, gap, margin);
  const pierces = estimatePierces(cutPaths);
  let time = estimateTimeSec({
    cutLenMm,
    engraveLenMm,
    cutSpeedMms,
    engraveSpeedMms,
    pierces,
    pierceSec,
    travelMm,
    travelSpeedMms,
  });
  time = {
    ...time,
    totalSec: applyPassesToTime(time.totalSec, passes),
    cutSec: applyPassesToTime(time.cutSec, passes),
  };

  const mat = materialCostFromNesting(pricePerSheet, nest.count, qty);
  const machine = machineCost(time.totalSec * qty, hourlyRate);
  const quote = jobQuote({
    material: mat.totalMaterial,
    machine,
    setupFee,
    qty,
    marginPercent,
  });

  return {
    afterKerf: after,
    partAreaMm2: partArea,
    sheetAreaMm2: sheetArea,
    utilization: util,
    nest,
    pierces,
    time,
    material: mat,
    machineCost: machine,
    quote,
    inch: {
      width: mmToInch(after.widthMm),
      height: mmToInch(after.heightMm),
    },
  };
}
