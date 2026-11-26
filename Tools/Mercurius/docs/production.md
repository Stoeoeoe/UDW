# Episode production

Start `npm run playground` in Tools/Mercurius and open `http://127.0.0.1:3109/#production` (the default landing page). Design studies remain at `#study=intro`.

## From writing to delivery

1. Create an episode with a stable lowercase kebab-case ID. To bring in a scratch script, enter an unused episode ID and choose **Import episode / script draft**. A complete production JSON includes its own ID. Imports refuse existing IDs.
2. Choose **Write script**. Brief, narration, visual directions, evidence notes, order, and timing use the existing writer. **Save to episode** writes to disk; **Save draft** downloads just the writer draft. The scratch writer at `#writer` continues to autosave its separate browser draft.
3. Return to Productions and select the episode. For each beat, record a capture path or select a rendered Mercurius clip revision. Selecting a revision marks it captured and provides a link to review that exact MP4. Reload the desk to refresh the revision list after rendering new clips. Use **Clips & FilmCraft** to author, render, and place clips through the existing handoff controls. Set each beat to edited into sequence when that work is done. Notes can hold retakes, source ranges, and edit instructions. These are references for the editor, not file uploads or automated timeline operations.
4. Resolve the production notes and perform the human review checklist. Automated checks find missing writing, media references, and estimated speech overruns; they cannot establish factual accuracy or picture quality. Saving a script resets all review ticks because the content or timing may have changed. Editing capture references or status resets picture and final-export review. Capture entries follow stable beat IDs through reordering; deleted beats lose their capture entry on script save.
5. Add description, credits, and the final published URL. **Production handoff .md** exports the current script, timing, evidence, capture notes, review ticks, and publishing notes. **Narration .txt** is ready for recording. **Download episode** includes all current edits, even before saving, for backup or conflict recovery.

## Storage and saving

The local Vite service saves `productions/<id>.json`. These files are ordinary project content and can be reviewed and committed. No episode is created until you explicitly create or import it. Empty libraries are valid. Invalid files report an error rather than disappearing from the library. IDs and file identity are validated at the storage boundary.

Production changes and episode writing require an explicit save. Navigation warns about unsaved work. After a save conflict, download your current work before reloading to inspect the disk copy. The service checks a content revision and serializes saves so two browser tabs cannot silently overwrite one another. Writes use a temporary file and rename. Saving a missing/deleted episode using an old revision also fails. External tools should avoid editing the same file during an active save.

Each episode has one current disk record. Download a backup or use Git for history. The service does not delete productions. The built static playground has no storage API; use `npm run playground` for the production desk and clip operations.

Production records complement `episodes/<id>/` Remotion source. They do not generate scenes, change `timeline.ts`, align recorded speech, publish videos, or verify media paths. The authored Remotion timeline and FilmCraft edit remain the timing authorities. Publishing and technical review remain human decisions.
