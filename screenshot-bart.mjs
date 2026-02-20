/**
 * screenshot-bart.mjs — Captures key views of bart.html for rapid iteration.
 *
 * Usage:
 *   node screenshot-bart.mjs              # requires vite dev server on :4173
 *   node screenshot-bart.mjs 4178         # custom port
 *
 * Outputs 4 PNGs to feedback-img/:
 *   bart-front.png, bart-34.png, bart-left.png, bart-closeup.png
 *
 * Tip: keep `npm run dev -- --host 127.0.0.1 --port 4173` running in a
 * separate terminal so this script finishes in ~8 s instead of 15+.
 */
import { chromium } from "playwright";

const PORT = process.argv[2] || 4173;
const URL = `http://127.0.0.1:${PORT}/bart.html`;
const DIR = "feedback-img";

// Grid layout: 4 cols × 2 rows, each cell 600×600, header 36px
const VIEWS = [
  { name: "bart-front",   clip: { x: 0,    y: 36,  width: 600, height: 600 } },
  { name: "bart-34",      clip: { x: 0,    y: 636, width: 600, height: 600 } },
  { name: "bart-left",    clip: { x: 1200, y: 36,  width: 600, height: 600 } },
  { name: "bart-closeup", clip: { x: 1800, y: 636, width: 600, height: 600 } },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"],
});

const page = await browser.newPage({ viewport: { width: 2400, height: 1260 } });

console.log(`Fetching ${URL} ...`);
await page.goto(URL, { waitUntil: "networkidle", timeout: 15000 });

// Wait for WebGL context recovery (8 renderers can cause context churn)
await page.waitForTimeout(5000);

// Force re-render after context restore
await page.evaluate(() => {
  if (typeof renderAll === "function") renderAll();
});
await page.waitForTimeout(1000);

for (const v of VIEWS) {
  const path = `${DIR}/${v.name}.png`;
  await page.screenshot({ path, clip: v.clip });
  console.log(`  saved ${path}`);
}

await browser.close();
console.log("Done.");
