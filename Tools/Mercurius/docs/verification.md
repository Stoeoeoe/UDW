# Verification history

## Portrait playground

The current workspace targets 1080×1920 portrait video. The initial landscape checks below are historical and describe the first commit, not the current render dimensions or palette.

- Type checking, lint, workflow tests, episode validation, and the Vite production build passed after the portrait/font changes.
- Browser checks covered all nine studies in Terracotta and Paper & ink. No diagram text extended beyond its SVG viewport, both code variants highlighted successfully, and all three requested local fonts loaded.
- The browser playground uses the same StudyScene components registered under Studio's Playground folder. Its interface guides are a preview-only house overlay.

## Initial landscape foundation

Verified on 17 November 2026 with Windows, Node 24.14.0, npm 11.9.0, and Remotion 4.0.544.

- Clean `npm ci` succeeded in an isolated directory using copies of the committed manifest/lockfile.
- Type checking and linting passed. Workflow tests exercised authored demo assets, invalid metadata/timing, duplicate IDs, missing/outside assets, scaffold creation, and overwrite refusal. Episode validation passed.
- Studio opened both demo and Showcase, each registered at 1920×1080, 30 FPS, 720 frames.
- Complete out/demo.mp4 rendered successfully as H.264/yuv420p. Browser playback reached the end at 24 seconds, 1920×1080, without decode errors or dropped frames during the check. The clip intentionally has no narration/audio track.
- Inspected full-resolution stills at frames 90, 330, 450, and 630: title, highlighted C#, dependency edge and labels, callout, local SVG, media caption, and closing layout. Text remained within safe margins; no clipping was observed. The code holds before emphasis and the final scene holds for six seconds, including its transition.
- Studio seek sequence 450 → 210 → 450 restored identical line opacities and callout visibility. At 210, lines were undimmed and the callout hidden; at 450, lines 5/7 were emphasized and the callout visible.
- Repeated direct rendering of demo frame 450 produced identical PNG SHA-256: `AA7C60EE5B7682139E1C3C3F14B94DDFA4E0C4932B6E7727C426F1C5ADACCFE3`.
- Showcase's computed Badge background/text/border matched canvas/accent/accent. Button and Paper matched raised/ink/border. Both local font families were loaded. These checks verify the deliberate Tailwind overrides of Mantine's layered classes.

The Windows execution sandbox prevented tsx from reading OS user information (`uv_os_get_passwd`); tests and rendering were run with normal host permissions. This was an execution environment restriction, not a production fallback.

The current Remotion ESLint configuration carries 11 transitive npm audit advisories (7 moderate, 4 high) through its TypeScript ESLint/globbing dependencies. Updating ESLint to 10.15.0 removed one additional scaffold advisory. A nonbreaking npm audit fix did not resolve the remaining findings; npm proposed downgrading the Remotion configuration. No forced downgrade or dependency overrides were introduced. Recheck upstream lint tooling on the next dependency update.

Generated previews, the MP4, and install-check files live under ignored out/. They are local verification artifacts, not tracked source assets.
