/**
 * CAM helpers: pixel → mm scale, simple kerf inflate/deflate via centroid scale.
 */

function parsePoints(d) {
  const nums = [...d.matchAll(/(-?\d+\.?\d*)/g)].map((m) => parseFloat(m[0]));
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

function pointsToPath(pts) {
  if (!pts.length) return "";
  let d = `M ${pts[0].x.toFixed(3)} ${pts[0].y.toFixed(3)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x.toFixed(3)} ${pts[i].y.toFixed(3)}`;
  }
  d += " Z";
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

/** Scale paths so bounding width equals widthMm. Returns paths in mm coords + meta. */
export function scalePathsToWidth(paths, pixelWidth, widthMm) {
  const bb = bboxOfPaths(paths);
  const srcW = bb.width || pixelWidth || 1;
  const scale = widthMm / srcW;
  const out = paths.map((d) => {
    const pts = parsePoints(d).map((p) => ({
      x: (p.x - bb.minX) * scale,
      y: (p.y - bb.minY) * scale,
    }));
    return pointsToPath(pts);
  });
  const heightMm = bb.height * scale;
  return { paths: out, scale, widthMm, heightMm };
}

/**
 * Approximate kerf compensation: scale each polygon from its centroid.
 * dir: 'out' | 'in' | 'none'
 */
export function applyKerf(paths, kerfMm, dir = "out") {
  if (dir === "none" || kerfMm <= 0) return paths;
  const sign = dir === "out" ? 1 : -1;
  return paths.map((d) => {
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

    // average radius
    let avgR = 0;
    for (const p of pts) avgR += Math.hypot(p.x - cx, p.y - cy);
    avgR /= pts.length;
    if (avgR < 1e-6) return d;
    const factor = (avgR + sign * kerfMm) / avgR;
    if (factor <= 0.05) return d;
    const next = pts.map((p) => ({
      x: cx + (p.x - cx) * factor,
      y: cy + (p.y - cy) * factor,
    }));
    return pointsToPath(next);
  });
}

export function buildExportSvg(paths, widthMm, heightMm) {
  const body = paths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#000000" stroke-width="0.1" stroke-linejoin="round"/>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm.toFixed(3)}mm" height="${heightMm.toFixed(3)}mm" viewBox="0 0 ${widthMm.toFixed(3)} ${heightMm.toFixed(3)}">
<!-- KERF cut paths · units: mm -->
${body}
</svg>`;
}

export function totalPathLengthMm(paths) {
  let total = 0;
  for (const d of paths) {
    const pts = parsePoints(d);
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    if (pts.length > 2) {
      total += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
    }
  }
  return total;
}
