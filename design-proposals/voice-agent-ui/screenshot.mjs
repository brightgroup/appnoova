import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(dir, "screenshots");
mkdirSync(outDir, { recursive: true });

const pages = [
  { file: "index.html", name: "00-index", full: true },
  { file: "01-elevenlabs-inspired.html", name: "01-elevenlabs-inspired", full: true },
  { file: "02-noova-clean.html", name: "02-noova-clean", full: true }
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2
});

for (const page of pages) {
  const url = pathToFileURL(resolve(dir, page.file)).href;
  const tab = await context.newPage();
  await tab.goto(url, { waitUntil: "networkidle" });
  const out = resolve(outDir, `${page.name}.png`);
  await tab.screenshot({ path: out, fullPage: page.full });
  console.log("wrote", out);
  await tab.close();
}

await browser.close();
console.log("done");
