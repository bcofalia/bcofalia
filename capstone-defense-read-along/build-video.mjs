// Builds index.html (the kinetic read-along composition) from slides-source.html + scenes.json.
// No voiceover: each scene lasts as long as its narration takes to read aloud at
// video.config.json -> words_per_minute, plus pauses. Re-run after editing narration or settings.
//
// Usage: node build-video.mjs
import { readFileSync, writeFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync("video.config.json", "utf8"));
const cues = JSON.parse(readFileSync("cues.json", "utf8"));
const meta = JSON.parse(readFileSync("scenes.json", "utf8"));
const src = readFileSync("slides-source.html", "utf8");

const SPW = 60 / cfg.words_per_minute; // seconds per word
const r2 = (x) => Math.round(x * 100) / 100;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- 1. pull each slide's .frame markup out of the source deck ----------
const frames = {};
const blocks = src.split('<div class="clip scene" data-scene="').slice(1);
for (const b of blocks) {
  const id = b.slice(0, 2);
  let body = b.split("<!-- Voiceover")[0];
  const f0 = body.indexOf('<div class="frame"');
  const end = body.lastIndexOf("</div>"); // closing tag of the .clip
  frames[id] = body.slice(f0, end).trim();
}

// ---------- 2. kinetic markup tweaks (text, colours and layout unchanged) ----------
function kineticize(html) {
  // Split h1/h2 headings into word spans for a staggered word-by-word entrance.
  html = html.replace(/(<h[12] class="a"[^>]*>)([^<]+)(<\/h[12]>)/g, (_, o, txt, c) =>
    o + txt.trim().split(/\s+/).map((w) => `<span class="hw">${w}</span>`).join(" ") + c);
  // Big stat numbers ("25%") become rolling odometer digits.
  html = html.replace(/(<p style="[^"]*font-size:120px[^"]*">)(\d+)%(<\/p>)/g, (_, o, num, c) => {
    const strip = [...Array(20).keys()].map((i) => i % 10).join("<br>");
    const digits = [...num].map((d) =>
      `<span class="dg"><span class="strip" data-d="${d}">${strip}</span></span>`).join("");
    return o + `<span class="odo" aria-label="${num}%">${digits}%</span>` + c;
  });
  // Tables: put the white fill on the rows, so rows that have not appeared yet leave no empty box.
  html = html.replace(/(<table class="a" style="[^"]*);background:#FFFEFA"/g, '$1"');
  return html;
}

