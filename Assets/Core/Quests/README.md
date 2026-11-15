# Quests

A quest is a story questline: steps that run in order, each with objectives the game checks. Quests are authored in
the Vulcanus project as `quests/*.quest.json` (schema: `Schemas/quest.schema.json` at the repository root); the
Vulcanus importer turns each into a `QuestDefinition`, and `QuestCatalog` lists them. The spec and build order are
Linear STO-89.

```json
{
  "formatVersion": 1,
  "id": "base:festival_wine",
  "title": "Wine for the festival",
  "description": "The priestess needs wine.",
  "giver": "base:fabia",
  "onComplete": "Wallet.AddMoney(50)",
  "steps": [
    { "id": "buy",
      "journal": "Buy two amphorae of wine.",
      "objectives": [
        { "id": "carry", "kind": "have", "item": "base:wine", "count": 2, "text": "Wine" } ],
      "deadline": { "days": 2, "at": "18:00" } }
  ]
}
```

## Contents

- **Steps** run in order. Each has journal text, one or more objectives, and optionally a deadline (`days` after
  the step begins, `at` a time of day or the end of the day), a fail condition and Lua actions on completion.
- **Objectives**, by `kind`:
  - `talk`: talk to a character, optionally playing a quest dialogue instead of the character's usual one;
  - `deliver`: hand a character `count` of an item;
  - `have`: carry `count` of an item;
  - `reach`: enter a map, or a trigger on it;
  - `condition`: a read-only Lua expression holds.
- **Actions** (`onStart`, `onComplete`, `onFail`, and each step's `onComplete`) are Lua statements, like dialogue
  action nodes.

## Graph authoring in Vulcanus

The quest editor uses the shared cutscene canvas and action parameter controls.
Typed quest step nodes author talk, deliver, have, reach and condition objectives;
Complete objectives groups multiple requirements into one journal step. Objectives
are added and removed inside that node. Step and objective IDs remain the IDs used
by saved quest progress and translation keys.

Begin starts the execution chain. Actions before the first step compile to
`onStart`; actions after a step compile to that step's `onComplete`. Complete quest
marks the boundary for quest-level completion actions: actions connected after it
compile to the quest's `onComplete`. An optional On failure root compiles its actions
to `onFail`. This preserves the runtime's existing lifecycle ordering, including its
recording of progress before running actions. These are synchronous hooks, not
cutscene sessions that remain alive while a quest waits for the player.

Action nodes use state-changing, ordinary callable methods from the generated
binding manifest, with the same resource pickers and numeric fields as cutscenes.
Session-only and spatial actions are excluded. Execute Lua Script uses the existing
quest scripting API. Return values from action nodes are discarded; for example
`Inventory.Give` still gives nothing and returns false when the bag is full. Graph
authoring does not change that inventory behavior.

`editorGraph` stores node positions, wires, step references and authored actions in
the quest source. At save, Vulcanus validates and compiles it into the existing
`steps` and Lua fields that Unity imports. Unity checks the extended source schema
and imports those compiled fields; no quest save format changes are needed. Existing
quests open as graphs without rewriting their content until edited. Disconnected
nodes, cycles, branches, multiple predecessors and missing steps block saving.
Quest branching and parallel execution are not supported in this version.

## Texts

Texts are plain strings in the source language. Their message keys are derived from the IDs, which must stay stable
anyway because saves refer to steps and objectives:

| Text | Key |
|---|---|
| title, description | `quest.<quest>.title`, `quest.<quest>.description` |
| step journal | `quest.<quest>.<step>.journal` |
| objective line | `quest.<quest>.<step>.<objective>.text` |

Vulcanus writes the texts to `<name>.i18n.json` next to the quest (schema `quest-i18n.schema.json`).
`QuestDefinition.Title`, `Description`, `Journal(step)` and `Text(step, objective)` return the i18n text, falling back
to the quest's own. Renaming a step or objective drops its translations.

## Rules checked

- At import: the schema (shape, required fields per objective kind, ranges) and Lua that parses. The definition adds
  only what the schema can't express: unique step IDs and objective IDs within a step (`Validation.Unique`).
- When catalogs refresh: the giver, characters, dialogues, items and deities a quest names exist
  (`Validation.Reference`, checked by `ReferenceValidation`), and `QuestCatalogValidation` checks the maps and triggers.

## Starting by themselves

A quest with a `start` is considered for starting at the moments it lists, and starts if it never has and its optional
`condition` (a read-only Lua expression) holds then. Without a condition the moment alone starts it. Without `start`,
a quest starts only through a `Quests.Start` action, from a dialogue, cutscene or another quest.

| `on` | Moment | Optional filters |
| --- | --- | --- |
| `gameStart` | A new game begins; loading a save does not count | |
| `newDay` | A new day begins. The first day of a new game is not a new day; use `gameStart` | |
| `newSeason` | A season begins | `season` |
| `everyTenMinutes` | Every ten-minute clock step. The most frequent moment; prefer another where one fits | |
| `divineFavour` | The favour with a deity changes | `deity`, `atLeast` (the new favour) |
| `locationChanged` | The player enters a map | `map` |

`QuestService` collects the moments as they happen and looks at the waiting quests on its next tick, together with the
objective checks. Other moments, such as wallet, equipment, item or social-standing changes, can be added the same way
later: a new `QuestStartKind`, the event that raises it, and its filters.

## Running quests

`QuestService` starts quests, completes objectives and steps, and runs their actions. Progress is saved in the
`quests` section of the save (`QuestState`): status, current step, start time, finished steps with their times, and
the current step's completed objectives. A step finishes once all its objectives are done, or when completed outright;
after the last step the quest completes. Progress is recorded before any action runs, so an action may advance the
quest further. Mistakes fail clearly: starting a quest twice, an unknown quest or objective, or advancing an ended quest.

The `Quests` Lua module reads (`IsActive`, `IsCompleted`, `IsFailed`, `CurrentStep`, `IsOnStep`) and advances
(`Start`, `CompleteObjective`, `CompleteStep`) quests.

The game meets have, reach and condition objectives by itself. It checks them on the frame after something they could
depend on changes: the player's bag, a clock step (every ten in-game minutes), any Lua call that writes state (dialogue,
cutscene and quest actions), entering a location, or a new step beginning. A reach objective with a trigger is met when
the player walks into that trigger area on the map. Once met, an objective stays done for its step.

Talk and deliver objectives are met by talking to their character. While the current step has one for a character
(deliver only while the player carries the items), talking to them plays the objective's quest dialogue if it has one,
otherwise their usual dialogue. The objective is met, and a delivery's items taken, when that conversation reaches its
end. `ShowVulcanusDialogueInteractable` makes this choice; the dialogue a routine sets is never overwritten, so the
character goes back to it afterwards.

A step fails its quest when its deadline passes or its fail condition holds, both checked like condition objectives
and before them. A deadline falls `days` after the day the step began (when the quest started or the previous step
finished), at `at`, or at the end of that day. A failed quest runs `onFail` and keeps the step it failed on for the
journal; a completed quest has no current step.
