## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Save compatibility during prototyping

- Save formats can evolve in place for now. Do not bump the save schema version or add migrations for backwards compatibility unless the user asks.
- If a change to a fundamental state or save contract raises a compatibility question, ask the user before adding compatibility machinery.

## Persistent game state

- `GameSaveData` is the live, Odin-serialized root. `GameState` exposes its `player`, `world`, `story`, and `time` sections through `GameStateManager`. Do not add a second capture/restore mapping in the manager.
- Put every value that must survive a save/load in a field of that root or one of its state sections. Public serializable fields persist directly; mark private persistent fields with `[OdinSerialize]`. Mark runtime references, subscriptions, caches, and scene objects `[NonSerialized]` and rebuild or rebind them after load.
- When adding a top-level section, add it to `GameSaveData` and expose it through `GameStateManager` and `GameState`. The editor test `EveryGameStateSectionIsPartOfTheSaveRoot` checks this relationship. Extend the save round-trip test with representative data from the new section.
- Loading replaces the root before scene objects are initialized. Keep post-load runtime work explicit and ordered (for example, rebinding the favour manager and applying saved time); do not discover restore methods by reflection.
- `PlayerStateManager` now keeps current stamina in `GameState.Player`. Inventory contents are still scene-owned and are **not yet saved**; the one-time starting-loadout flag is runtime bookkeeping. Add stable item-ID inventory state before treating inventory as persistent.
