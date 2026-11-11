/**
 * Contour extraction with hole hierarchy + optional Zhang-Suen skeleton centerlines.
 */

function idx(x, y, w) {
  return y * w + x;
}

function distPointSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
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

function mergeCollinear(points, angTol = 0.08) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const cross = Math.abs(abx * bcy - aby * bcx);
    const mag = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) || 1;
    if (cross / mag > angTol) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  }
  return a / 2;
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Moore neighborhood border follow */
export function findContours(binary, width, height) {
  const visited = new Uint8Array(width * height);
  const contours = [];
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
      if (isFg(x - 1, y)) continue;

      const contour = [];
      let cx = x;
      let cy = y;
      let dir = 0;
      const startX = x;
      const startY = y;
      let guard = 0;
      const maxSteps = width * height * 2;

      do {
        contour.push({ x: cx + 0.5, y: cy + 0.5 });
        visited[i] = 1;
        visited[idx(cx, cy, width)] = 1;
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
      } while ((cx !== startX || cy !== startY) && guard < maxSteps);

      if (contour.length >= 12) contours.push(contour);
    }
  }
  return contours;
}

function assignHierarchy(contours) {
  const areas = contours.map((c) => Math.abs(polygonArea(c)));
  const order = areas.map((_, i) => i).sort((a, b) => areas[b] - areas[a]);
  const nodes = contours.map((c, i) => ({
    points: c,
    area: areas[i],
    parent: -1,
    children: [],
    layer: "cut", // outer = cut, holes also cut (inner)
  }));

  for (const i of order) {
    const sample = contours[i][0];
    let parent = -1;
    let bestArea = Infinity;
    for (const j of order) {
      if (i === j) continue;
      if (areas[j] <= areas[i]) continue;
      if (!pointInPoly(sample, contours[j])) continue;
      if (areas[j] < bestArea) {
        bestArea = areas[j];
        parent = j;
      }
    }
    nodes[i].parent = parent;
    if (parent >= 0) nodes[parent].children.push(i);
  }

  // depth even = outer cut, odd = hole
  function depth(i) {
    let d = 0;
    let p = nodes[i].parent;
    while (p >= 0) {
      d++;
      p = nodes[p].parent;
    }
    return d;
  }
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].hole = depth(i) % 2 === 1;
    nodes[i].layer = "cut";
  }
  return nodes;
}

/** Zhang-Suen thinning for centerline engrave paths */
export function skeletonize(binary, width, height) {
  let img = Uint8ClampedArray.from(binary);
  const get = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : img[y * width + x]);

  function neighbors(x, y) {
    return [
      get(x, y - 1),
      get(x + 1, y - 1),
      get(x + 1, y),
      get(x + 1, y + 1),
      get(x, y + 1),
      get(x - 1, y + 1),
      get(x - 1, y),
      get(x - 1, y - 1),
    ];
  }

  let changed = true;
  let iter = 0;
  while (changed && iter < 200) {
    changed = false;
    iter++;
    for (const step of [0, 1]) {
      const toRemove = [];
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (!get(x, y)) continue;
          const p = neighbors(x, y);
          const B = p.reduce((a, b) => a + b, 0);
          if (B < 2 || B > 6) continue;
          let A = 0;
          for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i + 1) % 8] === 1) A++;
          if (A !== 1) continue;
          if (step === 0) {
            if (p[0] * p[2] * p[4] !== 0) continue;
            if (p[2] * p[4] * p[6] !== 0) continue;
          } else {
            if (p[0] * p[2] * p[6] !== 0) continue;
            if (p[0] * p[4] * p[6] !== 0) continue;
          }
          toRemove.push(y * width + x);
        }
      }
      if (toRemove.length) {
        changed = true;
        for (const i of toRemove) img[i] = 0;
      }
    }
  }
  return img;
}

