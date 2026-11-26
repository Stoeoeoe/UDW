# Clips and FilmCraft

Start `npm run playground` in Tools/Mercurius and open [Clips](http://127.0.0.1:3109/#clips). This local workbench and its command-line client use the same clip service. No AI account is needed for the manual controls.

## Author and render

Choose a clip, or create a curtain, code walkthrough, or dependency diagram. Edit the content and timing on the right. All timing inputs are integer frames at 30 FPS. Live preview has playback and first/middle/last-frame checkpoints. Invalid inputs stop preview and rendering and show the reason.

**Save** writes `clips/<id>.json`. **Save & render** saves those inputs and starts the registered MercuriusClip composition. The render uses a snapshot, so editing the clip while it renders does not change that revision. One render runs at a time; cancellation stops its renderer process tree on Windows. Render status/progress and errors appear below the preview.

Completed revisions have immutable MP4 files and matching JSON input records under `media/<clip-id>/`. Each render is checked with FilmCraft's probe for 1080×1920, 30 FPS, and its authored duration before becoming available. The rendered-revision view plays the actual encoded file; **Download MP4** works without a live FilmCraft connection. The first preset is opaque H.264. Alpha overlays are not offered yet.

`media/` is ignored by Git but is durable working media, not a scratch/cache directory. Back it up and include it when moving a FilmCraft project. `MERCURIUS_MEDIA_ROOT` can select another durable media directory before starting the server. Do not delete an old revision while a FilmCraft project references it. Preview/test files remain under ignored `out/`.

The constructor starter clips reuse the playground's illustrative Delivery/Inventory example; they make no claims about implemented game code. Replace their content with your authored explanation and evidence before publishing.

## Connect FilmCraft

The service expects FilmCraft and its CLI. The verified Windows install is `C:/Program Files/ArtCraft/FilmCraft/`; set `FILMCRAFT_EXE` and `FILMCRAFT_CLI` before starting the server for other locations/platforms.

**Launch connected FilmCraft** opens a separate controlled desktop session. Enter an existing absolute `.fcproj` path, or leave it empty for a new project. Other FilmCraft windows are not closed or taken over. Create/open a portrait sequence in that session and click **Refresh connection & targets**. The session uses `.local/filmcraft` for its own settings and recovery files. Normal FilmCraft saving stays in FilmCraft; the workbench does not silently save or replace your project file.

If the connected project has no open sequence, Mercurius now shows **Create portrait sequence**. Give it a name and click the button to create a 1080×1920 / 30 FPS timeline in FilmCraft. The workbench selects **Place on timeline**, Video 1, and frame 0 for this new empty sequence. Click **Place revision** to add the chosen render. Merely being connected does not mean a timeline already exists.

To connect to a session you launch yourself, start FilmCraft with `--control <port>` and the same environment variables supplied to the workbench: `FILMCRAFT_CONTROL_PORT` (default 9876) and a fresh `FILMCRAFT_CONTROL_TOKEN` of 64 random hex characters. Keep the token in the inherited environment, never in a recipe or committed configuration. The workbench-generated token stays in the server process; restarting that process may require a newly connected session. A normally launched FilmCraft window is not automatically controllable.

## Handoff

Select a completed revision and an action:

- **Add to bin only:** import it into the Mercurius bin; drag it into the edit yourself. Imported entries receive the clip name and revision ID.
- **Place on timeline:** choose a video track and an absolute start frame. Placement requires a 1080×1920 / 30 FPS sequence and a free, unlocked range. Existing clips do not ripple or get overwritten.
- **Replace one occurrence:** choose the timeline clip. The handoff imports the revision and replaces that occurrence with `keepSourceIn: true`.
- **Update all uses:** choose a timeline clip to identify the shared media item. The workbench lists its uses across project sequences and replaces the item's footage. This changes all references to that media item.

Replacement checks the required source out-point, including trims and speed changes, against the new revision's duration. All-use replacement checks references in other sequences too. A short revision or a locked affected track is rejected before replacement. Actual animation content may still require editorial review even when the source duration fits.

Refresh before handing off if you have edited FilmCraft. The destination stamp includes the inspected project and sequences; stale requests are rejected. After import, the target sequence is read again before placement/replacement. If the timeline changed during import, the file remains in the bin and the message reports that the timeline action was not applied. FilmCraft and Mercurius do not provide a transaction spanning multiple commands; import, renaming, and replacement have their normal FilmCraft undo steps. If connection is lost after submitting a command, inspect the project before retrying rather than risking duplicate insertion.

Rendering does not automatically import or replace anything. A completed revision remains available if handoff fails. No replacement or placement runs against an unconnected/headless copy of the user's project.

## Agent commands

Keep the local server running, then use:

```sh
npm run clips -- list
npm run clips -- save clips/curtain-intro.json
npm run clips -- render curtain-intro
npm run clips -- status
npm run clips -- cancel <render-id>
npm run clips -- launch <absolute-project.fcproj>
npm run clips -- filmcraft
npm run clips -- sequence <request.json>
npm run clips -- handoff <request.json>
```

`render` starts a job; poll `status` until complete/failed/cancelled. Polling does not start another render. To produce several clips, render them sequentially. The client exits nonzero on service errors and does not silently retry mutations. The same JSON recipes open in the manual UI; saving an agent change does not require recreating the clip there (reselect a clip to load its saved inputs).

A handoff request contains `mode` (`import`, `place`, `occurrence`, or `all`), `clipId`, `revisionId`, and the latest `stamp` from `filmcraft`. Add `track` and `frame` for placement, `targetClip` for one occurrence, or `targetItem` for all uses. Read actual IDs from the inspection; do not assume a particular project's IDs. The server validates input and rechecks the target. Browser and CLI call the same operations, not arbitrary shell or engine-command endpoints.

A `sequence` request contains `name` and the inspected project `stamp`. Creation is explicit and rejected if a sequence is already open or the inspected target has changed.

FilmCraft's own MCP bridge can be configured separately for broader editing tasks; Mercurius does not add another MCP server. See the [upstream bridge documentation](https://github.com/storytold/filmcraft/blob/main/docs/agents.md) and [control protocol](https://github.com/storytold/filmcraft/blob/main/docs/control-protocol.md).

## Verification

`npm test` covers the input and export boundaries, source-coverage checks, overlap prevention, and existing episode workflows. `npm run test:filmcraft` opens its own desktop test session on port 19876, with separate test settings and project files. It uses `out/curtain-intro.mp4`, imports two revisions, preserves trims/effects/transitions through single-occurrence replacement, checks undo, and verifies shared footage across two sequences. It never opens the user's project.

`scripts/check-workbench.ts` tests the actual running HTTP service against only `out/filmcraft-live-check/verified.fcproj`. It refuses other projects. Render the curtain and explicitly launch that test project before running it. Its assertions cover replacement, stale-target refusal, overlap refusal, and shared-footage updates. Test reports go to `out/filmcraft-live-check/`.

The static playground build does not include the local Node service. Use `npm run playground` for the workbench. Rendering and connected sessions are local; there is no cloud service or automatic publishing.
