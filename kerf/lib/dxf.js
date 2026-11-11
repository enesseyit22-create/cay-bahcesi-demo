/**
 * DXF R12 writer — mm units, CUT / ENGRAVE layers, Y-up CAD coords.
 */

function parsePathPoints(d) {
  const tokens = d.match(/[MLZmlz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  const polys = [];
  let cur = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "M" || t === "m") {
      if (cur.length) polys.push(cur);
      cur = [];
      i++;
      cur.push({ x: parseFloat(tokens[i++]), y: parseFloat(tokens[i++]) });
    } else if (t === "L" || t === "l") {
      i++;
      cur.push({ x: parseFloat(tokens[i++]), y: parseFloat(tokens[i++]) });
    } else if (t === "Z" || t === "z") {
      i++;
      if (cur.length) {
        polys.push({ pts: cur, closed: true });
        cur = [];
      }
    } else {
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) cur.push({ x, y });
    }
  }
  if (cur.length) polys.push({ pts: cur, closed: false });
  // normalize legacy bare arrays
  return polys.map((p) => (Array.isArray(p) ? { pts: p, closed: true } : p));
}

function ent(code, value) {
  return `${code}\n${value}\n`;
}

function writePolyline(out, pts, closed, layer, height, flipY) {
  if (pts.length < 2) return out;
  out += ent(0, "POLYLINE");
  out += ent(8, layer);
  out += ent(66, 1);
  out += ent(70, closed ? 1 : 0);
  for (const p of pts) {
    const y = flipY ? height - p.y : p.y;
    out += ent(0, "VERTEX");
    out += ent(8, layer);
    out += ent(10, p.x.toFixed(4));
    out += ent(20, y.toFixed(4));
    out += ent(30, "0.0");
  }
  out += ent(0, "SEQEND");
  out += ent(8, layer);
  return out;
}

function layerTable(name, color) {
  let s = "";
  s += ent(0, "LAYER");
  s += ent(2, name);
  s += ent(70, 0);
  s += ent(62, color);
  s += ent(6, "CONTINUOUS");
  return s;
}

/**
 * @param {{ cut: string[], engrave: string[], height: number, flipY?: boolean }} opts
 */
export function pathsToDxf({ cut = [], engrave = [], height, flipY = true }) {
  let out = "";
  out += ent(0, "SECTION");
  out += ent(2, "HEADER");
  out += ent(9, "$ACADVER");
  out += ent(1, "AC1009");
  out += ent(9, "$INSUNITS");
  out += ent(70, 4); // millimeters
  out += ent(9, "$MEASUREMENT");
  out += ent(70, 1); // metric
  out += ent(0, "ENDSEC");

  out += ent(0, "SECTION");
  out += ent(2, "TABLES");
  out += ent(0, "TABLE");
  out += ent(2, "LAYER");
  out += ent(70, 3);
  out += layerTable("0", 7);
  out += layerTable("CUT", 1); // red
  out += layerTable("ENGRAVE", 5); // blue
  out += ent(0, "ENDTAB");
  out += ent(0, "ENDSEC");

  out += ent(0, "SECTION");
  out += ent(2, "ENTITIES");

  for (const d of cut) {
    for (const poly of parsePathPoints(d)) {
      out = writePolyline(out, poly.pts, poly.closed !== false, "CUT", height, flipY);
    }
  }
  for (const d of engrave) {
    for (const poly of parsePathPoints(d)) {
      out = writePolyline(out, poly.pts, !!poly.closed, "ENGRAVE", height, flipY);
    }
  }

  out += ent(0, "ENDSEC");
  out += ent(0, "EOF");
  return out;
}

export function downloadText(filename, text, mime = "application/octet-stream") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function stampName(base, ext) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${base}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}
