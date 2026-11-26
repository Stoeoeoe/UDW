# Mercurius + FilmCraft: proposed workflow

19 November 2026. Proposal for implementation; this document does not mean the integration already exists.

Mercurius makes reusable animated clips. FilmCraft owns the edit: footage, trims, tracks, voiceover, captions, sound, and the final export. You can operate the workflow manually, ask an agent to do a task, or switch between the two without recreating the clip.

## The working experience

Keep FilmCraft open alongside Mercurius. Add a **Clips** view to the existing Mercurius app, with the studies available as a reference and the writer remaining optional.

The Clips view has a list of authored clips on the left, the portrait preview in the centre, and content/timing controls on the right. The selected clip shows its latest rendered revision and, when connected, its FilmCraft destination. This is a clip workbench, not another editing timeline.

| Task                    | Manual                                                               | Agent-assisted                                                                       |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Make a clip             | Choose a scene, enter its content, set timing, and preview it.       | Describe the clip; the agent creates or edits the same saved inputs.                 |
| Render                  | Click Render and see progress, cancellation, and the resulting file. | Ask for a render or a batch of specified clips; receive the same files and previews. |
| Bring it into FilmCraft | Click Add to bin, then drag it onto the timeline yourself.           | Ask the agent to import it or place it at a specified position.                      |
| Revise it               | Edit the saved inputs, preview, and render a new revision.           | Ask for a concrete change, such as different text or a later reveal.                 |
| Update the edit         | Choose a target and replace its footage with a completed revision.   | Ask the agent to update that target; it uses the same replacement operation.         |

Manual operation must work without an AI service. Agent operation must not depend on clicking through the browser UI. Both use the same validated clip inputs and production commands.

For the existing curtain, you could adjust the closed hold or dark red trim manually, then ask the agent to render it and replace its use in FilmCraft. You could also render it yourself, add it to the bin, and continue editing entirely by hand.

## Controls worth building

Each clip has a stable ID, a name, a scene component, scene-specific content, and a frame-based timing definition. The UI exposes seconds but stores integer frames at the initial 30 FPS delivery rate.

Start with these existing building blocks:

1. **Curtain intro:** hold/open timing and the established fabric/accent treatment. Keep the current one-second version as its initial preset.
2. **Code walkthrough:** actual code, language, filename, highlighted lines, and reveal/highlight cues, using CodePanel.
3. **Dependency diagram:** node labels, connection label, focus target, and reveal timing, using the existing Node and Connection components.

These are initial scene types, not a promise to turn every study into an editor immediately. The current studies have fixed examples; exposing their content is required work. Study numbers and explanatory sample notes should not appear in production clips.

Reuse the bundled fonts, Paper & Ink direction, and Roman ornament controls. Keep custom React scenes as the route for bespoke animation; do not invent a general scene language or a node editor. A custom scene only needs to expose the inputs it actually supports.

## Handoff actions

Provide separate actions so rendering does not unexpectedly change an edit:

- **Render:** produce a file and a preview. No FilmCraft mutation.
- **Add to bin:** import a selected completed revision into a Mercurius bin. No timeline placement.
- **Place:** show the project, sequence, track, position, and revision to place. Default to overwrite-free placement; an occupied destination is reported rather than rippling the user's edit.
- **Replace this occurrence:** change one named timeline clip to the new revision.
- **Update all uses of this media item:** replace the bin item's footage, with the affected uses identified before applying it. This is deliberately different from replacing one occurrence.

The initial UI can deliver bin import first; timeline placement and replacement follow once the real tests below pass. Automatic re-rendering must not automatically replace timeline media.

An agent request that explicitly names a destination or replacement is authorization to perform that operation. Do not add a redundant confirmation dialogue to every agent step. If the request does not identify which of several occurrences should change, ask that specific question. Manual buttons should make the target and scope visible.

## Revision behaviour

Every completed render gets a new filename, such as `curtain-intro-r002.mp4`. Do not overwrite a file FilmCraft is reading. Render to a temporary output and expose a revision for import only after encoding and validation succeed.

Preserving the user's FilmCraft edit is the core acceptance criterion: replacement should preserve placement, source trims, transforms, effects, and transitions. This is a requirement to verify, not an assumption about the available replacement commands.

If replacement media does not cover an existing source range, report the affected occurrence and required length. Do not silently shorten it, freeze its last frame, stretch time, or move neighbouring clips. A changed animation may also need a new trim even when its duration matches; the preview should make that review easy.

If the project or target has changed while a render runs, finish the render but re-read the target before applying it. Do not switch projects, rewind the playhead to an old insertion position, or reuse IDs from a different project. Keep manual editing available while rendering; revalidate the intended edit immediately before mutation.

Keep authored clip inputs with the Mercurius episode or clip folder. Keep imported renders in a durable media folder chosen for the FilmCraft project, with revision records linking them to their saved inputs. Existing ignored `out/` is for previews and the feasibility test, not a dependable home for media used in an ongoing edit. Moving or archiving a FilmCraft project must include those files.

