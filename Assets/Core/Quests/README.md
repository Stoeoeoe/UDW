# Quests

A quest is a story questline: steps that run in order, each with objectives the game checks. Quests are authored in
the Vulcanus project as `quests/*.quest.json` (schema: `schemas/quest.schema.json`); the Vulcanus importer turns each
into a `QuestDefinition`, and `QuestCatalog` lists them. The spec and build order are Linear STO-89.

```json
{
  "$schema": "../schemas/quest.schema.json",
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
- When catalogs refresh (`QuestCatalogValidation`): the giver and talk/deliver characters, dialogues, items, maps and
  triggers exist.

Not yet built: running quests, saving their progress and the journal (STO-93 onwards).
