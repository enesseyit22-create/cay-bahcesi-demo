/**
 * CAM scale, kerf approx, sheet placement, LightBurn-ready SVG builder.
 */

function parsePoints(d) {
  const nums = [...d.matchAll(/(-?\d+\.?\d*(?:e[-+]?\d+)?)/gi)].map((m) => parseFloat(m[0]));
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

function isClosed(d) {
  return /\sZ\s*$/i.test(d.trim());
}

function pointsToPath(pts, closed) {
  if (!pts.length) return "";
  let d = `M ${pts[0].x.toFixed(4)} ${pts[0].y.toFixed(4)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(4)} ${pts[i].y.toFixed(4)}`;
  if (closed) d += " Z";
  return d;
}

export function bboxOfPaths(paths) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const d of paths) {
    for (const p of parsePoints(d)) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function transformPaths(paths, fn) {
  return paths.map((d) => {
    const closed = isClosed(d);
    const pts = parsePoints(d).map(fn);
    return pointsToPath(pts, closed);
  });
}

/** Scale so bounding width = widthMm; origin top-left mm */
export function scalePathsToWidth(paths, widthMm) {
  const bb = bboxOfPaths(paths);
  const srcW = bb.width || 1;
  const scale = widthMm / srcW;
  const out = transformPaths(paths, (p) => ({
    x: (p.x - bb.minX) * scale,
    y: (p.y - bb.minY) * scale,
  }));
  return { paths: out, scale, widthMm, heightMm: bb.height * scale };
}

/** Uniform scale about centroid — approximate kerf */
export function applyKerf(paths, kerfMm, dir = "out") {
  if (dir === "none" || kerfMm <= 0) return paths;
  const sign = dir === "out" ? 1 : -1;
  return paths.map((d) => {
    const closed = isClosed(d);
    if (!closed) return d;
    const pts = parsePoints(d);
    if (pts.length < 3) return d;
    let cx = 0,
      cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
    let avgR = 0;
    for (const p of pts) avgR += Math.hypot(p.x - cx, p.y - cy);
    avgR /= pts.length;
    if (avgR < 1e-6) return d;
    const factor = (avgR + sign * kerfMm) / avgR;
    if (factor <= 0.05) return d;
    return pointsToPath(
      pts.map((p) => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor })),
      true
    );
  });
}

export function placeOnSheet(paths, sheetW, sheetH, margin = 5) {
  const bb = bboxOfPaths(paths);
  return {
    sheetW,
    sheetH,
    fits: bb.width + margin * 2 <= sheetW && bb.height + margin * 2 <= sheetH,
    usedW: bb.width,
    usedH: bb.height,
  };
}

export const MATERIALS = [
  { id: "ply3", label: "3 mm kontrplak", kerf: 0.15, sheet: [300, 200] },
  { id: "ply6", label: "6 mm kontrplak", kerf: 0.2, sheet: [300, 200] },
  { id: "acryl3", label: "3 mm akrilik", kerf: 0.18, sheet: [300, 200] },
  { id: "mdf3", label: "3 mm MDF", kerf: 0.2, sheet: [300, 200] },
  { id: "card", label: "Karton / şablon", kerf: 0.05, sheet: [297, 210] },
  { id: "leather", label: "Deri 2 mm", kerf: 0.1, sheet: [300, 200] },
  { id: "custom", label: "Özel", kerf: 0.15, sheet: [300, 200] },
];

export const SHEET_PRESETS = [
  { id: "a4", label: "A4 297×210", w: 297, h: 210 },
  { id: "a3", label: "A3 420×297", w: 420, h: 297 },
  { id: "300x200", label: "300×200 mm", w: 300, h: 200 },
  { id: "400x300", label: "400×300 mm", w: 400, h: 300 },
  { id: "600x400", label: "600×400 mm", w: 600, h: 400 },
];

/**
 * LightBurn / Glowforge friendly SVG:
 * - red stroke = CUT
 * - blue stroke = ENGRAVE
 * - units in mm
 */
export function buildExportSvg({ cut, engrave, widthMm, heightMm, sheetW, sheetH, title = "KERF" }) {
  const w = sheetW || widthMm;
  const h = sheetH || heightMm;
  const cutBody = cut
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#FF0000" stroke-width="0.1" stroke-linejoin="round" stroke-linecap="round"/>`
    )
    .join("\n  ");
  const engBody = engrave
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#0000FF" stroke-width="0.1" stroke-linejoin="round" stroke-linecap="round"/>`
    )
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
  width="${w.toFixed(3)}mm" height="${h.toFixed(3)}mm"
  viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}"
  fill="none">
  <title>${escapeXml(title)}</title>
  <desc>KERF laser cut file · CUT=#FF0000 · ENGRAVE=#0000FF · units=mm</desc>
  <g id="CUT">
  ${cutBody}
  </g>
  <g id="ENGRAVE">
  ${engBody}
  </g>
</svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

export function totalPathLengthMm(paths) {
  let total = 0;
  for (const d of paths) {
    const pts = parsePoints(d);
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    if (isClosed(d) && pts.length > 2) {
      total += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
    }
  }
  return total;
}

export function buildJob({
  cutPixel,
  engravePixel,
  widthMm,
  kerfMm,
  kerfDir,
  sheetW,
  sheetH,
  margin = 5,
}) {
  const allPix = [...cutPixel, ...engravePixel];
  if (!allPix.length) return null;

  const ref = cutPixel.length ? cutPixel : allPix;
  const scaled = scalePathsToWidth(ref, widthMm);
  const bbRef = bboxOfPaths(ref);
  const scale = scaled.scale;

  let cutMm = cutPixel.length
    ? transformPaths(cutPixel, (p) => ({
        x: (p.x - bbRef.minX) * scale,
        y: (p.y - bbRef.minY) * scale,
      }))
    : [];

  let engMm = engravePixel.length
    ? transformPaths(engravePixel, (p) => ({
        x: (p.x - bbRef.minX) * scale,
        y: (p.y - bbRef.minY) * scale,
      }))
    : [];

  cutMm = applyKerf(cutMm, kerfMm, kerfDir);

  const bb0 = bboxOfPaths(cutMm.length ? cutMm : engMm);
  const ox = margin - bb0.minX;
  const oy = margin - bb0.minY;
  cutMm = transformPaths(cutMm, (p) => ({ x: p.x + ox, y: p.y + oy }));
  engMm = transformPaths(engMm, (p) => ({ x: p.x + ox, y: p.y + oy }));

  const placed = placeOnSheet(cutMm.length ? cutMm : engMm, sheetW, sheetH, margin);
  const bb = bboxOfPaths([...cutMm, ...engMm]);
  return {
    cut: cutMm,
    engrave: engMm,
    widthMm: bb.width,
    heightMm: bb.height,
    sheetW,
    sheetH,
    fits: placed.fits,
    scale,
    cutLength: totalPathLengthMm(cutMm),
    engraveLength: totalPathLengthMm(engMm),
  };
}
