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

- **Steps** run in order unless they branch (below). Each has journal text, one or more objectives, and optionally a
  deadline (`days` after the step begins, `at` a time of day or the end of the day), a fail condition, Lua actions on
  completion and a `next`.
- **Objectives**, by `kind`:
  - `talk`: talk to a character, optionally playing a quest dialogue instead of the character's usual one;
  - `deliver`: hand a character `count` of an item;
  - `have`: carry `count` of an item;
  - `reach`: enter a map, or a trigger on it;
  - `condition`: a read-only Lua expression holds.
- **Actions** (`onStart`, `onComplete`, `onFail`, and each step's `onComplete`) are Lua statements, like dialogue
  action nodes.

## Branching

A step can continue somewhere other than the following step in the list:

- An objective with a `next` (a step ID, or `end` to complete the quest) is an alternative way out. Meeting it
  completes the step at once and continues there, whatever else is open. Objectives without a `next` still all have to
  be met; when they are, the step continues to its own `next`.
- A step's `next` (a step ID or `end`) says where it goes when it completes without a branching objective, including
  through `Quests.CompleteStep`. Without one it continues to the following step in the list, and after the last the
  quest completes.
- A step's `nextIf` is a list of `{ condition, next }`, checked in order when the step completes without a branching
  objective. The first condition (a read-only Lua expression) that holds decides; if none does, the step's `next`
  applies. Use it where the story state decides rather than the player's last action, such as a flag set in dialogue.
- `Quests.GoToStep(quest, step)` completes the current step and continues at any step, or at `end`. Dialogue,
  cutscenes and other quests use it to choose a path.

```json
{ "id": "choose", "journal": "Help the baker or the miller.",
  "objectives": [
    { "id": "baker", "kind": "talk", "character": "base:baker", "text": "Help the baker", "next": "bakery" },
    { "id": "miller", "kind": "talk", "character": "base:miller", "text": "Help the miller", "next": "mill" } ] }
```

The journal lists the steps finished, in the order the player took them, so it shows the path taken and nothing of the
others. The saved state is unchanged: the current step and the finished steps. `end` can't be a step ID. Progress is
recorded before the step's actions run, as for any step.

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

Every quest Vulcanus edits has an `editorGraph`: node positions, wires, step references and authored actions. Edits
change only the graph and the steps' own fields. Saving, which also happens automatically, checks the quest and
compiles the graph into the `steps` and Lua fields that Unity imports; **Validate** runs the same check without
saving. Problems with the graph, the shape or Lua block saving. Content the project doesn't have (characters, items,
dialogues, maps, triggers, deities) is only a warning in Vulcanus, since another mod may provide it; Unity fails the
import if it is really missing. Unity imports the compiled fields and ignores the graph. Each
objective of a step node has its own output; wiring it to a step or to Complete quest makes it a branching objective
(`next`). The step's own output, which also carries its actions, becomes the step's `next` where it doesn't lead to the
following step in the list. Steps and Complete quest can have several incoming wires, so branches can join. The steps are
listed along the main path first, then the branches. An If / Else node, like the cutscene editor's, has a boolean
`condition` input and True and False outputs; it follows a step's own output and compiles to that step's `nextIf`.
The condition is a switch typed on the node, or a value wired in from a read-only node: a call such as
`GameState.Story.Has` (the read-only, single-result calls from the bindings, with the same parameter pickers as
actions) or a read-only Lua expression. Value wires can also feed an action's parameters and other read-only nodes'
inputs, and compile into one Lua expression, so `GameState.Story.Has("met_baker")` is built, never run, by the
editor.

An If / Else has two uses, by where it sits. Between steps it picks the next step: True goes to a step or Complete quest,
False to a step, Complete quest or another If / Else (the next condition in the list), and both must be wired.
After Complete quest or On failure it runs different actions: each output leads into actions, scripts or further
If / Else nodes, either may stay empty, and it compiles to a Lua `if … then … else … end` in the quest's
`onComplete` or `onFail`. For example, after completion check `Divinity.Favour("base:ceres") > 500` and give a bigger
reward. Actions on a branching objective's way aren't possible, because
actions belong to the step and run however it ends. Disconnected nodes, loops, a script or action with several
predecessors, an output with several wires and missing steps block saving. Parallel steps are not supported.

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
  only what the schema can't express: unique step IDs and objective IDs within a step (`Validation.Unique`), and in
  `QuestValidator` that no step is called `end`, every `next` names a step in the quest, and the authored steps never
  loop. Steps reached only through `Quests.GoToStep` are fine.
- When catalogs refresh: the giver, characters, dialogues, items and deities a quest names exist
  (`Validation.Reference`, checked by `ReferenceValidation`), and `QuestCatalogValidation` checks the maps and triggers.
  Map and trigger IDs match exactly, including case, here and at runtime.

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
the current step's completed objectives. A step finishes once all its objectives without a `next` are done, as soon as one with a `next` is met, or when
completed outright; it then continues as described under Branching, and the quest completes at `end`. Progress is recorded before any action runs, so an action may advance the
quest further. Mistakes fail clearly: starting a quest twice, an unknown quest or objective, or advancing an ended quest.

The `Quests` Lua module reads (`IsActive`, `IsCompleted`, `IsFailed`, `CurrentStep`, `IsOnStep`) and advances
(`Start`, `CompleteObjective`, `CompleteStep`, `GoToStep`) quests.

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
