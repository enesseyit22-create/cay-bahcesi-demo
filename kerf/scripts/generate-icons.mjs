#!/usr/bin/env node
/**
 * Generate store / adaptive icon set from canvas (Chrome).
 */
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "store", "icons");
const chrome =
  process.env.CHROME_PATH ||
  ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) =>
    fs.existsSync(p)
  );

const SIZES = [
  // Android
  ["android-legacy-48", 48],
  ["android-legacy-72", 72],
  ["android-legacy-96", 96],
  ["android-legacy-144", 144],
  ["android-legacy-192", 192],
  ["android-play-512", 512],
  ["android-adaptive-fg-432", 432],
  // iOS
  ["ios-20", 20],
  ["ios-29", 29],
  ["ios-40", 40],
  ["ios-58", 58],
  ["ios-60", 60],
  ["ios-76", 76],
  ["ios-80", 80],
  ["ios-87", 87],
  ["ios-120", 120],
  ["ios-152", 152],
  ["ios-167", 167],
  ["ios-180", 180],
  ["ios-1024", 1024],
  // PWA already has 192/512 under icons/
  ["pwa-192", 192],
  ["pwa-512", 512],
];

async function paint(page, size) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><canvas id="c" width="${size}" height="${size}"></canvas>
  <script>
  const c=document.getElementById('c'); const ctx=c.getContext('2d'); const s=${size};
  const g=ctx.createLinearGradient(0,0,s,s);
  g.addColorStop(0,'#0d7a78'); g.addColorStop(0.55,'#14919b'); g.addColorStop(1,'#b86b2c');
  // full bleed for store (no transparency for iOS marketing)
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
  ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=Math.max(2,s*0.07); ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(s*0.28,s*0.30); ctx.lineTo(s*0.28,s*0.70); ctx.lineTo(s*0.64,s*0.70);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s*0.42,s*0.42); ctx.lineTo(s*0.74,s*0.42); ctx.stroke();
  // small kerf notch
  ctx.beginPath();
  ctx.moveTo(s*0.64,s*0.70); ctx.lineTo(s*0.72,s*0.62);
  ctx.stroke();
  </script>`);
  const b64 = await page.evaluate(() => document.getElementById("c").toDataURL("image/png").split(",")[1]);
  return Buffer.from(b64, "base64");
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
for (const [name, size] of SIZES) {
  const buf = await paint(page, size);
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, buf);
  if (name === "pwa-192") fs.copyFileSync(file, path.join(root, "icons", "icon-192.png"));
  if (name === "pwa-512") fs.copyFileSync(file, path.join(root, "icons", "icon-512.png"));
  console.log("wrote", name, size);
}
await browser.close();
console.log("icons →", outDir);