## Integration shape

```text
Mercurius browser controls ─┐
                           ├─ saved clip inputs → Remotion render → revision file
Agent → Mercurius CLI ──────┘                                      │
                                                                 ↓
                                               FilmCraft control API → bin / timeline
```

Use a small local Node backend for browser-initiated renders and handoffs, with a CLI over the same functions for agent use. A Node backend is necessary because the current Vite app cannot launch a renderer or speak FilmCraft's raw TCP protocol from browser JavaScript. It should expose only the concrete clip/render/handoff operations, not an arbitrary shell-command endpoint.

Use FilmCraft's existing CLI/control API and its existing MCP bridge. A new Mercurius MCP server, a FilmCraft fork, and an embedded native panel are not needed for the initial workflow. Agent configuration can use FilmCraft's own bridge for other editing tasks, while Mercurius owns rendering and its specific handoff commands.

The desktop control API requires FilmCraft to be started with control enabled and a session token shared through the environment. Provide a documented launcher/connection setup and show the connected project/sequence. Keep that token out of browser responses, clip files, logs, and committed configuration. A normally started FilmCraft session cannot be assumed to expose this endpoint. Save and deliberately reopen a session with control enabled when necessary; do not close the running editor automatically.

When disconnected, preview/render/download still work. FilmCraft actions clearly show that a connection is required. A failed handoff leaves a completed render available to import manually; report which steps completed. If the connection drops after submitting an edit, its outcome may be unknown: reconnect and inspect before retrying, rather than risking a duplicate insertion. Do not claim that a multi-command handoff is atomic.

Initial delivery is the already tested opaque H.264 MP4, 1080×1920 at 30 FPS. Transparent overlays need a separate end-to-end test of decoding, compositing, and export in the installed FilmCraft build before offering an alpha preset.

## Build order and acceptance

### 1. Prove replacement before building the workbench

Use the existing curtain and a separate FilmCraft test project. Connect a live desktop session, import two rendered revisions, and exercise both single-occurrence and media-item replacement. Keep the user's real project untouched during this test.

Pass criteria:

- A trimmed, moved occurrence keeps its start, source range, track, effects, transforms, and transitions after a valid replacement; inspect the data and render frames around the edit.
- Replacing one occurrence leaves another occurrence unchanged. Updating the shared media item updates the intended references, including uses in other sequences.
- Undo restores the previous media/edit through FilmCraft's normal undo mechanism. Verify actual behaviour and undo granularity rather than promising one undo step for a multi-command handoff.
- An insufficiently long replacement is rejected by our handoff before mutation.
- A disconnected or changed target is rejected before mutation. A connection lost after submission is reconciled by inspection without duplicate insertion.

If a FilmCraft command fails these criteria, narrow the first release to Add to bin and explicit manual replacement, and document the missing behaviour. Do not compensate by rebuilding the user's sequence behind their back.

### 2. Ship the shared render/handoff commands

Add saved inputs for the curtain, deterministic still/clip rendering, durable revision outputs, bin import, and the replacement operations that passed step 1. Record clip and media identities so subsequent revisions can identify their destination. Validate input at the file/API boundary and read FilmCraft's current state before applying changes.

### 3. Add manual controls and two useful scene types

Build the Clips view over those same operations, then expose the code walkthrough and dependency diagram. Verify that manual and agent changes reopen identically and render from the same saved inputs. Retain a manual file-import route even when the bridge is available.

The first release is complete when you can adjust the curtain manually, send it into FilmCraft, trim it there, request an agent revision, and update it without losing that edit. Then exercise the same loop with actual code or diagram content.

## Evidence and outstanding checks

Already verified locally on 19 November 2026: installed FilmCraft/CLI 0.20.1; curtain MP4 import; creation of a 1080×1920 / 30 FPS sequence; successful rendering of its frame at 0.7 seconds. The installed command catalogue exposes `timeline.place`, `media.replaceFootage`, and `clip.replaceFromBin` with a `keepSourceIn` option.

Not yet verified: the live control connection, replacement preservation, undo behaviour, transparent-overlay handoff, or a custom panel inside FilmCraft.

Primary references, checked 19 November 2026:

- [FilmCraft agent and CLI documentation](https://github.com/storytold/filmcraft/blob/main/docs/agents.md): desktop bridge, import/inspect commands, explicit clip targets, and command discovery.
- [FilmCraft control protocol](https://github.com/storytold/filmcraft/blob/main/docs/control-protocol.md): local authenticated transport and available methods.
- [FilmCraft architecture](https://github.com/storytold/filmcraft/blob/main/docs/architecture.md): native UI/engine separation and automation layer.

This proposal adds no writing, captioning, audio-editing, or final timeline editor to Mercurius. Those jobs can stay in FilmCraft or the user's preferred external tools.