/** Trace polylines from skeleton (open paths) */
export function traceSkeleton(skel, width, height) {
  const used = new Uint8Array(width * height);
  const paths = [];
  const dirs = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ];

  function neighbors(x, y) {
    const n = [];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (skel[ny * width + nx]) n.push([nx, ny]);
    }
    return n;
  }

  function degree(x, y) {
    return neighbors(x, y).length;
  }

  // start from endpoints (deg 1) then junctions
  const starts = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!skel[y * width + x]) continue;
      const d = degree(x, y);
      if (d === 1) starts.push([x, y, 0]);
      else if (d > 2) starts.push([x, y, 1]);
    }
  }
  starts.sort((a, b) => a[2] - b[2]);

  function walk(sx, sy) {
    const pts = [{ x: sx + 0.5, y: sy + 0.5 }];
    used[sy * width + sx] = 1;
    let x = sx;
    let y = sy;
    while (true) {
      const n = neighbors(x, y).filter(([nx, ny]) => !used[ny * width + nx]);
      if (!n.length) break;
      // prefer continuing straight
      let best = n[0];
      if (pts.length >= 2) {
        const prev = pts[pts.length - 2];
        const vx = x + 0.5 - prev.x;
        const vy = y + 0.5 - prev.y;
        let bestDot = -Infinity;
        for (const c of n) {
          const dx = c[0] + 0.5 - (x + 0.5);
          const dy = c[1] + 0.5 - (y + 0.5);
          const dot = (dx * vx + dy * vy) / ((Math.hypot(dx, dy) || 1) * (Math.hypot(vx, vy) || 1));
          if (dot > bestDot) {
            bestDot = dot;
            best = c;
          }
        }
      }
      x = best[0];
      y = best[1];
      used[y * width + x] = 1;
      pts.push({ x: x + 0.5, y: y + 0.5 });
      if (degree(x, y) > 2 && pts.length > 2) break;
    }
    return pts;
  }

  for (const [sx, sy] of starts) {
    if (used[sy * width + sx]) continue;
    const pts = walk(sx, sy);
    if (pts.length >= 6) paths.push(pts);
  }

  // remaining loops
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!skel[y * width + x] || used[y * width + x]) continue;
      const pts = walk(x, y);
      if (pts.length >= 8) paths.push(pts);
    }
  }
  return paths;
}

function ptsToClosedPath(pts) {
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${fmt(pts[i].x)} ${fmt(pts[i].y)}`;
  d += " Z";
  return d;
}

function ptsToOpenPath(pts) {
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${fmt(pts[i].x)} ${fmt(pts[i].y)}`;
  return d;
}

function fmt(n) {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

/**
 * @returns {{ cut: string[], engrave: string[], width: number, height: number, stats: object }}
 */
export function vectorize(binary, width, height, opts = {}) {
  const {
    simplify = 1.2,
    minArea = 80,
    mode = "cut", // cut | centerline | both
    maxContours = 120,
  } = opts;

  const result = { cut: [], engrave: [], width, height, stats: {} };

  if (mode === "cut" || mode === "both") {
    const raw = findContours(binary, width, height);
    const nodes = assignHierarchy(raw)
      .filter((n) => n.area >= minArea)
      .sort((a, b) => b.area - a.area)
      .slice(0, maxContours);

    for (const n of nodes) {
      let pts = simplifyRDP(n.points, simplify);
      pts = mergeCollinear(pts);
      if (pts.length < 3) continue;
      // ensure CCW for outer, CW for holes (SVG fill-rule evenodd friendly)
      const a = polygonArea(pts);
      if (!n.hole && a < 0) pts = pts.slice().reverse();
      if (n.hole && a > 0) pts = pts.slice().reverse();
      result.cut.push(ptsToClosedPath(pts));
    }
    result.stats.cutPaths = result.cut.length;
    result.stats.holes = nodes.filter((n) => n.hole).length;
  }

  if (mode === "centerline" || mode === "both") {
    const skel = skeletonize(binary, width, height);
    let lines = traceSkeleton(skel, width, height);
    lines = lines
      .map((p) => mergeCollinear(simplifyRDP(p, simplify * 0.85)))
      .filter((p) => p.length >= 4)
      .sort((a, b) => b.length - a.length)
      .slice(0, maxContours);
    result.engrave = lines.map(ptsToOpenPath);
    result.stats.engravePaths = result.engrave.length;
  }

  return result;
}

export function buildPreviewSvg({ cut, engrave, width, height }) {
  const cutPaths = cut
    .map(
      (d) =>
        `<path class="cut" d="${d}" fill="none" stroke="#ff3b30" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`
    )
    .join("\n");
  const engPaths = engrave
    .map(
      (d) =>
        `<path class="engrave" d="${d}" fill="none" stroke="#0a84ff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>`
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
${cutPaths}
${engPaths}
</svg>`;
}
