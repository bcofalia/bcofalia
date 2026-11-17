// Kinetic motion for the read-along video. Built synchronously at load, paused, and
// registered at window.__timelines["capstone-defense"]. Only opacity, visibility and
// transforms are animated, so any frame-seeking renderer gets the same picture.
//
// Each scene opens with its label, title and footer. Every other slide element waits
// for its cue (cues.json): it appears as the read-along highlight reaches the matching
// narration words, with the effect named there.
(function () {
  const tl = gsap.timeline({ paused: true });
  const scenes = [...document.querySelectorAll("#stage .scene")];
  const ease = "power3.out";

  // Wrap every word of an element's text in a span so it can appear word by word.
  function splitWords(el) {
    const existing = el.querySelectorAll(".hw, .fxw");
    if (existing.length) return [...existing];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const sp = document.createElement("span");
        sp.className = "fxw";
        sp.textContent = part;
        frag.appendChild(sp);
      });
      node.parentNode.replaceChild(frag, node);
    });
    return [...el.querySelectorAll(".fxw")];
  }

  // Entrance effects. Each returns how long it takes, so cues can be spaced.
  const FX = {
    rise:  (el, t) => from(el, { opacity: 0, y: 44 }, { duration: 0.75, ease }, t),
    drop:  (el, t) => from(el, { opacity: 0, y: -44 }, { duration: 0.65, ease }, t),
    slide: (el, t) => from(el, { opacity: 0, x: -70 }, { duration: 0.7, ease }, t),
    pop:   (el, t) => from(el, { opacity: 0, scale: 0.82 }, { duration: 0.65, ease: "back.out(1.7)" }, t),
    zoom:  (el, t) => from(el, { opacity: 0, scale: 1.14 }, { duration: 0.85, ease }, t),
    fade:  (el, t) => from(el, { opacity: 0 }, { duration: 0.9, ease: "sine.out" }, t),
    wipe:  (el, t) => from(el, { opacity: 0, scaleX: 0, transformOrigin: "0% 50%" }, { duration: 0.7, ease: "power4.out" }, t),
    words: (el, t) => {
      const ws = splitWords(el);
      // A shaded box fades in with its first words instead of sitting empty.
      if (/background/.test(el.getAttribute("style") || "")) from(el, { opacity: 0 }, { duration: 0.4, ease: "sine.out" }, t);
      tl.set(ws, { opacity: 0, y: 30 }, sceneStart);
      tl.to(ws, { opacity: 1, y: 0, duration: 0.5, ease, stagger: 0.055 }, t);
    },
  };
  let sceneStart = 0;
  function from(el, fromVars, toVars, t) {
    const { transformOrigin, ...f } = fromVars;
    if (transformOrigin) tl.set(el, { transformOrigin }, sceneStart);
    tl.set(el, f, sceneStart);
    const to = {};
    for (const k of Object.keys(f)) to[k] = k === "opacity" || k === "scale" || k === "scaleX" ? 1 : 0;
    tl.to(el, { ...to, ...toVars }, t);
  }
  // Rolling odometer digits inside an element start shortly after it appears.
  function roll(el, t) {
    el.querySelectorAll(".strip").forEach((strip, k) => {
      const d = parseInt(strip.dataset.d, 10);
      tl.set(strip, { yPercent: 0 }, sceneStart);
      tl.to(strip, { yPercent: -(10 + d) * 5, duration: 1.6, ease: "power3.inOut" }, t + 0.15 + k * 0.12);
    });
  }

  scenes.forEach((scene, si) => {
    const s = parseFloat(scene.dataset.start);
    const D = parseFloat(scene.dataset.duration);
    sceneStart = s;
    const last = si === scenes.length - 1;
    const anim = scene.querySelector(".slide-anim");
    const drift = scene.querySelector(".slide-drift");

    // Clip visibility: each scene owns [s, s + D).
    tl.set(scene, { autoAlpha: 0 }, 0);
    tl.set(scene, { autoAlpha: 1 }, s);
    if (!last) tl.set(scene, { autoAlpha: 0 }, s + D);

    // Slide card: lift in, slow push-in for the whole scene, settle out at the end.
    tl.fromTo(anim, { opacity: 0, y: 60, scale: 0.965 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease, immediateRender: false }, s);
    tl.fromTo(drift, { scale: 1 }, { scale: 1.014, duration: D, ease: "none", immediateRender: false }, s);
    if (!last) tl.to(anim, { opacity: 0, y: -24, scale: 0.985, duration: 0.45, ease: "power2.in" }, s + D - 0.5);
    tl.fromTo(scene.querySelector(".progress i"), { scaleX: 0 }, { scaleX: 1, duration: D, ease: "none", immediateRender: false }, s);

    // Resolve cue targets.
    const leaves = [...scene.querySelectorAll(".frame .a")].filter((el) => !el.querySelector(".a"));
    const resolve = (key) => {
      const m = key.match(/^(\d+)(?:\.(tr|li)(\d+)|>(\d+))?$/);
      const leaf = leaves[+m[1]];
      if (m[2]) return leaf.querySelectorAll(m[2])[+m[3]];
      if (m[4] !== undefined) return leaf.children[+m[4]];
      return leaf;
    };
    const cues = JSON.parse(scene.dataset.cues || "[]").map((c) => ({ ...c, el: resolve(c.target) }));
    const cued = new Set(cues.map((c) => c.el));

    // Opening: elements with no cue of their own, and no cued parts inside them.
    const opening = leaves.filter((el) => !cued.has(el) && !cues.some((c) => el.contains(c.el)));
    const step = Math.min(0.14, 1.6 / Math.max(opening.length, 1));
    let at = s + 0.4;
    opening.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const footer = /position:absolute/.test(el.getAttribute("style") || "");
      if (footer) { FX.fade(el, s + 1.2); return; }
      if (tag === "h1" || tag === "h2") FX.words(el, at);
      else if (tag === "hr" || tag === "svg") FX.wipe(el, at);
      else if (tag === "table") el.querySelectorAll("tr").forEach((tr, k) => FX.slide(tr, at + k * 0.1));
      else FX.rise(el, at);
      roll(el, at);
      at += step;
    });

    // Cued elements: appear with the narration. Same-time cues get a small stagger.
    const seen = {};
    cues.forEach((c) => {
      const n = (seen[c.t] = (seen[c.t] || 0) + 1) - 1;
      const t = s + Math.max(0.3, c.t - 0.12) + n * 0.12;
      (FX[c.fx] || FX.rise)(c.el, t);
      roll(c.el, t);
    });

    // Read-along captions: the phrase rises in dim, each word lights up at its own time,
    // then the phrase lifts away. Entrance (.w) and highlight (.wi) are separate layers.
    scene.querySelectorAll(".cap").forEach((cap) => {
      const t0 = s + parseFloat(cap.dataset.t0);
      const t1 = s + parseFloat(cap.dataset.t1);
      const words = [...cap.querySelectorAll(".w")];
      tl.set(cap, { opacity: 1, y: 0 }, t0);
      tl.fromTo(words, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.32, ease, stagger: 0.018, immediateRender: false }, t0);
      words.forEach((w) => {
        tl.fromTo(w.firstElementChild, { opacity: 0.32 }, { opacity: 1, duration: 0.16, ease: "none", immediateRender: false }, s + parseFloat(w.dataset.at));
      });
      tl.to(cap, { opacity: 0, y: -22, duration: 0.28, ease: "power2.in" }, t1 - 0.28);
    });
  });

  window.__timelines = window.__timelines || {};
  window.__timelines["capstone-defense"] = tl;
})();
