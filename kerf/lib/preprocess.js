/** Professional sketch preprocessing for laser/CNC line-art. */

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel yüklenemedi"));
    };
    img.src = url;
  });
}

export function drawImageToCanvas(img, canvas, maxSide = 1600) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { w, h, ctx };
}

function toGray(data, w, h) {
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return gray;
}

function boxBlur(src, w, h, radius) {
  if (radius <= 0) return Float32Array.from(src);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const r = radius;
  const norm = 1 / (r * 2 + 1);

  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum * norm;
      sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * norm;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Otsu global threshold */
export function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.min(255, gray[i] | 0)]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      thr = t;
    }
  }
  return thr;
}

/** Sauvola local adaptive threshold → binary 1=ink */
function sauvola(gray, w, h, window = 25, k = 0.34, R = 128) {
  const mean = boxBlur(gray, w, h, (window / 2) | 0);
  // approx std via E[x^2] - mean^2
  const sq = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) sq[i] = gray[i] * gray[i];
  const meanSq = boxBlur(sq, w, h, (window / 2) | 0);
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < gray.length; i++) {
    const m = mean[i];
    const s = Math.sqrt(Math.max(0, meanSq[i] - m * m));
    const t = m * (1 + k * (s / R - 1));
    out[i] = gray[i] < t ? 1 : 0;
  }
  return out;
}

function sobelMag(gray, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] +
        gray[i - w + 1] -
        2 * gray[i - 1] +
        2 * gray[i + 1] -
        gray[i + w - 1] +
        gray[i + w + 1];
      const gy =
        -gray[i - w - 1] -
        2 * gray[i - w] -
        gray[i - w + 1] +
        gray[i + w - 1] +
        2 * gray[i + w] +
        gray[i + w + 1];
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

function morph(binary, w, h, op, iterations = 1) {
  let cur = Uint8ClampedArray.from(binary);
  const next = new Uint8ClampedArray(w * h);
  for (let n = 0; n < iterations; n++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        let min = 1;
        let max = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const v = cur[(y + dy) * w + (x + dx)];
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        next[i] = op === "erode" ? min : max;
      }
    }
    cur = Uint8ClampedArray.from(next);
  }
  return cur;
}

export function morphOpen(binary, w, h, n = 1) {
  return morph(morph(binary, w, h, "erode", n), w, h, "dilate", n);
}

export function morphClose(binary, w, h, n = 1) {
  return morph(morph(binary, w, h, "dilate", n), w, h, "erode", n);
}

/** Auto-crop to ink bounding box with padding */
export function autoCropBinary(binary, w, h, pad = 8) {
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!binary[y * w + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return { binary, width: w, height: h, crop: null };
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const nw = maxX - minX + 1;
  const nh = maxY - minY + 1;
  const out = new Uint8ClampedArray(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      out[y * nw + x] = binary[(y + minY) * w + (x + minX)];
    }
  }
  return { binary: out, width: nw, height: nh, crop: { minX, minY, maxX, maxY } };
}

/**
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {{ mode: 'sketch'|'print'|'edge', blur: number, threshold: number, adaptive: boolean, invert: boolean| 'auto', clean: number, autoCrop: boolean }} opts
 */
export function processToBinary(sourceCanvas, opts) {
  const {
    mode = "sketch",
    blur = 1,
    threshold = 0, // 0 = auto otsu
    adaptive = true,
    invert = "auto",
    clean = 1,
    autoCrop = true,
  } = opts;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, w, h);
  let gray = toGray(data, w, h);
  gray = boxBlur(gray, w, h, blur);

  let binary;
  let usedThr = threshold;

  if (mode === "edge") {
    const mag = sobelMag(gray, w, h);
    let max = 0;
    for (let i = 0; i < mag.length; i++) if (mag[i] > max) max = mag[i];
    const t = threshold > 0 ? threshold : max * 0.18;
    usedThr = t;
    binary = new Uint8ClampedArray(w * h);
    for (let i = 0; i < mag.length; i++) binary[i] = mag[i] > t ? 1 : 0;
  } else if (adaptive && mode === "sketch") {
    binary = sauvola(gray, w, h, 31, 0.32, 128);
    usedThr = otsuThreshold(gray);
  } else {
    usedThr = threshold > 0 ? threshold : otsuThreshold(gray);
    binary = new Uint8ClampedArray(w * h);
    for (let i = 0; i < gray.length; i++) binary[i] = gray[i] < usedThr ? 1 : 0;
  }

  // auto invert: ink should be minority for sketches
  if (invert === "auto") {
    let ink = 0;
    for (let i = 0; i < binary.length; i++) ink += binary[i];
    if (ink > binary.length * 0.55) {
      for (let i = 0; i < binary.length; i++) binary[i] = binary[i] ? 0 : 1;
    }
  } else if (invert === true) {
    for (let i = 0; i < binary.length; i++) binary[i] = binary[i] ? 0 : 1;
  }

  if (clean > 0) {
    binary = morphOpen(binary, w, h, clean);
    binary = morphClose(binary, w, h, clean);
  }

  let width = w;
  let height = h;
  let crop = null;
  if (autoCrop) {
    const cropped = autoCropBinary(binary, w, h, 12);
    binary = cropped.binary;
    width = cropped.width;
    height = cropped.height;
    crop = cropped.crop;
  }

  return { binary, width, height, threshold: usedThr, crop };
}

export function paintBinary(canvas, binary, width, height) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < binary.length; i++) {
    const v = binary[i] ? 12 : 245;
    const o = i * 4;
    img.data[o] = v;
    img.data[o + 1] = v;
    img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
