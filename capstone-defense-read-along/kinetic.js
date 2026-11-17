// Kinetic motion for the read-along video. Built synchronously at load, paused, and
// registered at window.__timelines["capstone-defense"]. Only opacity, visibility and
// transforms are animated, so any frame-seeking renderer gets the same picture.
(function () {
  const tl = gsap.timeline({ paused: true });
  const scenes = [...document.querySelectorAll("#stage .scene")];
  const ease = "power3.out";

  scenes.forEach((scene, si) => {
    const s = parseFloat(scene.dataset.start);
    const D = parseFloat(scene.dataset.duration);
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

    // Progress bar for the scene.
    tl.fromTo(scene.querySelector(".progress i"), { scaleX: 0 }, { scaleX: 1, duration: D, ease: "none", immediateRender: false }, s);

    // Slide elements: only the innermost .a elements move (group wrappers stay put).
    const leaves = [...scene.querySelectorAll(".frame .a")].filter((el) => !el.querySelector(".a"));
    const step = Math.min(0.13, 2.6 / Math.max(leaves.length, 1));
    let at = s + 0.4;
    leaves.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const st = el.getAttribute("style") || "";
      if (tag === "h1" || tag === "h2") {
        const words = el.querySelectorAll(".hw");
        tl.set(words, { opacity: 0, y: 56 }, s);
        tl.to(words, { opacity: 1, y: 0, duration: 0.65, ease, stagger: 0.05 }, at);
        at += Math.min(words.length * 0.05, 0.6);
      } else if (tag === "table") {
        const rows = el.querySelectorAll("tr");
        tl.set(rows, { opacity: 0, x: -48 }, s);
        tl.to(rows, { opacity: 1, x: 0, duration: 0.55, ease, stagger: 0.12 }, at);
        at += rows.length * 0.12;
      } else if (tag === "hr") {
        tl.set(el, { scaleX: 0, transformOrigin: "0% 50%" }, s);
        tl.to(el, { scaleX: 1, duration: 0.7, ease: "power4.out" }, at);
      } else if (tag === "svg") {
        tl.set(el, { opacity: 0, x: -30, scaleX: 0.2, transformOrigin: "0% 50%" }, s);
        tl.to(el, { opacity: 1, x: 0, scaleX: 1, duration: 0.6, ease: "back.out(2)" }, at);
      } else if (/border-radius/.test(st)) {
        // Cards pop up; any odometer inside rolls to its number.
        tl.set(el, { opacity: 0, y: 46, scale: 0.94 }, s);
        tl.to(el, { opacity: 1, y: 0, scale: 1, duration: 0.75, ease }, at);
        el.querySelectorAll(".strip").forEach((strip, k) => {
          const d = parseInt(strip.dataset.d, 10);
          tl.set(strip, { yPercent: 0 }, s);
          tl.to(strip, { yPercent: -(10 + d) * 5, duration: 1.6, ease: "power3.inOut" }, at + 0.15 + k * 0.12);
        });
      } else {
        const footer = /position:absolute/.test(st);
        tl.set(el, { opacity: 0, y: footer ? 12 : 28 }, s);
        tl.to(el, { opacity: 1, y: 0, duration: 0.6, ease }, footer ? s + 1.2 : at);
        if (footer) return;
      }
      at += step;
    });

    // Read-along captions: phrase rises in dim, each word lights up at reading pace, then lifts away.
    scene.querySelectorAll(".cap").forEach((cap) => {
      const t0 = s + parseFloat(cap.dataset.t0);
      const t1 = s + parseFloat(cap.dataset.t1);
      const speak = parseFloat(cap.dataset.speak);
      const words = [...cap.querySelectorAll(".w")];
      tl.set(cap, { opacity: 1, y: 0 }, t0);
      tl.fromTo(words, { opacity: 0, y: 26 }, { opacity: 0.32, y: 0, duration: 0.32, ease, stagger: 0.018, immediateRender: false }, t0);
      const chars = words.map((w) => w.textContent.length + 1);
      const totalChars = chars.reduce((a, b) => a + b, 0);
      let acc = 0;
      words.forEach((w, i) => {
        tl.to(w, { opacity: 1, duration: 0.18, ease: "none" }, t0 + 0.12 + (acc / totalChars) * speak);
        acc += chars[i];
      });
      tl.to(cap, { opacity: 0, y: -22, duration: 0.28, ease: "power2.in" }, t1 - 0.28);
    });
  });

  window.__timelines = window.__timelines || {};
  window.__timelines["capstone-defense"] = tl;
})();
