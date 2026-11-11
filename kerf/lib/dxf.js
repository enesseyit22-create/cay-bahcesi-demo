/**
 * Minimal DXF R12 writer for closed LWPOLYLINE / POLYLINE entities.
 * Units: caller supplies coordinates already in mm (or desired CAD units).
 */

function parsePathPoints(d) {
  const cmds = d.match(/[MLZ]|-?\d+\.?\d*/gi) || [];
  const polys = [];
  let cur = [];
  let i = 0;
  while (i < cmds.length) {
    const t = cmds[i];
    if (t === "M" || t === "m") {
      if (cur.length) polys.push(cur);
      cur = [];
      i++;
      const x = parseFloat(cmds[i++]);
      const y = parseFloat(cmds[i++]);
      cur.push({ x, y });
    } else if (t === "L" || t === "l") {
      i++;
      const x = parseFloat(cmds[i++]);
      const y = parseFloat(cmds[i++]);
      cur.push({ x, y });
    } else if (t === "Z" || t === "z") {
      i++;
      if (cur.length) {
        polys.push(cur);
        cur = [];
      }
    } else {
      // bare number pair fallback
      const x = parseFloat(cmds[i++]);
      const y = parseFloat(cmds[i++]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) cur.push({ x, y });
    }
  }
  if (cur.length) polys.push(cur);
  return polys;
}

function ent(code, value) {
  return `${code}\n${value}\n`;
}

/**
 * @param {{ paths: string[], height: number, flipY?: boolean }} opts
 * SVG Y grows down; DXF Y grows up — flip by default using height.
 */
export function pathsToDxf({ paths, height, flipY = true }) {
  let out = "";
  out += ent(0, "SECTION");
  out += ent(2, "HEADER");
  out += ent(9, "$ACADVER");
  out += ent(1, "AC1009");
  out += ent(0, "ENDSEC");

  out += ent(0, "SECTION");
  out += ent(2, "TABLES");
  out += ent(0, "ENDSEC");

  out += ent(0, "SECTION");
  out += ent(2, "ENTITIES");

  for (const d of paths) {
    const polys = parsePathPoints(d);
    for (const poly of polys) {
      if (poly.length < 2) continue;
      out += ent(0, "POLYLINE");
      out += ent(8, "KERF_CUT");
      out += ent(66, 1);
      out += ent(70, 1); // closed
      for (const p of poly) {
        const y = flipY ? height - p.y : p.y;
        out += ent(0, "VERTEX");
        out += ent(8, "KERF_CUT");
        out += ent(10, p.x.toFixed(4));
        out += ent(20, y.toFixed(4));
        out += ent(30, "0.0");
      }
      out += ent(0, "SEQEND");
      out += ent(8, "KERF_CUT");
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
  a.click();
  URL.revokeObjectURL(url);
}
