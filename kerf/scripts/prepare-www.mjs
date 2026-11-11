#!/usr/bin/env node
/**
 * Copy web assets into www/ for Capacitor sync (excludes native/store tooling).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const www = path.join(root, "www");

const SKIP = new Set([
  "www",
  "android",
  "ios",
  "node_modules",
  "scripts",
  "store",
  "KERF-app-desktop.zip",
  "package.json",
  "package-lock.json",
  "capacitor.config.ts",
  "capacitor.config.json",
  ".gitignore",
]);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (SKIP.has(name)) continue;
    if (name.startsWith(".")) continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

fs.rmSync(www, { recursive: true, force: true });
copyDir(root, www);
fs.writeFileSync(
  path.join(www, "native-bridge.js"),
  `/* injected marker for Capacitor builds */\nwindow.__KERF_NATIVE__ = true;\n`
);
console.log("www/ ready for cap sync");
