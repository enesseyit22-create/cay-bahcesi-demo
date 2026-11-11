/** Image preprocessing for line-art extraction. */

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

export function drawImageToCanvas(img, canvas, maxSide = 1200) {
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

function boxBlurGray(src, w, h, radius) {
  if (radius <= 0) return src;
  const tmp = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  const r = radius;

  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) {
      const xx = Math.min(w - 1, Math.max(0, x));
      sum += src[y * w + xx];
    }
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / (r * 2 + 1);
      const remove = Math.min(w - 1, Math.max(0, x - r));
      const add = Math.min(w - 1, Math.max(0, x + r + 1));
      sum += src[y * w + add] - src[y * w + remove];
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) {
      const yy = Math.min(h - 1, Math.max(0, y));
      sum += tmp[yy * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / (r * 2 + 1));
      const remove = Math.min(h - 1, Math.max(0, y - r));
      const add = Math.min(h - 1, Math.max(0, y + r + 1));
      sum += tmp[add * w + x] - tmp[remove * w + x];
    }
  }
  return out;
}

function sobelEdges(gray, w, h) {
  const out = new Uint8ClampedArray(w * h);
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
      out[i] = Math.min(255, Math.hypot(gx, gy));
    }
  }
  return out;
}

/**
 * @returns {{ binary: Uint8ClampedArray, width: number, height: number }}
 */
export function processToBinary(sourceCanvas, opts) {
  const { threshold = 128, blur = 1, invert = true, edgeMode = false } = opts;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, w, h);

  let gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }

  gray = boxBlurGray(gray, w, h, blur);

  if (edgeMode) {
    gray = sobelEdges(gray, w, h);
  }

  const binary = new Uint8ClampedArray(w * h);
  for (let i = 0; i < gray.length; i++) {
    let on = gray[i] < threshold ? 1 : 0;
    if (!invert && !edgeMode) on = 1 - on;
    if (edgeMode) on = gray[i] > threshold * 0.35 ? 1 : 0;
    binary[i] = on;
  }

  return { binary, width: w, height: h };
}

export function paintBinary(canvas, binary, width, height) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < binary.length; i++) {
    const v = binary[i] ? 0 : 255;
    const o = i * 4;
    img.data[o] = v;
    img.data[o + 1] = v;
    img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
