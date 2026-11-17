# Capstone defense: read-along kinetic text video

A silent 1920×1080, 30 fps motion-graphics video of the 16-slide proposal defense deck.
There is no voiceover and no music. Each slide animates in, and the narration shows
underneath it one phrase at a time. Each word lights up at speaking pace (130 words a
minute) so the presenter can read along while the video plays.

## Files

| File | Role |
| --- | --- |
| `slides-source.html` | The original deck (16 slides). Edit slide text here. |
| `scenes.json` | Narration per scene. Timing and caption chunks are written back here by the build. |
| `video.config.json` | Reading pace, pauses, caption length and the adviser name for slide 1. |
| `build-video.mjs` | Builds `index.html` from the three files above and computes all timing. |
| `index.html` + `kinetic.js` | The generated composition. One paused GSAP timeline at `window.__timelines["capstone-defense"]`. |
| `render.mjs` | Seeks the timeline frame by frame in headless Chromium and encodes with FFmpeg. |
| `QA-prep-not-narrated.md` | Rehearsal notes only. Not used in the video. |

## Commands

```bash
npm install                        # gsap + fonts (Playwright/Chromium must already be available)
node build-video.mjs               # regenerate index.html and timing
node render.mjs --snapshot 30,300  # PNG stills at those seconds -> out/snapshots/
node render.mjs                    # full render -> out/capstone-defense.mp4
node render.mjs --scenes 01        # re-render one scene and re-join (e.g. after setting the adviser name)
```

To speed up or slow down the whole video, change `words_per_minute` in `video.config.json`,
then run `node build-video.mjs` and `node render.mjs` again.
