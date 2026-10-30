# Cutscene graph editor

Opening a cutscene goes directly to the left-to-right React Flow canvas. The graph is the sole authoring view. Existing ordered source content opens as nodes; the first graph edit stores that phase as a graph and clears its old step list. Other phases and the completion placement plan retain their existing behavior. Graph documents participate in the existing save queue and undo/redo history and are validated before export.

## Nodes and connections

Edit action parameters directly on nodes. Unconnected inputs use their literal value or existing local-variable binding. Connected inputs read their typed data wire when the action starts. Execution pins determine when actions run; Completed fires after an awaitable action finishes. Data wires do not invoke actions or require user-visible local variables. Completed action results are captured once and can supply multiple later consumers.

Drag an action or Lua script onto an existing execution wire to insert it between its source and target. The candidate wire highlights blue while dragging. A connected action closes its old linear gap when moved. Data wires stay connected. Inserting and moving are one undoable edit; paired controls and multi-node selections are moved without automatic insertion. Normal graph validation still reports invalid dependencies or an emptied parallel track.

read-only nodes have no execution pins. The palette includes existing read-only Lua functions from the exported manifest, Get Variable nodes, Make Position, and a typed read-only expression node. read-only dependencies are evaluated once per consuming action's input preparation, with shared dependencies evaluated once within that preparation. A subsequent action evaluates them again against current state. Read-only functions and expressions use the same isolated, instruction-budgeted API as conditions.

Right-click empty canvas or choose Add node to search the palette. Drag an **input** onto empty canvas to see functions and values with compatible outputs. Drag an **output** onto empty canvas to see compatible consumers. Selection creates and connects the node; declaration order chooses the first compatible pin when several have the same type. Execution-pin drags offer executable actions. Node positions are saved. Double-click a wire to remove it; use Delete selection to remove selected nodes and wires. Entry and exit are retained.

Each action output has an optional typed local-variable destination on the node. Scene settings contains the existing typed local-variable editor. Lua script with results has editable output declarations; the Lua chunk must return exactly that many values, matching their declared types and nil allowances. The ordinary Run Lua action remains available for scripts without result declarations.

Lua scripts, action code fields and expressions use the shared Monaco Lua editor, loaded lazily with local assets and its worker for offline use. Cutscene API/variable completions, project scripting symbols and available LuaLS features are preserved. The expression node exposes its single result type directly; name and nil settings are under Advanced output settings. Write one expression without `return`; it reads state when its consumer starts and cannot change state. LuaLS receives a wrapped expression chunk so its source positions still match the editor.

Monaco includes the same editing features as the other Lua editors, including suggestions, hover and parameter hints. Graph popups use absolute positioning inside the transformed node, so they stay beside the caret while panning/zooming. Actor, anchor and dialogue completions use the graph's map and declarations. Graph diagnostics refresh after a short typing pause; export still validates immediately. Pointer movement only changes canvas positions and the candidate insertion wire, without revalidating the cutscene or rendering node contents again.

## Spatial editing

Path and position inputs offer **Edit on map**. The temporary, resizable overlay uses the selected map, project tile size and map annotations. Click to place/add, drag numbered points to move them, choose exact coordinates or anchors, and reorder/delete waypoints. Expand gives the map more room; Fit path/position reframes the edit. When a starting position cannot be established from the schematic preview, it is explicitly marked unavailable rather than invented.

Done commits one graph edit. Cancel, the close button and Escape discard the draft. Opening or closing the overlay does not resize or reset the graph viewport. Invalid positions, unresolved anchors and empty paths cannot be applied.

## Execution structure and validation

If / Else and Parallel create paired join nodes. Branch joins converge the selected path; parallel joins wait for every track. Add actions between each control output and its corresponding join input. Parallel tracks must be nonempty. The initial graph runtime preserves the current cutscene control contract: these control blocks are top-level Sequence blocks; loops and nested control regions are rejected. Setup and completion remain limited to their permitted immediate actions.

Export/import rejects disconnected executable nodes, cycles, mismatched or missing pins, duplicate IDs, unavailable producer results, unmatched joins, invalid Lua, invalid literals/references, incompatible result destinations and conflicting parallel claims/local accesses. A value produced only by one alternative branch cannot be consumed unconditionally after its join. Cross-track output reads must wait until the parallel join.

There is no List view or graph-to-list conversion. Scene settings, local variables and final placements have dedicated forms available from the graph. Ordered steps remain an accepted source/import representation and the existing compiler's internal execution plan; they no longer have a separate authoring UI.

## Canvas shortcuts and layout

Use the speech-bubble button in a node header to add an inline comment; its remove
button deletes the annotation. Add a standalone **Comment** from Add node or the
canvas context menu for a movable, editable note with no pins. Both kinds are
saved with the graph and support undo, copy and paste. Notes never execute and
cannot be connected. Auto layout leaves standalone notes at their authored positions.

The node picker shows a compact flat list. An optional category selector narrows
the results, and search matches category names as well as node names. Dragging
from a pin limits the list to compatible nodes and connects the first compatible pin.

The thin toolbar below the phase tabs contains Add, Undo/Redo, Duplicate, Paste, Delete, Auto layout, Fit and shortcut help. Auto layout (Shift+L) uses Dagre to arrange execution and data dependencies left to right, using measured node sizes, then fits the view. It changes positions only and is one undoable edit. F fits the current layout without moving nodes.

The canvas applies all React Flow node changes locally, including measurements
and live drag positions. Drag frames do not update authored data or undo history;
dropping commits one edit. Unchanged node data and Lua scopes retain their identity
when another node is edited, so unrelated code editors do not rerender.

Shift+drag selects a region; Ctrl/Cmd+click adds to selection. Ctrl/Cmd+A selects all. Ctrl/Cmd+C and V copy/paste selected nodes within the graph editor; Ctrl/Cmd+D duplicates them. Only internal wires are copied, and structural controls include their paired join. Entry/exit nodes are never duplicated or deleted. Delete/Backspace removes selected nodes and wires. Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes. Escape closes the picker and clears selection. Text fields retain native typing and clipboard shortcuts. A Shortcuts tooltip is available in the toolbar.

## Source and Unity

The cutscene source optionally contains `graphs.onStart`, `graphs.sequence` and `graphs.completion`. A graph owns its phase; the corresponding ordered list must be empty. Graphs store typed nodes, named pin connections and positions. The format remains version 2 during prototyping, with the shared JSON schema updated in Vulcanus and the Unity project. Existing cutscenes require no migration.

Unity imports graphs through `CutsceneGraphCompiler`, retaining normal action IDs/arguments for binding diagnostics and compiling to the existing Lua execution session. Graph result storage and read-only-evaluation temporaries are compiler locals, not persistent state or extra authored cutscene variables. Setup/completion, skipping, cancellation and action cleanup continue to use the existing runner. Both repositories must be updated before authoring graph sources.
