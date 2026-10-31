# Project guidance

## Engineering principles

- Solve the **actual requested problem**. Every nontrivial change needs a concrete caller, gameplay scenario or demonstrated defect. Possibility alone is not a requirement.
- Prefer simple implementations and established project patterns. Avoid speculative abstractions, compatibility layers, configuration, lifecycle states and unrelated refactors.
- Distinguish expected gameplay outcomes from broken developer setup. Handle the former normally; let invalid internal assumptions fail clearly. Don't scatter null checks, clamps, defaults or silent fallbacks to hide missing required dependencies.
- Validate authored content at its import/setup boundary and untrusted save/input data where consumed. Don't repeatedly revalidate established invariants during gameplay.
- Keep changes narrow, understandable and maintainable. Avoid introducing behavior that wasn't requested.

## Implementation workflow

- Inspect the relevant code and subsystem documentation before changing it; source code is authoritative. Don't reproduce architecture facts in this file.
- Use `apply_patch` for source/text edits and preserve the native diff. Use Unity Editor APIs and established generators for assets and generated files.
- For Unity work, check `unity status`, follow the installed Unity CLI skill and `Docs/cli_operations.md`, and run relevant compilation/tests when available.
- If `graphify-out/graph.json` exists, use `graphify query` for codebase exploration; use `path`/`explain` when useful. Run `graphify update .` after code edits. `/graphify` invokes its installed workflow.
- Use realistic test fixtures. Do not weaken production contracts to make incomplete tests pass. Verify the relevant gameplay and failure paths without inventing speculative requirements.

## Project-wide constraints

- This game is still prototyping. Do not add save-version bumps or backwards-compatibility migrations unless requested; ask before changing fundamental persistence contracts.
- Preserve stable authored and persistent IDs. Use namespaced content IDs (`base:my_item` for shipped content); the base game is itself the `base` mod. Never hardcode assumptions that only base-game content exists.
- Keep persistent game data in the existing save root; don't create parallel persistence mechanisms.
- Follow the relevant `Docs/` or subsystem README for specialized APIs (inventory, catalogs, spawning, cutscenes, Lua, etc.).

## Content architecture and moddability

- **Vulcanus is the content engine; Unity is the game engine.** Most production maps/locations, tilesets, characters, items, dialogues, cutscenes and daily routines are authored in the external Vulcanus project (also called `map_editor` in code). Agents can work in both projects.
- Vulcanus exports content that Unity imports into definitions, ScriptableObjects, scenes etc. Unity exports annotated scripting APIs, enums and other capabilities to `Generated/Scripting/bindings.json` for Vulcanus authoring. Keep both sides of this contract synchronized; you may edit generated exports if it makes sense.
- Implement new content through Vulcanus/importers where practical, not per-item Unity code or manager registrations. Direct Unity-authored fixtures are fine for tests/prototypes, but shipped `base:` content should eventually follow the same pipeline as mods.

## Lua and action bindings

- Read `Assets/Core/Scripting/README.md` and, for cutscenes, `Docs/CutsceneSequenceContract.md` before editing scripting. `[LuaModule]` classes expose `[LuaCall]` instance methods; mark writes with `writesState: true` so conditions stay read-only. Synchronous Run Lua chunks are separate from timed session actions.
- Session actions require `[LuaAction]` with stable ID, contexts/phases and reference validation; awaitable actions return `ILuaAction` and run only in sequences. The session owns ticking, disposal and cleanup. Validate inputs without gameplay mutations.
- Binding discovery/export must work without live scene services. Resolve current saved state per call (loads replace the root), and treat returned Lua tables as snapshots. The Editor regenerates `bindings.json` on script reload or via **Tools > Scripting > Regenerate Lua bindings.json**.