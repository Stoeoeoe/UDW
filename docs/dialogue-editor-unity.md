# Dialogue Editor Technical Notes for Unity

## Scope

This note describes the current dialogue format and editor behavior in:

- `app/src/components/screens/dialogue/DialogueEditor.tsx`
- `app/src/types/schema.ts`
- `schemas/dialogue.schema.json`
- `schemas/project.schema.json`

The intent is to document the data Unity should import and the execution rules Unity should mirror.

## Files Written by the Editor

Each dialogue now lives as a self-contained source file in `dialogues/`:

1. `<dialogueId>.dialogue.json`
   Authoring/source document.
2. `<dialogueId>.runtime.dialogue.json`
   Runtime-oriented export with editor metadata stripped.
3. `<dialogueId>.i18n.json`
   Localized message extraction.

There is no longer a separate dialogue index file. The editor loads dialogues directly from the `dialogues` folder.

## High-Level Runtime Model

A dialogue is a directed graph stored as a flat node array.

- `startNodeId` selects the first executable node.
- Each node has a unique `id`.
- Flow is driven by explicit references:
  - `line.next`
  - `action.next`
  - `choice.options[].targetNodeId`
  - `jump.targetNodeId`
- Array order still matters to the editor because it auto-rebuilds many `next` links from timeline order.

For Unity, treat the file as a node graph keyed by `id`, not as a simple ordered script.

## Project-Level Dialogue Script Context

Dialogue script context now comes from the project file, not a dialogue-specific index.

Relevant project fields:

```ts
interface DialogueType {
  id: string;
  name: string;
  description?: string;
  contextTypeId?: string;
}

interface Project {
  defaultDialogueContextTypeId?: string;
  dialogueTypes?: DialogueType[];
}
```

Meaning:

- `defaultDialogueContextTypeId`
  Default `ScriptContextType` injected as Lua `self` for dialogue scripts.
- `dialogueTypes`
  Named dialogue modes such as `default`, `cutscene`, `bark`, etc.
- `dialogueTypes[].contextTypeId`
  Optional override for the Lua `self` context when a dialogue uses that type.

Runtime resolution should be:

1. If the dialogue has a `dialogueTypeId` and that dialogue type defines `contextTypeId`, use it.
2. Otherwise use `project.defaultDialogueContextTypeId`.
3. Otherwise run without `self`.

## Dialogue Source Structure

The source file shape is:

```ts
interface DialogueDocument {
  version: number;
  id: string;
  name: string;
  folderPath?: string;
  oneShot: boolean;
  dialogueTypeId?: string;
  startNodeId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  nodes: DialogueNode[];
}
```

### Metadata meaning

- `id`
  Stable dialogue key. Good save-state key for Unity.
- `folderPath`
  Editor organization only.
- `oneShot`
  Dialogue is intended to be consumed once unless your runtime overrides that behavior.
- `dialogueTypeId`
  Selects a project-defined dialogue type, which may change the Lua `self` context.
- `tags`
  Editor metadata. Runtime use is optional.

## Node Types

### 1. `line`

```ts
interface DialogueLineNode {
  id: string;
  type: 'line';
  speaker?: string;
  emotion?: string;
  text: string;
  msgKey: string;
  next?: string | null;
}
```

Behavior:

- Show a dialogue line.
- `speaker` is usually an `Actor.id`.
- `emotion` is a free string, usually matching an actor emotion label.
- `msgKey` is the localization key.
- Continue to `next`; if `next` is null, the dialogue ends.

Unity recommendation:

- Use `msgKey` as the primary localized lookup key.
- Fall back to `text` when no localization table is loaded.

### 2. `choice`

```ts
interface DialogueChoiceOption {
  id: string;
  text: string;
  msgKey: string;
  condition?: string | null;
  targetNodeId: string;
}

interface DialogueChoiceNode {
  id: string;
  type: 'choice';
  options: DialogueChoiceOption[];
}
```

Behavior:

- Present one or more player options.
- Each option may have an optional Lua `condition`.
- If the condition is null/empty, the option is unconditional.
- On selection, continue at `targetNodeId`.

Unity recommendation:

- Filter options by condition before rendering.
- Define an explicit fallback if zero options remain visible, because the format itself does not define one.

### 3. `action`

```ts
interface DialogueActionNode {
  id: string;
  type: 'action';
  lua: string;
  next?: string | null;
}
```

Behavior:

- Execute the Lua chunk in `lua`.
- Then continue to `next`.

This is a full Lua chunk, not a boolean condition.

### 4. `jump`

```ts
interface DialogueJumpNode {
  id: string;
  type: 'jump';
  targetDialogueId?: string | null;
  targetNodeId: string;
}
```

Behavior:

- If `targetDialogueId` is null/empty, jump within the current dialogue.
- If `targetDialogueId` is set, switch to that dialogue and continue at `targetNodeId`.

### 5. `comment`

```ts
interface DialogueCommentNode {
  id: string;
  type: 'comment';
  text: string;
}
```

Behavior:

- Editor/debug note.
- Preserved in runtime export.
- Should not be treated as an executable node.

Unity recommendation:

- Keep it available for debug tooling, but skip it in the execution loop.

### 6. `end`

```ts
interface DialogueEndNode {
  id: string;
  type: 'end';
}
```