// ---------- 3. split narration into read-along caption chunks ----------
const CONJ = new Set(["and", "or", "but", "which", "so", "because", "with", "from", "to", "that", "using", "against", "while"]);
function splitWords(words) {
  const max = cfg.max_words_per_caption;
  if (words.length <= max) return [words];
  const mid = words.length / 2;
  const ok = (i) => i >= 4 && words.length - i >= 4;
  let best = -1;
  for (let i = 1; i < words.length; i++) // break after , ; :
    if (ok(i) && /[,;:]$/.test(words[i - 1]) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  if (best < 0)
    for (let i = 1; i < words.length; i++) // break before a conjunction
      if (ok(i) && CONJ.has(words[i].toLowerCase()) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  if (best < 0) best = Math.round(mid);
  return [...splitWords(words.slice(0, best)), ...splitWords(words.slice(best))];
}
function chunk(narration) {
  const sentences = narration.match(/[^.?!]+[.?!]+["’”]?/g) || [narration];
  const out = [];
  for (const s of sentences) {
    const parts = splitWords(s.trim().split(/\s+/));
    parts.forEach((p, i) => out.push({ words: p, sentenceEnd: i === parts.length - 1 }));
  }
  return out;
}

// ---------- 4. timing ----------
let t = 0;
const scenesOut = [];
for (const s of meta.scenes) {
  const chunks = chunk(s.narration);
  let c = cfg.lead_in_seconds;
  const caps = chunks.map((ch) => {
    const speak = ch.words.length * SPW;
    const dur = speak + (ch.sentenceEnd ? cfg.sentence_pause_seconds : cfg.clause_pause_seconds);
    // Each word lights up in proportion to its length across the phrase's speaking time.
    const lens = ch.words.map((w) => w.length + 1);
    const totalLen = lens.reduce((a, b) => a + b, 0);
    let acc = 0;
    const at = lens.map((l) => { const x = r2(c + 0.12 + (acc / totalLen) * speak); acc += l; return x; });
    const cap = { t0: r2(c), t1: r2(c + dur), speak: r2(speak), text: ch.words.join(" "), at };
    c += dur;
    return cap;
  });
  const duration = Math.ceil((c + cfg.tail_seconds) * 10) / 10;
  // Resolve cue phrases to the time their first word lights up.
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const words = caps.flatMap((cp) => cp.text.split(" ").map((w, i) => ({ w: norm(w), at: cp.at[i] })));
  const sceneCues = (cues[s.scene] || []).map(([target, phrase, fx]) => {
    const ph = phrase.split(/\s+/).map(norm);
    const i = words.findIndex((_, k) => ph.every((p, j) => words[k + j]?.w === p));
    if (i < 0) throw new Error(`Scene ${s.scene}: cue phrase not found in narration: "${phrase}"`);
    return { target, fx, t: words[i].at };
  });
  scenesOut.push({ s, start: r2(t), duration, caps, cues: sceneCues });
  t += duration;
}
const total = r2(t);

// ---------- 5. write index.html ----------
const sceneHtml = scenesOut.map(({ s, start, duration, caps, cues }) => {
  let frame = kineticize(frames[s.scene]);
  if (cfg.adviser_name) frame = frame.replace("[Adviser name]", esc(cfg.adviser_name));
  const capHtml = caps.map((c) => {
    const words = c.text.split(" ").map((w, i) => `<span class="w" data-at="${c.at[i]}"><span class="wi">${esc(w)}</span></span>`).join(" ");
    return `    <div class="cap" data-t0="${c.t0}" data-t1="${c.t1}" data-speak="${c.speak}"><p>${words}</p></div>`;
  }).join("\n");
  return `  <div class="clip scene" data-scene="${s.scene}" data-start="${start}" data-duration="${duration}" data-track-index="0" data-cues='${esc(JSON.stringify(cues))}'>
   <div class="slide-pos"><div class="slide-anim"><div class="slide-drift">
   ${frame}
   </div></div></div>
   <div class="progress"><i></i></div>
   <div class="cap-band">
${capHtml}
   </div>
  </div>`;
}).join("\n");

const head = src.slice(0, src.indexOf("<body>"))
  .replace(/<link rel="preconnect"[^>]*>\n/, "")
  .replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>\n/, "")
  .replace("</style>", `  @font-face { font-family:'Inter'; font-weight:100 900; src:url(assets/fonts/inter-latin-wght-normal.woff2) format('woff2'); unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
  @font-face { font-family:'Inter'; font-weight:100 900; src:url(assets/fonts/inter-latin-ext-wght-normal.woff2) format('woff2'); unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
  @font-face { font-family:'Space Grotesk'; font-weight:300 700; src:url(assets/fonts/space-grotesk-latin-wght-normal.woff2) format('woff2'); unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
  @font-face { font-family:'Space Grotesk'; font-weight:300 700; src:url(assets/fonts/space-grotesk-latin-ext-wght-normal.woff2) format('woff2'); unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
  html, body, #stage { background:#081B1E; }
  .clip { position:absolute; left:0; top:0; width:1920px; height:1080px; visibility:hidden; }
  .slide-pos { position:absolute; left:192px; top:28px; width:1920px; height:1080px; transform:scale(0.8); transform-origin:0 0; }
  .slide-anim, .slide-drift { position:absolute; left:0; top:0; width:1920px; height:1080px; }
  .slide-drift { border-radius:22px; overflow:hidden; box-shadow:0 0 0 2px rgba(244,241,232,.08), 0 40px 90px rgba(0,0,0,.5); }
  .hw { display:inline-block; }
  .odo { font-variant-numeric:tabular-nums; }
  .dg { display:inline-block; height:1.1em; overflow:hidden; vertical-align:top; }
  .strip { display:block; }
  .progress { position:absolute; left:192px; top:906px; width:1536px; height:4px; border-radius:2px; background:rgba(244,241,232,.12); overflow:hidden; }
  .progress i { display:block; width:100%; height:100%; background:#E0A526; transform:scaleX(0); transform-origin:0 50%; }
  .cap-band { position:absolute; left:160px; top:912px; width:1600px; height:156px; }
  .cap { position:absolute; left:0; top:0; width:1600px; height:156px; display:flex; align-items:center; justify-content:center; opacity:0; }
  .cap p { margin:0; max-width:1500px; text-align:center; font-family:'Inter', Arial, sans-serif; font-size:38px; font-weight:500; line-height:1.28; color:#F4F1E8; }
  .cap .w { display:inline-block; }
  .cap .wi { display:inline-block; opacity:0.32; }
  .scene table.a tr { background:#FFFEFA; }
  .fxw { display:inline-block; }
</style>`)
  .replace(/<title>[^<]*<\/title>/, "<title>Capstone Defense Read-Along</title>");

const html = `${head}<body>
<!-- GENERATED by build-video.mjs from slides-source.html + scenes.json. Do not edit by hand.
     Read-along kinetic text video: no audio. Timing comes from narration length at ${cfg.words_per_minute} wpm. -->
<div id="stage" data-composition-id="capstone-defense" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
${sceneHtml}
</div>

<script src="assets/js/gsap.min.js"></script>
<script src="kinetic.js"></script>
</body>
</html>
`;
writeFileSync("index.html", html);

// ---------- 6. update scenes.json (source of truth for timing) ----------
meta.total_seconds = total;
delete meta.total_seconds_estimated;
meta.mode = "read-along kinetic text, no audio";
meta.words_per_minute = cfg.words_per_minute;
meta.lead_in_seconds = cfg.lead_in_seconds;
meta.tail_seconds = cfg.tail_seconds;
meta.note = "Durations come from narration length at words_per_minute plus pauses (build-video.mjs). No voiceover is used.";
meta.scenes = scenesOut.map(({ s, start, duration, caps, cues }) => {
  const { audio_file, audio_offset, estimated_audio_seconds, audio_seconds, start: _a, duration: _b, captions: _c, slide_cues: _d, ...rest } = s;
  return { scene: s.scene, slide_id: s.slide_id, start, duration, ...rest,
    captions: caps.map(({ t0, t1, text }) => ({ t0, t1, text })),
    slide_cues: cues };
});
writeFileSync("scenes.json", JSON.stringify(meta, null, 2) + "\n");

const long = scenesOut.flatMap(({ s, caps }) => caps.filter((c) => c.text.split(" ").length > cfg.max_words_per_caption).map((c) => `${s.scene}: ${c.text}`));
console.log(`Built ${scenesOut.length} scenes, ${scenesOut.reduce((a, x) => a + x.caps.length, 0)} captions. Total ${total}s (${(total / 60).toFixed(1)} min).`);
for (const x of scenesOut) console.log(`  ${x.s.scene} ${x.s.slide_id.padEnd(10)} start ${String(x.start).padStart(7)}  dur ${x.duration}`);
if (long.length) console.log("Over-long captions:", long);
if (!cfg.adviser_name) console.log("NOTE: adviser_name is not set in video.config.json; scene 01 still shows [Adviser name].");
