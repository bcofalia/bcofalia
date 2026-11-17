# Prompt: turn the capstone defense deck into a narrated video

Paste everything below the line into your coding agent, with this folder open as the project.

---

You are building a narrated 1920×1080 video from a finished slide deck. The project folder holds:

- `index.html`: a HyperFrames composition. It has 16 scenes, one per slide, laid out at 1920×1080. Each scene is a `.clip` with `data-start` and `data-duration`. GSAP drives the entrance animations from one paused timeline, registered at `window.__timelines["capstone-defense"]`.
- `scenes.json`: the source of truth for each scene. It holds the slide id, the narration text (`narration`), a pronunciation-safe version for text-to-speech (`tts_text`) and the target audio file name.
- `sync-durations.mjs`: reads the real length of each voiceover file with ffprobe, then rewrites the timing in both `index.html` and `scenes.json`.
- `audio/`: empty. The voiceover files go here.
- `QA-prep-not-narrated.md`: rehearsal notes only. Do not put them in the video.

Do the work in this order. Do not change the slide text, colors, fonts or layout unless a step below says to.

## Step 1. Fill the one remaining placeholder

In `index.html`, scene 01, replace `[Adviser name]` with: ADVISER_NAME_HERE. If I left this as ADVISER_NAME_HERE, stop and ask me for the name.

## Step 2. Generate the voiceover

For each scene in `scenes.json`, create `audio/scene-NN.mp3` from its `tts_text` field.

- Use Google's text-to-speech: Gemini TTS through the Gemini API, or Google Cloud Text-to-Speech. Use whichever one I have credentials for, and ask me if neither is set up.
- Use one voice for all 16 files: a calm, clear, adult male English voice at a measured presentation pace, about 145 words a minute. Keep the same voice and settings for every scene.
- The narration is spoken in the first person by the candidate, Teddy Javines. Only clone his voice if he has recorded the samples himself and agreed to it. Otherwise use a standard synthetic voice.
- Save each file as MP3, mono, 44.1 or 48 kHz. Listen to scenes 01, 09 and 16 and check for mispronounced terms such as PRISMA, Cohen's kappa and MMAT. If any are wrong, adjust `tts_text` and regenerate that scene.

## Step 3. Sync the timing to the audio

Run `node sync-durations.mjs`. It needs ffprobe on the PATH. It leaves 0.5 s before each scene's audio and 1.0 s after it, and it updates the total length on the root element. Do not edit the timing by hand.

## Step 4. Render

### Route A: HyperFrames (preferred, since the composition is already written for it)

Requirements: Node.js 22+ and FFmpeg.

1. Read the HyperFrames docs (github.com/heygen-com/hyperframes and its core package reference) before changing anything. Run every command below through `npx hyperframes`.
2. Run `npx hyperframes lint`, then `npx hyperframes validate`, then `npx hyperframes inspect`. Fix every error the HyperFrames way. Keep the timeline paused and built synchronously. Keep `<audio>` elements as direct children of the root. Animate only opacity and transform. Do not call `play()` on media.
3. Run `npx hyperframes snapshot` at the midpoint of scenes 01, 07, 12 and 16. Check that no text is cut off and that the arrows and tables show.
4. Run `npx hyperframes preview` and watch the first two scenes with sound. Then `npx hyperframes render` to `out/capstone-defense.mp4`.

### Route B: Remotion (if HyperFrames will not render)

1. `npx create-video@latest`, blank TypeScript template. One composition `CapstoneDefense`: 1920×1080, 30 fps, `durationInFrames` = round(`total_seconds` × 30) from `scenes.json`.
2. Build one React component per scene. Port its markup from `index.html` (the `.frame` div inside each `[data-scene]`) to JSX, turning inline styles into style objects. Load Inter and Space Grotesk with `@remotion/google-fonts`.
3. Place each scene in a `<Sequence>` at `start × 30` for `duration × 30` frames. Inside it, add `<Audio src={staticFile("audio/scene-NN.mp3")} />` starting 15 frames in (0.5 s).
4. Recreate the entrance animation with `interpolate` or `spring` and `useCurrentFrame`: every element with class `a` fades from opacity 0 and 28 px down to its place over 18 frames. It starts 8 frames into the scene, with a stagger of 4 frames per element. Do not use CSS animations or transitions.
5. Run `npx remotion studio` to check, then `npx remotion render CapstoneDefense out/capstone-defense.mp4`.

## Step 5. Check the result

- The video is about 11 to 12 minutes long and has 16 scenes.
- The audio for each scene starts with its slide and does not run into the next one.
- The text matches the slides exactly. There is no leftover `[Adviser name]`.
- Tell me the final length, the path to the MP4, and any slide you had to change and why.