Behavior:

- End the dialogue immediately.

## Branching Representation

Choice branches have two layers:

1. Runtime truth:
   `choice.options[].targetNodeId`
2. Editor-only layout metadata:

```ts
interface DialogueNodeEditorMeta {
  branchId?: string;
  parentChoiceNodeId?: string;
  parentOptionId?: string;
  branchOrder?: number;
}
```

`editor` metadata is used by the React timeline for grouping and auto-linking branch-local `next` chains.
Unity should not depend on it for runtime execution.

## How Flow Is Maintained in the Editor

The editor auto-links many `line.next` and `action.next` values:

- top-level executable nodes are linked in timeline order
- branch-local executable nodes are linked in branch order
- comments are ignored for execution linking

This happens through `relinkLinearFlow()`.

For Unity, do not reproduce that editor behavior. Just consume the saved links.

## Runtime Export Differences

`toRuntimeDialogue()` generates `<dialogueId>.runtime.dialogue.json`.

Changes applied during export:

- strips `editor` metadata from all nodes
- keeps comment nodes for debugging
- normalizes empty option conditions to `null`
- normalizes invalid local `line.next` / `action.next` to `null`
- normalizes `startNodeId` so it points to an executable node
- clears invalid local jump targets by setting `targetNodeId` to `''`

The runtime export is the preferred Unity import target.

## Localization Export

`buildI18nExport()` generates:

```ts
interface DialogueI18nExport {
  dialogueId: string;
  dialogueName: string;
  generatedAt: string;
  messages: {
    msgKey: string;
    text: string;
    nodeId: string;
    sourceType: 'line' | 'choiceOption';
    optionId?: string;
  }[];
}
```

Only `line.text` and `choice.options[].text` are exported.

Unity recommendation:

- load the i18n file into a `msgKey -> text` table
- resolve through localization first
- keep source `text` as a fallback

## Scripting Model

There are two dialogue-level scripting entry points now:

1. `DialogueChoiceOption.condition`
   Lua expression returning truthy/falsy.
2. `DialogueActionNode.lua`
   Full Lua chunk with side effects.

There is no longer a dialogue-level `entryCondition`.

### Available script data

The editor/runtime model expects these scripting sources from the project:

- `gameVariables`
  Global variables, including dotted paths like `weather.isRain`
- `scriptFunctions`
  Global callable functions like `wait(...)`
- `scriptNamespaces`
  Global table-like namespaces such as `weather.getHoursOfDay()`
- `scriptContextTypes`
  Shapes of `self`
- `defaultDialogueContextTypeId`
  Project-level default for dialogue scripts
- `dialogueTypes[].contextTypeId`
  Optional per-dialogue-type override

At runtime, Unity should inject:

- global variables by their defined paths
- namespace tables and functions
- global functions
- `self` object resolved from the project default or the dialogue type override

### Lua syntax details that matter

- Conditions are wrapped as `return (<expression>)`, so they should be expression-style Lua.
- Actions are compiled as raw Lua chunks.
- Context methods may use colon syntax, for example `self:moveTo(...)`.
- The editor validates action-node syntax only. It does not guarantee runtime semantics.

## Suggested Unity Execution Loop

1. Load all `*.runtime.dialogue.json` files.
2. Build a dictionary for each dialogue: `nodeId -> node`.
3. Resolve the effective dialogue script context from the project and the dialogue type.
4. Start at `startNodeId`.
5. Execute by node type:
   - `comment`: skip to the next executable node if your importer ever lands on one
   - `line`: show localized text, wait for advance, then follow `next`
   - `choice`: evaluate visible options, wait for selection, then jump to chosen `targetNodeId`
   - `action`: execute Lua chunk, then follow `next`
   - `jump`: switch dialogue if needed, then continue at `targetNodeId`
   - `end`: terminate
6. If the dialogue completes, mark `oneShot` progress if that matches your game design.

## Weird / Notable Design Choices

### 1. Branches are visually grouped but still stored in a flat array

That is fine for authoring, but Unity should ignore array grouping and trust explicit references.

### 2. Comments are intentionally preserved at runtime

That is useful for debug inspectors, transcript dumps, or runtime tooling.
They should remain non-executable.

### 3. Dialogue availability is no longer embedded in the dialogue file

This is deliberate.
Conditions for whether an NPC can offer a dialogue are better owned by NPC/state logic than by the dialogue asset itself.

### 4. Dialogue type is intentionally indirect

The dialogue does not point straight to a context type.
It points to a project-defined dialogue type, which may then resolve to a context override.
That gives you room for higher-level gameplay categories like `default`, `cutscene`, or `ambient_bark`.

### 5. `startNodeId` should always be treated as executable

The editor now normalizes it, but Unity should still validate imports and avoid starting on `comment`.

## Practical Recommendation

For the safest Unity implementation:

- import the runtime files, not the source files
- build a node lookup table by `id`
- skip `comment` during execution but keep it for debug tools
- localize by `msgKey`
- resolve script context from `project.defaultDialogueContextTypeId` plus optional dialogue type override
- keep dialogue availability logic outside the dialogue asset itself

That gives you a runtime model that is simple, self-contained, and much closer to how a Unity dialogue runner naturally wants to work.
