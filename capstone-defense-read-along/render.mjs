// Frame-accurate renderer: seeks the paused GSAP timeline in headless Chromium,
// screenshots every frame and encodes per-scene MP4 segments, then joins them.
//
//   node render.mjs                     render everything to out/capstone-defense.mp4
//   node render.mjs --scenes 01,16      re-render only those scenes, then re-join
//   node render.mjs --snapshot 12.5,300 write PNG stills at those times (seconds) to out/snapshots
//   node render.mjs --workers 3         parallel browser workers (default: CPU count - 1, at least 1)
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
// Uses the project's playwright if installed, else the globally installed one.
const { chromium } = createRequire(import.meta.url)("playwright");

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const meta = JSON.parse(readFileSync("scenes.json", "utf8"));
const FPS = meta.fps || 30;
const url = "file://" + resolve("index.html");
mkdirSync("out/segments", { recursive: true });

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(async () => { await document.fonts.ready; });
  return page;
}
const seek = (page, t) => page.evaluate((t) => { window.__timelines["capstone-defense"].seek(t, false); }, t);

const browser = await chromium.launch();

if (opt("--snapshot")) {
  mkdirSync("out/snapshots", { recursive: true });
  const page = await openPage(browser);
  for (const t of opt("--snapshot").split(",").map(Number)) {
    await seek(page, t);
    const f = `out/snapshots/t${t.toFixed(1).padStart(6, "0")}.png`;
    await page.screenshot({ path: f });
    console.log(f);
  }
  await browser.close();
  process.exit(0);
}

const only = opt("--scenes")?.split(",");
const queue = meta.scenes.filter((s) => !only || only.includes(s.scene));
const workers = Math.max(1, parseInt(opt("--workers") || String(Math.max(1, cpus().length - 1)), 10));

async function renderScene(page, s) {
  const f0 = Math.round(s.start * FPS);
  const n = Math.round((s.start + s.duration) * FPS) - f0;
  const outFile = `out/segments/scene-${s.scene}.mp4`;
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-tune", "animation", "-pix_fmt", "yuv420p", "-r", String(FPS), outFile],
    { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, bad) => ff.on("close", (c) => (c === 0 ? ok() : bad(new Error(`ffmpeg ${c} on ${s.scene}`)))));
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await seek(page, (f0 + i) / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  console.log(`scene ${s.scene}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

await Promise.all([...Array(Math.min(workers, queue.length))].map(async () => {
  const page = await openPage(browser);
  while (queue.length) await renderScene(page, queue.shift());
  await page.close();
}));
await browser.close();

// Join every scene segment (all must exist) into the final video.
const missing = meta.scenes.filter((s) => !existsSync(`out/segments/scene-${s.scene}.mp4`));
if (missing.length) { console.log("Not joining yet; missing segments:", missing.map((s) => s.scene).join(",")); process.exit(0); }
writeFileSync("out/segments/list.txt", meta.scenes.map((s) => `file 'scene-${s.scene}.mp4'`).join("\n") + "\n");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "out/segments/list.txt",
  "-c", "copy", "-movflags", "+faststart", "out/capstone-defense.mp4"], { stdio: "inherit" });
const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "out/capstone-defense.mp4"]).toString().trim();
console.log(`Wrote out/capstone-defense.mp4 (${(+dur).toFixed(1)}s, ${(+dur / 60).toFixed(2)} min)`);
