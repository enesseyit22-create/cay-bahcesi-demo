#!/usr/bin/env node
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.join(root, "store", "screenshots");
const chrome =
  process.env.CHROME_PATH ||
  ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
const PORT = 8791;

fs.mkdirSync(out, { recursive: true });

function serve() {
  return spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
    cwd: root,
    stdio: "ignore",
  });
}

const server = serve();
await new Promise((r) => setTimeout(r, 800));

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});

const shots = [
  { name: "01-home", path: "/?lang=en", w: 1290, h: 2796 },
  { name: "02-studio", path: "/?demo=1&lang=en", w: 1290, h: 2796, after: "vector" },
  { name: "03-calc", path: "/?demo=1&lang=en", w: 1290, h: 2796, after: "calc" },
  { name: "04-paywall", path: "/?lang=en", w: 1290, h: 2796, after: "paywall" },
  { name: "05-home-tr", path: "/?lang=tr", w: 1290, h: 2796 },
  // Android phone-ish
  { name: "android-01-home", path: "/?lang=en", w: 1080, h: 1920 },
  { name: "android-02-studio", path: "/?demo=1&lang=en", w: 1080, h: 1920, after: "vector" },
  // iPad 13" portrait
  { name: "ipad-01-home", path: "/?lang=en", w: 2064, h: 2752 },
  { name: "ipad-02-studio", path: "/?demo=1&lang=en", w: 2064, h: 2752, after: "vector" },
  // Android 7" tablet
  { name: "tablet-01-home", path: "/?lang=en", w: 1200, h: 1920 },
  { name: "tablet-02-studio", path: "/?demo=1&lang=en", w: 1200, h: 1920, after: "vector" },
];

for (const s of shots) {
  const page = await browser.newPage();
  await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}${s.path}`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => localStorage.setItem("kerf.onboarding.v1", "1"));
  if (s.path.includes("demo") || s.after) {
    await page.reload({ waitUntil: "networkidle0" });
  }
  if (s.after === "vector") {
    await page.waitForFunction(() => document.querySelector("#processCanvas")?.width > 50, { timeout: 20000 });
    await page.evaluate(() => document.querySelector("#btnVectorize")?.click());
    await page.waitForFunction(() => document.querySelectorAll("#svgPreview path").length > 0, { timeout: 60000 });
  }
  if (s.after === "calc") {
    await page.waitForFunction(() => document.querySelector("#processCanvas")?.width > 50, { timeout: 20000 });
    await page.evaluate(() => document.querySelector("#btnVectorize")?.click());
    await page.waitForFunction(() => document.querySelectorAll("#svgPreview path").length > 0, { timeout: 60000 });
    await page.evaluate(() => document.querySelector('.tabbar-item[data-nav="calc"]')?.click());
    await page.waitForSelector("#view-calc:not([hidden])");
  }
  if (s.after === "paywall") {
    await page.evaluate(() => document.querySelector("#btnOpenPaywall")?.click());
    await page.waitForSelector("#paywall[open]");
  }
  const file = path.join(out, `${s.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", file);
  await page.close();
}

await browser.close();
server.kill();
console.log("screenshots →", out);
