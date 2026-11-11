/**
 * Contour tracing (Moore neighborhood) + Douglas–Peucker simplify → SVG paths.
 * Foreground pixels = 1 in binary bitmap.
 */

function idx(x, y, w) {
  return y * w + x;
}

/** Find external contours; returns arrays of {x,y} points (pixel centers). */
export function findContours(binary, width, height) {
  const visited = new Uint8Array(width * height);
  const contours = [];
  // N, NE, E, SE, S, SW, W, NW
  const dx = [0, 1, 1, 1, 0, -1, -1, -1];
  const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

  function isFg(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return binary[idx(x, y, width)] === 1;
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y, width);
      if (binary[i] !== 1 || visited[i]) continue;
      // start at left-edge of a blob
      if (isFg(x - 1, y)) continue;

      const contour = [];
      let cx = x;
      let cy = y;
      let dir = 0; // coming from west → start looking north-ish
      const startX = x;
      const startY = y;
      let guard = 0;
      const maxSteps = width * height * 2;

      do {
        contour.push({ x: cx + 0.5, y: cy + 0.5 });
        visited[idx(cx, cy, width)] = 1;

        // search neighbors clockwise from dir-2
        let found = false;
        const startDir = (dir + 6) % 8;
        for (let k = 0; k < 8; k++) {
          const nd = (startDir + k) % 8;
          const nx = cx + dx[nd];
          const ny = cy + dy[nd];
          if (isFg(nx, ny)) {
            cx = nx;
            cy = ny;
            dir = nd;
            found = true;
            break;
          }
        }
        if (!found) break;
        guard++;
        if (guard > maxSteps) break;
      } while (cx !== startX || cy !== startY);

      if (contour.length >= 8) contours.push(contour);
    }
  }

  return contours;
}

function distPointSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.hypot(ex, ey);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function simplifyRDP(points, epsilon) {
  if (points.length < 3) return points.slice();
  let maxD = 0;
  let maxI = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = distPointSeg(points[i], points[0], points[end]);
    if (d > maxD) {
      maxD = d;
      maxI = i;
    }
  }
  if (maxD > epsilon) {
    const left = simplifyRDP(points.slice(0, maxI + 1), epsilon);
    const right = simplifyRDP(points.slice(maxI), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

export function contoursToPathD(contours, simplify = 1.2) {
  const parts = [];
  for (const c of contours) {
    const s = simplifyRDP(c, simplify);
    if (s.length < 3) continue;
    let d = `M ${fmt(s[0].x)} ${fmt(s[0].y)}`;
    for (let i = 1; i < s.length; i++) {
      d += ` L ${fmt(s[i].x)} ${fmt(s[i].y)}`;
    }
    d += " Z";
    parts.push(d);
  }
  return parts;
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function buildSvg({ paths, width, height, stroke = "#5ec8ff", scale = 1 }) {
  const w = width * scale;
  const h = height * scale;
  const body = paths
    .map(
      (d) =>
        `<path d="${scalePath(d, scale)}" fill="none" stroke="${stroke}" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round"/>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" fill="none">
${body}
</svg>`;
}

function scalePath(d, scale) {
  if (scale === 1) return d;
  return d.replace(/(-?\d+\.?\d*)/g, (m) => (parseFloat(m) * scale).toFixed(2));
}

export function pathLength(paths) {
  let total = 0;
  for (const d of paths) {
    const nums = [...d.matchAll(/(-?\d+\.?\d*)/g)].map((m) => parseFloat(m[0]));
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    if (pts.length > 2) {
      total += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
    }
  }
  return total;
}

export function vectorize(binary, width, height, simplify = 1.2) {
  const contours = findContours(binary, width, height);
  // keep largest contours to avoid noise
  const ranked = contours
    .map((c) => ({ c, area: bboxArea(c) }))
    .sort((a, b) => b.area - a.area)
    .slice(0, 80)
    .filter((x) => x.area > 40);
  const paths = contoursToPathD(
    ranked.map((x) => x.c),
    simplify
  );
  return { paths, width, height, contourCount: ranked.length };
}

function bboxArea(c) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of c) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return (maxX - minX) * (maxY - minY);
}
