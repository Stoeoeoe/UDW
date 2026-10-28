import React, { useEffect, useState } from 'react';
import { defaultStoryValue, matchesStoryType, STORY_VALUE_TYPE } from '../../../lib/storyValues';
import { saveStoryValueDeclarations } from '../../../store/storyValues';
import { StoryValueField } from '../data/StoryValueField';
import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Select,
  Switch,
  Text,
  VStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
} from '@chakra-ui/react';
import { AddIcon, ChevronDownIcon } from '@chakra-ui/icons';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useEditorStore } from '../../../store/useEditorStore';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import {
  EMPTY_SCRIPTING_ACTIONS,
  EMPTY_SCRIPTING_RESOURCES,
  withProjectCharacters,
} from '../../../lib/scriptingManifest';
import {
  createCutsceneStep,
  mapCharacterInstances,
  declaredCharactersBefore,
  validateCutscene,
  actionsForCutscenePhase,
  completionPosition,
  completionPlacement,
} from '../../../lib/cutscenes';
import {
  isMapPosition,
  isAnchorPosition,
  positionPickerMetadata,
  pathPickerMetadata,
  type PathArgument,
  type MapPosition,
  type PlacementMode,
} from '../../../lib/mapPosition';
import { MapPathField } from '../../common/MapPathField';
import { MapPositionField } from '../../common/MapPositionField';
import { NullableMapPositionField } from '../../common/NullableMapPositionField';
import {
  previewCutscene,
  readActionPreview,
  type PreviewSelection,
} from '../../../lib/cutscenePreview';
import type {
  Cutscene,
  CutsceneAction,
  CutsceneStep,
  CompletionPlacement,
  CompletionFacing,
} from '../../../types/cutscene';
import { Field, ReadOnlyIdField, InspectorSection } from '../../common/Fields';
import { type MapPreviewOverlay } from '../../common/MapPreviewPicker';
import { SequenceCard, SequenceTypeMenu, SortableSequenceItem } from '../../common/SequenceEditor';
import { SplitEditorCanvas } from '../../common/SplitEditorCanvas';
import { NumericCutsceneArgument } from './NumericCutsceneArgument';
import { LuaScriptEditor } from '../scripting/LuaScriptEditor';
import { ConditionEditor } from '../scripting/ConditionEditor';
import { isConditionalStep, isParallelStep } from '../../../types/cutscene';
import {
  allCutsceneSteps,
  allSequenceSteps,
  cutsceneStepList,
  createCutsceneCondition,
  createCutsceneParallel,
  duplicateCutsceneStep,
  type BranchPath,
} from '../../../lib/cutsceneBranches';
import { DEFAULT_CUTSCENE_TRANSITION } from '../../../types/cutscene';
import { CutscenePreviewPanel } from './CutscenePreviewPanel';
import { InspectorPanel } from '../common/InspectorPanel';
import { TopTabbedEditorLayout } from '../common/TopTabbedEditorLayout';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';

type Selection = PreviewSelection;

export const CutsceneDetail: React.FC<{
  scene: Cutscene;
  leftPanel?: React.ReactNode;
  notice?: React.ReactNode;
}> = ({ scene, leftPanel, notice }) => {
  const maps = useEditorStore((s) => s.maps);
  const currentMap = useEditorStore((s) => s.currentMap);
  const characterDefinitions = useEditorStore((s) => s.characters);
  const types = useEditorStore((s) => s.entityTypes);
  const dialogues = useEditorStore((s) => s.dialogues);
  const tileSize = useEditorStore((s) => s.project?.tileSize ?? 16);
  const actions = useScriptingManifestStore(
    (s) => s.actionsByContext.cutscene ?? EMPTY_SCRIPTING_ACTIONS,
  );
  const labels = useEditorStore((s) => s.cutsceneLabels);
  const manifestResources = useScriptingManifestStore(
    (s) => s.manifest?.resources ?? EMPTY_SCRIPTING_RESOURCES,
  );
  const resources = withProjectCharacters(manifestResources, characterDefinitions);
  const edit = useEditorStore((s) => s.editCutscenes);
  const gameVariables = useEditorStore((s) => s.gameVariables);
  const storyDefinitions = useEditorStore((s) => s.project?.storyValues);
  const scriptTables = useEditorStore((s) => s.scriptTables);
  const scriptFunctions = useEditorStore((s) => s.scriptFunctions);
  const scriptNamespaces = useEditorStore((s) => s.scriptNamespaces);
  const [selection, setSelection] = useState<Selection>({ kind: 'scene' });
  const [activePhase, setActivePhase] = useState<'onStart' | 'sequence' | 'completion'>('sequence');
  const [endpointCharacter, setEndpointCharacter] = useState('');
  const [picking, setPicking] = useState<{
    stepId: string;
    parameter: string;
    mapId: string;
    mode: PlacementMode;
    waypoint?: number;
  } | null>(null);
  const [hoverPosition, setHoverPosition] = useState<MapPosition | null>(null);
  const [endpointPicking, setEndpointPicking] = useState<{
    index: number;
    character: string;
    mapId: string;
    mode: PlacementMode;
  } | null>(null);
  const setupSteps = scene.onStart ?? [];
  const [branchChoices, setBranchChoices] = useState<Record<string, BranchPath>>({});
  const completionSteps = scene.onComplete.steps;
  const sectionOf = (id: string): 'onStart' | 'sequence' | 'completion' =>
    setupSteps.some((s) => s.id === id)
      ? 'onStart'
      : completionSteps.some((s) => s.id === id)
        ? 'completion'
        : 'sequence';
  const phaseFor = (section: 'onStart' | 'sequence' | 'completion') =>
    section === 'onStart'
      ? ('setup' as const)
      : section === 'completion'
        ? ('completion' as const)
        : ('sequence' as const);
  const sectionSteps = (section: 'onStart' | 'sequence' | 'completion') =>
    section === 'onStart'
      ? setupSteps
      : section === 'completion'
        ? completionSteps
        : scene.sequence;
  const eligible = (section: 'onStart' | 'sequence' | 'completion') =>
    actionsForCutscenePhase(actions, phaseFor(section));
  const map = currentMap?.id === scene.mapId ? currentMap : maps.find((m) => m.id === scene.mapId);
  const characters = map ? mapCharacterInstances(map, types) : [];
  const baseCharacterOptions = [
    { id: 'player', label: 'Player' },
    ...characters.map((a) => ({
      id: a.id,
      label: a.label || types.find((t) => t.id === a.typeId)?.displayName || a.id,
    })),
  ];
  const anchors = map?.spatialPrimitives?.anchors ?? [];
  const anchorOptions = anchors.map((a) => ({ id: a.id, label: a.name || a.id }));
  const update = (change: (draft: Cutscene) => void) =>
    edit((draft) => {
      const target = draft.find((s) => s.id === scene.id);
      if (target) change(target);
    });
  const selectedStep =
    selection.kind === 'step'
      ? allCutsceneSteps(scene).find((s) => s.id === selection.id)
      : undefined;
  const characterOptions = [
    ...baseCharacterOptions,
    ...declaredCharactersBefore(
      scene,
      actions,
      baseCharacterOptions.map((a) => a.id),
      selectedStep?.id,
    ).map((id) => ({ id, label: id })),
  ];
  const selectedSection = selectedStep ? sectionOf(selectedStep.id) : 'sequence';
  const selectedList = selectedStep
    ? cutsceneStepList(scene, selectedStep.id)!
    : sectionSteps(selectedSection);
  useEffect(() => {
    if (selectedStep) setActivePhase(selectedSection);
  }, [selectedSection, selectedStep]);
  // Undo or a manifest refresh can remove the selected step while the editor remains open.
  const panel = selection.kind === 'step' && !selectedStep ? 'scene' : selection.kind;
  const actionFor = (step: CutsceneStep) => actions.find((a) => a.id === step.action);
  const cancelPicking = () => {
    setPicking(null);
    setEndpointPicking(null);
    setHoverPosition(null);
  };
  useEffect(() => {
    if (!picking && !endpointPicking) return;
    const metadata =
      picking &&
      (picking.waypoint === undefined ? positionPickerMetadata : pathPickerMetadata)(
        actions
          .find((a) => a.id === selectedStep?.action)
          ?.parameters.find((p) => p.name === picking.parameter),
      );
    if (
      (endpointPicking &&
        (panel !== 'completion' ||
          scene.mapId !== endpointPicking.mapId ||
          scene.onComplete.characterPlacements[endpointPicking.index]?.character !==
            endpointPicking.character)) ||
      (picking &&
        (selectedStep?.id !== picking.stepId ||
          scene.mapId !== picking.mapId ||
          !metadata?.placementModes.includes(picking.mode) ||
          (picking.waypoint !== undefined &&
            (!Array.isArray(selectedStep?.arguments[picking.parameter]) ||
              picking.waypoint >=
                (selectedStep?.arguments[picking.parameter] as PathArgument).length))))
    ) {
      setPicking(null);
      setEndpointPicking(null);
      setHoverPosition(null);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPicking(null);
        setEndpointPicking(null);
        setHoverPosition(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    picking,
    endpointPicking,
    panel,
    selectedStep,
    scene.mapId,
    scene.onComplete.characterPlacements,
    actions,
  ]);

  const optionsFor = (parameter: CutsceneAction['parameters'][number]) => {
    if (parameter.resourceType)
      return (resources[parameter.resourceType] ?? []).map((entry) => ({
        id: entry.id,
        label: entry.description || entry.id,
      }));
    if (parameter.semanticType === 'characterRef' && parameter.picker === 'mapCharacter')
      return characterOptions;
    if (parameter.semanticType === 'anchorRef' && parameter.picker === 'mapAnchor')
      return anchorOptions;
    if (parameter.semanticType === 'dialogueRef' && parameter.picker === 'dialogue')
      return [...dialogues.values()].map((d) => ({ id: d.id, label: d.name || d.id }));
    return null;
  };
  const parameterLabel = (parameter: CutsceneAction['parameters'][number]) =>
    parameter.type === 'boolean'
      ? parameter.name
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase()
          .replace(/^./, (first) => first.toUpperCase())
      : parameter.semanticType === 'characterDeclaration'
        ? 'Instance name'
        : parameter.resourceType === 'character'
          ? 'Character'
          : parameter.name === 'character'
            ? 'Character'
            : parameter.name;
  const referenceLabel = (
    value: CutsceneStep['arguments'][string],
    parameter: CutsceneAction['parameters'][number],
  ) =>
    parameter.type === STORY_VALUE_TYPE
      ? JSON.stringify(value)
      : parameter.type === 'boolean'
        ? `${parameterLabel(parameter)}: ${(typeof value === 'boolean' ? value : parameter.defaultValue) ? 'On' : 'Off'}`
        : value === null && parameter.type === 'position' && parameter.nullable === true
          ? 'Global'
          : Array.isArray(value)
            ? `${value.length} waypoint${value.length === 1 ? '' : 's'}`
            : isAnchorPosition(value)
              ? anchorOptions.find((a) => a.id === value.anchor)?.label ||
                `Missing anchor: ${value.anchor}`
              : isMapPosition(value)
                ? `(${value.x}, ${value.y})`
                : typeof value === 'number'
                  ? String(value)
                  : optionsFor(parameter)?.find((o) => o.id === value)?.label || value || 'Not set';
  const summary = (step: CutsceneStep) => {
    if (isConditionalStep(step)) return String(step.arguments.condition || 'Enter a Lua condition');
    const action = actionFor(step);
    if (!action) return step.action;
    return action.parameters
      .map((p) => {
        const value = step.arguments[p.name];
        return p.semanticType === 'lua' && p.picker === 'lua' && typeof value === 'string'
          ? value
              .split(/\r?\n/)
              .find((line) => line.trim())
              ?.slice(0, 100) || 'Enter a Lua script'
          : referenceLabel(value, p);
      })
      .join(' → ');
  };
  const diagnostics = validateCutscene(scene, actions, {
    maps: maps.map((m) => (m.id === currentMap?.id ? currentMap : m)),
    entityTypes: types,
    dialogueIds: [...dialogues.keys()],
    resources,
    storyValues: storyDefinitions,
    tileSize,
  });
  const rootIssues = diagnostics.filter((d) => !d.stepId && !d.path.startsWith('onComplete'));
  const completionIssues = diagnostics.filter((d) => d.path.startsWith('onComplete'));
  const selectedIssues =
    panel === 'step'
      ? diagnostics.filter((d) => d.stepId === selectedStep?.id)
      : panel === 'setup'
        ? diagnostics.filter((d) => d.phase === 'setup')
        : panel === 'completion'
          ? completionIssues
          : rootIssues;
  const issueMessage = (issue: (typeof diagnostics)[number]) => {
    const name = issue.path.split('.arguments.')[1]?.split('.')[0];
    const step = allCutsceneSteps(scene).find((step) => step.id === issue.stepId);
    const parameter =
      step && actionFor(step)?.parameters.find((parameter) => parameter.name === name);
    return parameter ? `${parameterLabel(parameter)}: ${issue.message}` : issue.message;
  };
  const showIssues = (issues: typeof diagnostics) =>
    issues.length ? (
      <VStack align="stretch" spacing={1} role="alert">
        {issues.map((d, i) => (
          <Text key={i} color="editorDangerText" fontSize="xs">
            {issueMessage(d)}
          </Text>
        ))}
      </VStack>
    ) : null;
  type PathLocation =
    | { branchId: string; path: BranchPath }
    | { parallelId: string; track: number };
  const collection = (
    draft: Cutscene,
    section: 'onStart' | 'sequence' | 'completion',
    location?: PathLocation,
  ) =>
    location
      ? 'parallelId' in location
        ? draft.sequence.find((step) => step.id === location.parallelId)!.tracks![location.track]
        : draft.sequence.find((step) => step.id === location.branchId)![location.path]!
      : section === 'onStart'
        ? (draft.onStart ??= [])
        : section === 'completion'
          ? draft.onComplete.steps
          : draft.sequence;
  const reorder = (
    from: number,
    to: number,
    section: 'onStart' | 'sequence' | 'completion' = 'sequence',
    location?: PathLocation,
  ) => {
    if (from < 0 || to < 0 || from === to) return;
    update((draft) => {
      const list = collection(draft, section, location);
      const [step] = list.splice(from, 1);
      list.splice(to, 0, step);
    });
  };
  const add = (
    actionId: string,
    index: number,
    section: 'onStart' | 'sequence' | 'completion' = 'sequence',
    location?: PathLocation,
  ) => {
    const action = eligible(section).find((a) => a.id === actionId);
    if (
      !action &&
      (!['control.if', 'control.parallel'].includes(actionId) || section !== 'sequence' || location)
    )
      return;
    const step = action
      ? createCutsceneStep(action)
      : actionId === 'control.parallel'
        ? createCutsceneParallel()
        : createCutsceneCondition();
    update((draft) => {
      collection(draft, section, location).splice(index, 0, step);
    });
    setSelection({ kind: 'step', id: step.id });
    setActivePhase(section);
  };
  const duplicate = (step: CutsceneStep, index: number) => {
    const copy = duplicateCutsceneStep(step);
    const id = copy.id;
    edit((draft, draftLabels) => {
      cutsceneStepList(draft.find((s) => s.id === scene.id)!, step.id)!.splice(index + 1, 0, copy);
      const originals = allSequenceSteps([step]);
      allSequenceSteps([copy]).forEach((child, childIndex) => {
        const label = labels[`${scene.id}/${originals[childIndex].id}`];
        if (label) draftLabels[`${scene.id}/${child.id}`] = label;
      });
    });
    setSelection({ kind: 'step', id });
    setActivePhase(sectionOf(step.id));
  };
  const remove = (step: CutsceneStep) => {
    edit((draft, draftLabels) => {
      const list = cutsceneStepList(draft.find((s) => s.id === scene.id)!, step.id)!;
      list.splice(
        list.findIndex((s) => s.id === step.id),
        1,
      );
      for (const removed of allSequenceSteps([step]))
        delete draftLabels[`${scene.id}/${removed.id}`];
    });
    if (selectedStep?.id === step.id) setSelection({ kind: 'scene' });
  };
  const moveToSection = (step: CutsceneStep, target: 'onStart' | 'sequence' | 'completion') => {
    if (!eligible(target).some((a) => a.id === step.action)) return;
    update((draft) => {
      const from = cutsceneStepList(draft, step.id)!;
      const [moved] = from.splice(
        from.findIndex((s) => s.id === step.id),
        1,
      );
      collection(draft, target).push(moved);
    });
    setSelection({ kind: 'step', id: step.id });
    setActivePhase(target);
  };
  const palette = (
    trigger: React.ReactElement,
    index: number,
    section: 'onStart' | 'sequence' | 'completion' = 'sequence',
    location?: PathLocation,
  ) => (
    <SequenceTypeMenu
      trigger={trigger}
      options={[
        ...eligible(section)
          .filter(
            (action) => !location || !('parallelId' in location) || action.id !== 'cutscene.runLua',
          )
          .map((a) => ({ id: a.id, label: a.displayName })),
        ...(section === 'sequence' && !location
          ? [
              { id: 'control.if', label: 'Conditional branch' },
              { id: 'control.parallel', label: 'Parallel block' },
            ]
          : []),
      ]}
      onSelect={(id) => add(id, index, section, location)}
    />
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const preview = map
    ? previewCutscene(
        scene,
        map,
        types,
        actions,
        panel === 'scene' ? { kind: 'scene' } : selection,
        [...dialogues.keys()],
        tileSize,
        resources,
        branchChoices,
      )
    : null;
  const toTiles = (position: [number, number]): [number, number] => [
    position[0] / tileSize,
    position[1] / tileSize,
  ];
  const overlays: MapPreviewOverlay[] = [];
  for (const segment of preview?.segments ?? []) {
    const selected = selection.kind === 'step' && segment.stepId === selection.id;
    const from = toTiles(segment.from);
    const target = toTiles(segment.to);
    const dx = target[0] - from[0],
      dy = target[1] - from[1],
      length = Math.hypot(dx, dy);
    // Facing is a short direction indicator; movement is displacement to the actual endpoint.
    const to: [number, number] =
      segment.kind === 'face' && length
        ? [from[0] + (dx / length) * 1.2, from[1] + (dy / length) * 1.2]
        : target;
    overlays.push({
      kind: 'segment',
      from,
      to,
      label:
        segment.kind === 'face'
          ? `Faces ${preview?.characters.find((a) => a.id === preview.facings.find((f) => f.stepId === segment.stepId && f.characterId === segment.characterId)?.targetId)?.label || 'target'}`
          : segment.waypoint
            ? `${segment.number}.${segment.waypoint}`
            : String(segment.number),
      dashed: segment.kind === 'face',
      opacity: selected ? 1 : 0.35,
    });
    if (segment.kind === 'move' && (!segment.waypoint || segment.waypoint === 1))
      overlays.push({
        kind: 'character',
        position: from,
        label: '',
        ghost: true,
        opacity: selected ? 0.75 : 0.3,
      });
  }
  for (const character of preview?.characters ?? []) {
    if (character.position)
      overlays.push({
        kind: 'character',
        position: toTiles(character.position),
        characterId: character.id,
        icon: characterDefinitions.find((d) => d.id === character.definitionId)?.icon,
        label: character.label,
        facing: character.facing,
      });
  }
  for (const point of preview?.placements ?? []) {
    if (point.waypoint)
      overlays.push({
        kind: 'waypoint',
        position: toTiles(point.position),
        label: String(point.waypoint),
        opacity: selection.kind === 'step' && point.stepId === selection.id ? 1 : 0.35,
      });
  }
  const positionEffect =
    picking && selectedStep
      ? readActionPreview(actionFor(selectedStep))?.effects.find(
          (effect) =>
            ((effect.kind === 'setCharacterPosition' || effect.kind === 'spawnCharacter') &&
              effect.positionParameter === picking.parameter) ||
            (effect.kind === 'moveCharacterAlongPath' &&
              effect.pathParameter === picking.parameter),
        )
      : undefined;
  const placementCharacterId = endpointPicking
    ? endpointPicking.character
    : positionEffect?.kind === 'setCharacterPosition' ||
        positionEffect?.kind === 'spawnCharacter' ||
        positionEffect?.kind === 'moveCharacterAlongPath'
      ? selectedStep?.arguments[positionEffect.characterParameter]
      : undefined;
  const placementLabel =
    typeof placementCharacterId === 'string'
      ? characterOptions.find((a) => a.id === placementCharacterId)?.label || placementCharacterId
      : 'position';
  const placementDefinition =
    positionEffect?.kind === 'spawnCharacter'
      ? selectedStep?.arguments[positionEffect.definitionParameter]
      : preview?.characters.find((a) => a.id === placementCharacterId)?.definitionId;
  if ((picking || endpointPicking) && hoverPosition)
    overlays.push({
      kind: 'placement',
      icon: characterDefinitions.find((d) => d.id === placementDefinition)?.icon,
      position: [hoverPosition.x / tileSize, hoverPosition.y / tileSize],
      label: `${placementLabel} (${hoverPosition.x}, ${hoverPosition.y})`,
    });
  const positionPick = endpointPicking
    ? {
        mode: endpointPicking.mode,
        label: `${placementLabel} final position`,
        onCancel: cancelPicking,
        onHover: setHoverPosition,
        onPick: (position: MapPosition) => {
          update((draft) => {
            draft.onComplete.characterPlacements[endpointPicking.index] = completionPlacement(
              endpointPicking.character,
              position,
              draft.onComplete.characterPlacements[endpointPicking.index].facing,
            );
          });
          cancelPicking();
        },
      }
    : picking
      ? {
          mode: picking.mode,
          label:
            picking.waypoint === undefined
              ? placementLabel
              : `${placementLabel} waypoint ${picking.waypoint + 1}`,
          onCancel: cancelPicking,
          onHover: setHoverPosition,
          onPick: (position: MapPosition) => {
            update((draft) => {
              const step = allCutsceneSteps(draft).find((s) => s.id === picking.stepId);
              if (step) {
                if (picking.waypoint === undefined) step.arguments[picking.parameter] = position;
                else if (Array.isArray(step.arguments[picking.parameter]))
                  (step.arguments[picking.parameter] as PathArgument)[picking.waypoint] = position;
              }
            });
            cancelPicking();
          },
        }
      : undefined;
  const sceneFields = (
    <>
      <Field label="Name">
        <Input
          value={labels[scene.id] ?? ''}
          onChange={(e) =>
            edit((_draft, draftLabels) => {
              draftLabels[scene.id] = e.target.value;
            })
          }
        />
      </Field>
      <Field label="Map">
        <ReferenceSelect
          value={scene.mapId}
          options={maps.map((m) => ({ id: m.id, label: m.name }))}
          onChange={(mapId) =>
            update((draft) => {
              draft.mapId = mapId;
            })
          }
        />
      </Field>
      <Field
        label="Allow skipping"
        helperText="Skipping applies the same final positions and completion actions. Disable it when the player must make a dialogue choice."
      >
        <Switch
          isChecked={scene.allowSkip}
          onChange={(e) =>
            update((draft) => {
              draft.allowSkip = e.target.checked;
            })
          }
        />
      </Field>
      <Field
        label="Show transition"
        helperText="Fade to black, hold, then open from the center at both ends. Shared timings are configured in Unity's CutscenePresentation settings asset."
      >
        <Switch
          aria-label="Show transition"
          isChecked={(scene.transition ?? DEFAULT_CUTSCENE_TRANSITION).enabled}
          onChange={(e) =>
            update((draft) => {
              draft.transition = {
                ...(draft.transition ?? DEFAULT_CUTSCENE_TRANSITION),
                enabled: e.target.checked,
              };
            })
          }
        />
      </Field>
      <Box as="details">
        <Box as="summary" textStyle="helperText" cursor="pointer" mb={3}>
          Resource details
        </Box>
        <Field label="ID">
          <ReadOnlyIdField value={scene.id} />
        </Field>
      </Box>
    </>
  );
  const finalPositionLabel = (placement: CompletionPlacement) => {
    const position = completionPosition(placement);
    return isAnchorPosition(position)
      ? anchorOptions.find((anchor) => anchor.id === position.anchor)?.label || position.anchor
      : isMapPosition(position)
        ? `(${position.x}, ${position.y})`
        : 'Not set';
  };
  const completionFields = (
    <>
      <InspectorSection title="Final character positions">
        <Text textStyle="helperText">
          Placements apply before completion steps, both after watching and skipping. Other
          characters restore their original positions. Facing is kept unless a final facing or
          anchor direction overrides it.
        </Text>
        {scene.onComplete.characterPlacements.map((placement, index) => (
          <VStack
            key={index}
            align="stretch"
            spacing={2}
            bg="editorInlineBg"
            p={3}
            borderRadius="md"
          >
            <Field label="Character">
              <ReferenceSelect
                value={placement.character}
                options={characterOptions}
                onChange={(character) => {
                  cancelPicking();
                  update((draft) => {
                    draft.onComplete.characterPlacements[index].character = character;
                  });
                }}
              />
            </Field>
            <Field label="Final position">
              <MapPositionField
                value={completionPosition(placement)}
                modes={['tile', 'pixel', 'anchor']}
                anchors={anchorOptions}
                isPicking={endpointPicking?.index === index}
                onChange={(position) =>
                  update((draft) => {
                    draft.onComplete.characterPlacements[index] = completionPlacement(
                      placement.character,
                      position,
                      placement.facing,
                    );
                  })
                }
                onPick={(mode) => {
                  cancelPicking();
                  setEndpointPicking({
                    index,
                    character: placement.character,
                    mapId: scene.mapId,
                    mode,
                  });
                }}
                onModeChange={(mode) => {
                  if (mode === 'anchor') cancelPicking();
                  else if (endpointPicking?.index === index) {
                    setHoverPosition(null);
                    setEndpointPicking({ ...endpointPicking, mode });
                  }
                }}
                onCancel={cancelPicking}
              />
            </Field>
            <Field label="Final facing">
              <Select
                aria-label="Final facing"
                value={placement.facing ?? (placement.anchor !== undefined ? 'anchor' : 'preserve')}
                onChange={(e) =>
                  update((draft) => {
                    const endpoint = draft.onComplete.characterPlacements[index];
                    if (e.target.value === 'anchor') delete endpoint.facing;
                    else endpoint.facing = e.target.value as CompletionFacing;
                  })
                }
              >
                <option value="preserve">Keep current facing</option>
                {placement.anchor !== undefined && (
                  <option value="anchor">Use anchor facing</option>
                )}
                {(['North', 'East', 'South', 'West'] as const).map((direction) => (
                  <option key={direction} value={direction}>
                    {direction}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                cancelPicking();
                update((draft) => {
                  draft.onComplete.characterPlacements.splice(index, 1);
                });
              }}
            >
              Restore original
            </Button>
          </VStack>
        ))}
        <Select
          aria-label="New endpoint character"
          placeholder="Add character…"
          value={endpointCharacter}
          onChange={(e) => setEndpointCharacter(e.target.value)}
        >
          {characterOptions
            .filter((a) => !scene.onComplete.characterPlacements.some((p) => p.character === a.id))
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.id}
              </option>
            ))}
        </Select>
        <Button
          size="xs"
          isDisabled={!endpointCharacter}
          onClick={() => {
            update((draft) => {
              draft.onComplete.characterPlacements.push({
                character: endpointCharacter,
                anchor: '',
              });
            });
            setEndpointCharacter('');
          }}
        >
          Specify final position
        </Button>
      </InspectorSection>
    </>
  );
  const stepFields = selectedStep && (
    <>
      <datalist id="cutscene-story-keys">
        {(storyDefinitions ?? []).map((entry) => (
          <option key={entry.key} value={entry.key}>
            {entry.description ?? entry.type}
          </option>
        ))}
      </datalist>
      <Badge alignSelf="start" colorScheme="blue">
        {actionFor(selectedStep)?.displayName ?? selectedStep.action}
      </Badge>
      {[...(actionFor(selectedStep)?.parameters ?? [])]
        .sort(
          (a, b) =>
            (a.resourceType === 'character'
              ? -1
              : a.semanticType === 'characterDeclaration'
                ? 0
                : 1) -
            (b.resourceType === 'character'
              ? -1
              : b.semanticType === 'characterDeclaration'
                ? 0
                : 1),
        )
        .map((parameter) => {
          const options = optionsFor(parameter);
          const positionMetadata = positionPickerMetadata(parameter);
          const PositionField =
            parameter.nullable === true ? NullableMapPositionField : MapPositionField;
          const pathMetadata = pathPickerMetadata(parameter);
          const luaCode =
            parameter.type === 'string' &&
            parameter.semanticType === 'lua' &&
            parameter.picker === 'lua';
          const numeric =
            parameter.type === 'number' &&
            !parameter.semanticType &&
            !parameter.picker &&
            !parameter.resourceType;
          const boolean =
            parameter.type === 'boolean' &&
            !parameter.semanticType &&
            !parameter.picker &&
            !parameter.resourceType;
          const authoredValue = selectedStep.arguments[parameter.name];
          const storyKey = selectedStep.action.startsWith('story.') && parameter.name === 'key';
          const currentValue =
            authoredValue === undefined && parameter.optional === true
              ? parameter.defaultValue
              : authoredValue;
          const resourceList = parameter.resourceType
            ? resources[parameter.resourceType]
            : undefined;
          const storyIssue =
            storyKey &&
            typeof currentValue === 'string' &&
            currentValue &&
            !storyDefinitions?.some((entry) => entry.key === currentValue)
              ? `Warning: Story key '${currentValue}' is not declared in Data. Undeclared keys are allowed.`
              : undefined;
          const resourceIssue = parameter.resourceType
            ? !resourceList
              ? `Missing resource list "${parameter.resourceType}" in Lua manifest`
              : typeof currentValue === 'string' &&
                  currentValue &&
                  !resourceList.some((entry) => entry.id === currentValue)
                ? `Missing ${parameter.resourceType} resource: ${currentValue}`
                : undefined
            : undefined;
          const supported =
            parameter.type === STORY_VALUE_TYPE ||
            boolean ||
            luaCode ||
            parameter.semanticType === 'characterDeclaration' ||
            Boolean(positionMetadata) ||
            Boolean(pathMetadata) ||
            numeric ||
            (parameter.type === 'string' &&
              (options !== null || (!parameter.semanticType && !parameter.picker)));
          return (
            <Field
              key={parameter.name}
              label={parameterLabel(parameter)}
              isInvalid={Boolean(resourceIssue)}
              helperText={
                resourceIssue ??
                storyIssue ??
                (supported
                  ? parameter.semanticType === 'characterDeclaration'
                    ? 'A unique name for this copy of the character, such as guest. Later steps use this name.'
                    : parameter.resourceType === 'character'
                      ? 'Choose a character defined in this project. Unity resolves its runtime prefab.'
                      : undefined
                  : `Unsupported manifest parameter: ${parameter.type} ${parameter.semanticType ?? ''}/${parameter.picker ?? ''}`)
              }
            >
              {parameter.type === STORY_VALUE_TYPE ? (
                <StoryValueField
                  key={
                    selectedStep.id +
                    '/' +
                    parameter.name +
                    '/' +
                    String(selectedStep.arguments.key)
                  }
                  value={currentValue}
                  declaredType={
                    storyDefinitions?.find((entry) => entry.key === selectedStep.arguments.key)
                      ?.type
                  }
                  declarationKey={
                    typeof selectedStep.arguments.key === 'string'
                      ? selectedStep.arguments.key
                      : undefined
                  }
                  onDeclare={
                    typeof selectedStep.arguments.key === 'string' &&
                    selectedStep.arguments.key.trim()
                      ? (type) => {
                          const current = useEditorStore.getState().project;
                          if (!current)
                            throw new Error('Story declarations require an open project.');
                          saveStoryValueDeclarations([
                            ...(current.storyValues ?? []),
                            { key: String(selectedStep.arguments.key), type },
                          ]);
                        }
                      : undefined
                  }
                  onChange={(value) =>
                    update((draft) => {
                      allCutsceneSteps(draft).find(
                        (step) => step.id === selectedStep.id,
                      )!.arguments[parameter.name] = value;
                    })
                  }
                />
              ) : luaCode ? (
                <Box
                  border="1px"
                  borderColor="editorInlineBorder"
                  borderRadius="md"
                  overflow="hidden"
                >
                  <LuaScriptEditor
                    value={typeof currentValue === 'string' ? currentValue : ''}
                    height="260px"
                    documentId={`cutscene/${scene.id}/${selectedStep.id}/${parameter.name}`}
                    scope={{
                      mode: 'script',
                      context: 'cutscene',
                      phase: phaseFor(selectedSection),
                    }}
                    argumentReferences={{
                      anchors: anchorOptions.map((anchor) => ({
                        id: anchor.id,
                        name: anchor.label,
                      })),
                      dialogues: [...dialogues.values()].map((dialogue) => ({
                        id: dialogue.id,
                        name: dialogue.name,
                      })),
                    }}
                    characterReferences={characterOptions.map((actor) => ({
                      id: actor.id,
                      name: actor.label,
                    }))}
                    gameVariables={gameVariables}
                    scriptTables={scriptTables}
                    scriptFunctions={scriptFunctions}
                    scriptNamespaces={scriptNamespaces}
                    onChange={(value) =>
                      update((draft) => {
                        allCutsceneSteps(draft).find(
                          (step) => step.id === selectedStep.id,
                        )!.arguments[parameter.name] = value;
                      })
                    }
                  />
                </Box>
              ) : pathMetadata ? (
                <MapPathField
                  key={selectedStep.id + '/' + parameter.name}
                  value={selectedStep.arguments[parameter.name]}
                  modes={pathMetadata.placementModes}
                  anchors={anchorOptions}
                  pickingIndex={
                    picking?.stepId === selectedStep.id && picking.parameter === parameter.name
                      ? picking.waypoint
                      : undefined
                  }
                  onChange={(value) =>
                    update((draft) => {
                      allCutsceneSteps(draft).find((s) => s.id === selectedStep.id)!.arguments[
                        parameter.name
                      ] = value;
                    })
                  }
                  onPick={(waypoint, mode) => {
                    setHoverPosition(null);
                    setPicking({
                      stepId: selectedStep.id,
                      parameter: parameter.name,
                      mapId: scene.mapId,
                      mode,
                      waypoint,
                    });
                  }}
                  onModeChange={(mode) => {
                    if (mode === 'anchor') cancelPicking();
                    else if (picking?.parameter === parameter.name) {
                      setPicking({ ...picking, mode });
                      setHoverPosition(null);
                    }
                  }}
                  onCancel={cancelPicking}
                />
              ) : positionMetadata ? (
                <PositionField
                  key={selectedStep.id + '/' + parameter.name}
                  value={selectedStep.arguments[parameter.name]}
                  modes={positionMetadata.placementModes}
                  anchors={anchorOptions}
                  isPicking={
                    picking?.stepId === selectedStep.id && picking.parameter === parameter.name
                  }
                  onChange={(value) =>
                    update((draft) => {
                      allCutsceneSteps(draft).find((s) => s.id === selectedStep.id)!.arguments[
                        parameter.name
                      ] = value;
                    })
                  }
                  onPick={(mode) => {
                    setHoverPosition(null);
                    setPicking({
                      stepId: selectedStep.id,
                      parameter: parameter.name,
                      mapId: scene.mapId,
                      mode,
                    });
                  }}
                  onModeChange={(mode) => {
                    if (mode === 'anchor') {
                      cancelPicking();
                      return;
                    }
                    if (picking?.parameter === parameter.name) {
                      setPicking({ ...picking, mode });
                      setHoverPosition(null);
                    }
                  }}
                  onCancel={cancelPicking}
                />
              ) : boolean ? (
                <Switch
                  aria-label={parameterLabel(parameter)}
                  isChecked={
                    typeof currentValue === 'boolean'
                      ? currentValue
                      : parameter.defaultValue === true
                  }
                  onChange={(e) =>
                    update((draft) => {
                      allCutsceneSteps(draft).find(
                        (step) => step.id === selectedStep.id,
                      )!.arguments[parameter.name] = e.target.checked;
                    })
                  }
                />
              ) : numeric ? (
                <NumericCutsceneArgument
                  value={
                    typeof currentValue === 'object'
                      ? ''
                      : ((currentValue as string | number) ?? '')
                  }
                  onChange={(value) =>
                    update((draft) => {
                      allCutsceneSteps(draft).find((s) => s.id === selectedStep.id)!.arguments[
                        parameter.name
                      ] = value;
                    })
                  }
                />
              ) : options ? (
                <ReferenceSelect
                  value={
                    typeof selectedStep.arguments[parameter.name] === 'string'
                      ? (selectedStep.arguments[parameter.name] as string)
                      : ''
                  }
                  options={options}
                  onChange={(value) =>
                    update((draft) => {
                      allCutsceneSteps(draft).find((s) => s.id === selectedStep.id)!.arguments[
                        parameter.name
                      ] = value;
                      if (parameter.resourceType === 'character' && value) {
                        const step = allCutsceneSteps(draft).find((s) => s.id === selectedStep.id)!;
                        const declaration = actionFor(selectedStep)?.parameters.find(
                          (p) => p.semanticType === 'characterDeclaration',
                        );
                        if (declaration && !step.arguments[declaration.name]) {
                          const label =
                            characterDefinitions.find((character) => character.id === value)
                              ?.name ||
                            value.split(':').pop() ||
                            'guest';
                          const base =
                            label
                              .toLowerCase()
                              .replace(/[^a-z0-9_-]+/g, '-')
                              .replace(/^-+|-+$/g, '') || 'guest';
                          const used = new Set([
                            ...baseCharacterOptions.map((character) => character.id),
                            ...declaredCharactersBefore(draft, actions, []),
                          ]);
                          let name = base;
                          for (let suffix = 2; used.has(name); suffix++) name = `${base}-${suffix}`;
                          step.arguments[declaration.name] = name;
                        }
                      }
                    })
                  }
                />
              ) : (
                <Input
                  isDisabled={!supported}
                  list={storyKey ? 'cutscene-story-keys' : undefined}
                  value={
                    typeof currentValue === 'object'
                      ? ''
                      : ((currentValue as string | number) ?? '')
                  }
                  onChange={(e) =>
                    update((draft) => {
                      allCutsceneSteps(draft).find((s) => s.id === selectedStep.id)!.arguments[
                        parameter.name
                      ] = e.target.value;
                      if (storyKey && selectedStep.action === 'story.set') {
                        const step = allCutsceneSteps(draft).find((s) => s.id === selectedStep.id)!;
                        const declaration = storyDefinitions?.find(
                          (entry) => entry.key === e.target.value,
                        );
                        if (
                          declaration &&
                          !matchesStoryType(step.arguments.value, declaration.type)
                        )
                          step.arguments.value = defaultStoryValue(declaration.type);
                      }
                    })
                  }
                />
              )}
            </Field>
          );
        })}
      <Text textStyle="helperText">{actionFor(selectedStep)?.description}</Text>
      <Text textStyle="helperText">
        {actionFor(selectedStep)?.execution === 'awaitable'
          ? 'Waits for this action to finish before continuing.'
          : 'Continues immediately.'}
      </Text>
      <Box as="details">
        <Box as="summary" textStyle="helperText" cursor="pointer" mb={3}>
          Step details
        </Box>
        <VStack align="stretch" spacing={3}>
          <Field label="Step ID">
            <ReadOnlyIdField value={selectedStep.id} />
          </Field>
          <Field label="Step label">
            <Input
              value={labels[`${scene.id}/${selectedStep.id}`] ?? ''}
              onChange={(e) =>
                edit((_draft, draftLabels) => {
                  draftLabels[`${scene.id}/${selectedStep.id}`] = e.target.value;
                })
              }
            />
          </Field>
        </VStack>
      </Box>
    </>
  );
  const renderSteps = (section: 'onStart' | 'sequence' | 'completion', location?: PathLocation) => {
    const list =
      section === 'onStart' && !location
        ? (scene.onStart ?? [])
        : collection(scene, section, location);
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (over)
            reorder(
              list.findIndex((s) => s.id === active.id),
              list.findIndex((s) => s.id === over.id),
              section,
              location,
            );
        }}
      >
        <SortableContext items={list.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <Box>
            {list.map((step, index) => {
              if (isParallelStep(step))
                return (
                  <SortableSequenceItem key={step.id} id={step.id}>
                    <SequenceCard
                      selected={selectedStep?.id === step.id}
                      borderLeftColor="blue.300"
                      p={2}
                      onClick={() => setSelection({ kind: 'step', id: step.id })}
                    >
                      <HStack pr={4} justify="space-between" flexWrap="wrap">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setSelection({ kind: 'step', id: step.id })}
                        >
                          Step {index + 1} · Parallel block
                        </Button>
                        <HStack onClick={(event) => event.stopPropagation()}>
                          <Button size="xs" variant="ghost" onClick={() => duplicate(step, index)}>
                            Duplicate block
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            color="editorDangerText"
                            onClick={() => remove(step)}
                          >
                            Delete block
                          </Button>
                        </HStack>
                      </HStack>
                      <Box
                        display="flex"
                        flexWrap="wrap"
                        gap={3}
                        mt={2}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {step.tracks!.map((track, trackIndex) => (
                          <Box
                            key={trackIndex}
                            flex="1 1 240px"
                            minW={0}
                            borderLeft="2px solid"
                            borderColor="editorSequenceBorder"
                            pl={3}
                          >
                            <HStack justify="space-between">
                              <Text textStyle="sectionLabel">Track {trackIndex + 1}</Text>
                              <Button
                                size="xs"
                                variant="ghost"
                                isDisabled={step.tracks!.length <= 2}
                                aria-label={`Remove track ${trackIndex + 1}`}
                                onClick={() =>
                                  edit((draft, draftLabels) => {
                                    const block = draft
                                      .find((s) => s.id === scene.id)!
                                      .sequence.find((s) => s.id === step.id)!;
                                    const [removed] = block.tracks!.splice(trackIndex, 1);
                                    for (const child of allSequenceSteps(removed))
                                      delete draftLabels[`${scene.id}/${child.id}`];
                                  })
                                }
                              >
                                Remove
                              </Button>
                            </HStack>
                            {renderSteps('sequence', { parallelId: step.id, track: trackIndex })}
                            {palette(
                              <Button size="xs" variant="outline" mt={2}>
                                Add track {trackIndex + 1} step
                              </Button>,
                              track.length,
                              'sequence',
                              { parallelId: step.id, track: trackIndex },
                            )}
                          </Box>
                        ))}
                      </Box>
                      <Button
                        size="xs"
                        variant="outline"
                        mt={3}
                        onClick={(event) => {
                          event.stopPropagation();
                          update((draft) =>
                            draft.sequence.find((s) => s.id === step.id)!.tracks!.push([]),
                          );
                        }}
                      >
                        Add track
                      </Button>
                      <Text textStyle="helperText" mt={3}>
                        Join — wait for every track, then continue with the next sequence step.
                      </Text>
                      {showIssues(diagnostics.filter((issue) => issue.stepId === step.id))}
                    </SequenceCard>
                  </SortableSequenceItem>
                );
              if (isConditionalStep(step))
                return (
                  <SortableSequenceItem key={step.id} id={step.id}>
                    <SequenceCard
                      selected={selectedStep?.id === step.id}
                      borderLeftColor="blue.300"
                      p={2}
                      onClick={() => setSelection({ kind: 'step', id: step.id })}
                    >
                      <HStack pr={4} justify="space-between" flexWrap="wrap">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setSelection({ kind: 'step', id: step.id })}
                        >
                          Step {index + 1} · Conditional branch
                        </Button>
                        <HStack>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              duplicate(step, index);
                            }}
                          >
                            Duplicate branch
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            color="editorDangerText"
                            onClick={(event) => {
                              event.stopPropagation();
                              remove(step);
                            }}
                          >
                            Delete branch
                          </Button>
                        </HStack>
                      </HStack>
                      <Text
                        fontFamily="mono"
                        fontSize="xs"
                        my={1}
                        noOfLines={2}
                        title={summary(step)}
                      >
                        {summary(step)}
                      </Text>
                      {(['then', 'else'] as const).map((path) => (
                        <Box
                          key={path}
                          borderLeft="2px solid"
                          borderColor="editorSequenceBorder"
                          pl={3}
                          mt={3}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Text textStyle="sectionLabel">
                            {path === 'then' ? 'If true' : 'Else'}
                          </Text>
                          {renderSteps('sequence', { branchId: step.id, path })}
                          {palette(
                            <Button size="xs" variant="outline" mt={2}>
                              Add {path === 'then' ? 'If' : 'Else'} step
                            </Button>,
                            step[path]!.length,
                            'sequence',
                            { branchId: step.id, path },
                          )}
                        </Box>
                      ))}
                      <Text textStyle="helperText" mt={3}>
                        Paths rejoin here. Continue with the next sequence step.
                      </Text>
                      {showIssues(diagnostics.filter((issue) => issue.stepId === step.id))}
                    </SequenceCard>
                  </SortableSequenceItem>
                );
              const action = actionFor(step);
              const issues = diagnostics.filter((d) => d.stepId === step.id);
              const color = action?.parameters.some((p) => p.semanticType === 'dialogueRef')
                ? 'purple.300'
                : action?.execution === 'immediate'
                  ? 'orange.300'
                  : 'blue.300';
              return (
                <SortableSequenceItem key={step.id} id={step.id} handleTop="20px">
                  <Box textAlign="center" role="group" h="10px">
                    {palette(
                      <Button
                        size="xs"
                        variant="ghost"
                        h="10px"
                        minH="10px"
                        w="full"
                        fontSize="9px"
                        lineHeight={1}
                        opacity={0}
                        _groupHover={{ opacity: 1 }}
                        _focusVisible={{ opacity: 1, boxShadow: 'outline' }}
                        _expanded={{ opacity: 1 }}
                        color="editorMutedText"
                        isDisabled={!eligible(section).length}
                      >
                        + insert
                      </Button>,
                      index,
                      section,
                      location,
                    )}
                  </Box>
                  <SequenceCard
                    selected={selectedStep?.id === step.id}
                    borderLeftColor={color}
                    px={2}
                    py={1}
                    mb={0}
                    onClick={() => setSelection({ kind: 'step', id: step.id })}
                  >
                    <HStack pr={3} spacing={2} minH="24px" minW={0}>
                      <Text textStyle="helperText" minW="12px" flexShrink={0}>
                        {index + 1}
                      </Text>
                      <Text
                        color={color}
                        fontSize="11px"
                        textTransform="uppercase"
                        fontWeight="bold"
                        maxW="42%"
                        noOfLines={1}
                        flexShrink={0}
                        title={action?.displayName ?? step.action}
                      >
                        {action?.displayName ?? step.action}
                      </Text>
                      <Button
                        variant="unstyled"
                        display="block"
                        h="auto"
                        minW={0}
                        flex={1}
                        whiteSpace="nowrap"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        textAlign="start"
                        fontWeight="normal"
                        fontSize="xs"
                        title={labels[`${scene.id}/${step.id}`] || summary(step)}
                        onClick={() => setSelection({ kind: 'step', id: step.id })}
                      >
                        {labels[`${scene.id}/${step.id}`] || summary(step)}
                      </Button>
                      <Box flexShrink={0} onClick={(e) => e.stopPropagation()}>
                        <Menu>
                          {({ isOpen }) => (
                            <>
                              <MenuButton
                                as={IconButton}
                                aria-label={`${section === 'onStart' ? 'Setup step' : section === 'completion' ? 'Completion step' : 'Step'} ${index + 1} actions`}
                                icon={<ChevronDownIcon />}
                                size="xs"
                                h="20px"
                                minW="20px"
                                opacity={selectedStep?.id === step.id ? 1 : 0}
                                _groupHover={{ opacity: 1 }}
                                _focusVisible={{ opacity: 1, boxShadow: 'outline' }}
                                _expanded={{ opacity: 1 }}
                                variant="ghost"
                              />
                              {isOpen && (
                                <MenuList>
                                  <MenuItem onClick={() => duplicate(step, index)}>
                                    Duplicate step
                                  </MenuItem>
                                  <MenuItem
                                    isDisabled={!index}
                                    onClick={() => reorder(index, index - 1, section, location)}
                                  >
                                    Move up
                                  </MenuItem>
                                  <MenuItem
                                    isDisabled={index === list.length - 1}
                                    onClick={() => reorder(index, index + 1, section, location)}
                                  >
                                    Move down
                                  </MenuItem>
                                  {(['onStart', 'sequence', 'completion'] as const)
                                    .filter((target) => target !== section)
                                    .map((target) => (
                                      <MenuItem
                                        key={target}
                                        isDisabled={
                                          !eligible(target).some((a) => a.id === step.action)
                                        }
                                        onClick={() => moveToSection(step, target)}
                                      >
                                        Move to{' '}
                                        {target === 'onStart'
                                          ? 'Before start'
                                          : target === 'completion'
                                            ? 'On completion'
                                            : 'sequence'}
                                      </MenuItem>
                                    ))}
                                  <MenuItem color="editorDangerText" onClick={() => remove(step)}>
                                    Delete step
                                  </MenuItem>
                                </MenuList>
                              )}
                            </>
                          )}
                        </Menu>
                      </Box>
                    </HStack>
                    {issues.length > 0 && (
                      <Text color="editorDangerText" fontSize="xs" mt={1}>
                        {issueMessage(issues[0])}
                        {issues.length > 1 ? ` (+${issues.length - 1})` : ''}
                      </Text>
                    )}
                  </SequenceCard>
                </SortableSequenceItem>
              );
            })}
          </Box>
        </SortableContext>
      </DndContext>
    );
  };
  return (
    <ResizableEditorLayout
      header={{ title: labels[scene.id] || scene.id }}
      viewportBackground={false}
      leftPanel={leftPanel}
      rightPanelDefaultSize={28}
      rightPanel={
        <InspectorPanel
          title={
            panel === 'scene'
              ? labels[scene.id] || 'Cutscene'
              : panel === 'completion'
                ? 'On completion'
                : panel === 'setup'
                  ? 'Before start'
                  : isParallelStep(selectedStep!)
                    ? 'Parallel block'
                    : isConditionalStep(selectedStep!)
                      ? 'Conditional branch'
                      : actionFor(selectedStep!)?.displayName || selectedStep!.action
          }
          subtitle={
            panel === 'step'
              ? `${selectedSection === 'onStart' ? 'Setup step' : selectedSection === 'completion' ? 'Completion step' : 'Step'} ${selectedList.findIndex((s) => s.id === selectedStep?.id) + 1} of ${selectedList.length}`
              : panel === 'completion'
                ? 'After watching or skipping'
                : scene.id
          }
        >
          {showIssues(selectedIssues)}
          {panel === 'scene' ? (
            sceneFields
          ) : panel === 'completion' ? (
            completionFields
          ) : panel === 'setup' ? (
            <Text textStyle="helperText">
              Runs once before the sequence. Only immediate actions explicitly allowed in setup are
              available. Select a setup step to edit its parameters.
            </Text>
          ) : selectedStep && isParallelStep(selectedStep) ? (
            <Text textStyle="helperText">
              Tracks start together. Each track runs its actions in order. The block joins when
              every track finishes. Use separate characters in each track; put shared character
              actions and Run Lua outside the block. Preview shows track destinations schematically;
              timing is verified in Unity.
            </Text>
          ) : selectedStep && isConditionalStep(selectedStep) ? (
            <VStack align="stretch" spacing={4}>
              <Field label="Lua condition">
                <ConditionEditor
                  syntaxOnly
                  value={String(selectedStep.arguments.condition ?? '')}
                  variables={gameVariables}
                  tables={scriptTables}
                  functions={scriptFunctions}
                  namespaces={scriptNamespaces}
                  onChange={(condition) =>
                    update((draft) => {
                      draft.sequence.find(
                        (step) => step.id === selectedStep.id,
                      )!.arguments.condition = condition;
                    })
                  }
                />
              </Field>
              <Text textStyle="helperText">
                Evaluated once when this step is reached. True runs the If path; false runs Else.
                Both paths then continue with the next step. An empty path does nothing.
              </Text>
              <Field label="Preview path">
                <Select
                  size="sm"
                  value={branchChoices[selectedStep.id] ?? 'then'}
                  onChange={(event) =>
                    setBranchChoices((choices) => ({
                      ...choices,
                      [selectedStep.id]: event.target.value as BranchPath,
                    }))
                  }
                >
                  <option value="then">If true</option>
                  <option value="else">Else</option>
                </Select>
              </Field>
              <Text textStyle="helperText">
                Preview choice only. Playback uses live game state.
              </Text>
            </VStack>
          ) : (
            stepFields
          )}
        </InspectorPanel>
      }
      content={
        <TopTabbedEditorLayout
          title=""
          headerActions={
            <>
              <Button size="xs" variant="outline" onClick={() => setSelection({ kind: 'scene' })}>
                Scene settings
              </Button>
              {palette(
                <Button
                  size="xs"
                  variant="outline"
                  leftIcon={<AddIcon />}
                  isDisabled={!eligible(activePhase).length}
                >
                  {activePhase === 'onStart'
                    ? 'Add setup step'
                    : activePhase === 'completion'
                      ? 'Add completion step'
                      : 'Add step'}
                </Button>,
                selectedStep && selectedSection === activePhase
                  ? selectedList.findIndex((s) => s.id === selectedStep.id) + 1
                  : sectionSteps(activePhase).length,
                activePhase,
              )}
            </>
          }
          tabs={[
            {
              id: 'onStart',
              label: 'Before start',
              badge: setupSteps.length,
              issueCount: diagnostics.filter((d) => d.phase === 'setup').length,
            },
            {
              id: 'sequence',
              label: 'Sequence',
              badge: scene.sequence.length,
              issueCount: diagnostics.filter((d) => d.phase === 'sequence').length,
            },
            {
              id: 'completion',
              label: 'On completion',
              badge: completionSteps.length,
              issueCount: completionIssues.length,
            },
          ]}
          activeTab={activePhase}
          onTabChange={(phase) => {
            setActivePhase(phase);
            setSelection(
              phase === 'onStart'
                ? { kind: 'setup' }
                : phase === 'completion'
                  ? { kind: 'completion' }
                  : scene.sequence[0]
                    ? { kind: 'step', id: scene.sequence[0].id }
                    : { kind: 'scene' },
            );
          }}
          mainContent={
            <VStack h="full" align="stretch" spacing={0} bg="editorWorkspaceBg">
              <Box flex={1} minH={0}>
                <SplitEditorCanvas
                  primary={
                    <Box p={3}>
                      <VStack align="stretch" spacing={1}>
                        {notice}
                        {rootIssues.length > 0 && (
                          <Button
                            variant="ghost"
                            size="xs"
                            color="editorDangerText"
                            justifyContent="start"
                            onClick={() => setSelection({ kind: 'scene' })}
                          >
                            {rootIssues[0].message}
                          </Button>
                        )}

                        {activePhase === 'completion' && (
                          <SequenceCard
                            selected={panel === 'completion'}
                            p={2}
                            mt={2}
                            mb={0}
                            borderLeftColor="editorMutedText"
                            onClick={() => setSelection({ kind: 'completion' })}
                          >
                            <Text fontWeight="semibold">Final character positions</Text>
                            <Text textStyle="helperText">
                              {scene.onComplete.characterPlacements.length
                                ? scene.onComplete.characterPlacements
                                    .map(
                                      (p) =>
                                        `${characterOptions.find((a) => a.id === p.character)?.label || p.character} → ${finalPositionLabel(p)}`,
                                    )
                                    .join(' · ')
                                : 'Restore original character positions'}
                            </Text>
                            {completionIssues.length > 0 && (
                              <Text color="editorDangerText" fontSize="xs">
                                {completionIssues[0]?.message}
                              </Text>
                            )}
                          </SequenceCard>
                        )}
                        <>
                          {activePhase === 'onStart' && (
                            <Text textStyle="helperText" mb={2}>
                              Immediate setup actions run before the sequence.
                            </Text>
                          )}
                          {renderSteps(activePhase)}
                          {palette(
                            <Button
                              size="xs"
                              variant="outline"
                              borderStyle="dashed"
                              isDisabled={!eligible(activePhase).length}
                            >
                              {activePhase === 'onStart'
                                ? '+ Add setup step'
                                : activePhase === 'completion'
                                  ? '+ Add completion step'
                                  : '+ Add step'}
                            </Button>,
                            sectionSteps(activePhase).length,
                            activePhase,
                          )}
                        </>
                      </VStack>
                    </Box>
                  }
                  preview={
                    <CutscenePreviewPanel
                      positionPick={positionPick}
                      mapId={map?.id}
                      mapName={map?.name}
                      caption={
                        panel === 'scene'
                          ? 'Original placement'
                          : panel === 'completion'
                            ? 'After completion'
                            : panel === 'setup'
                              ? 'After setup'
                              : `After ${selectedSection === 'onStart' ? 'setup step' : selectedSection === 'completion' ? 'completion step' : 'step'} ${selectedList.findIndex((s) => s.id === selectedStep?.id) + 1}`
                      }
                      tileSize={tileSize}
                      focusKey={panel === 'step' ? selectedStep!.id : panel}
                      overlays={overlays}
                      preview={preview}
                      selectedStepId={selectedStep?.id}
                      stepNumbers={Object.fromEntries([
                        ...setupSteps.map((s, i) => [s.id, `setup ${i + 1}`]),
                        ...scene.sequence.map((s, i) => [s.id, i + 1]),
                        ...completionSteps.map((s, i) => [s.id, `completion ${i + 1}`]),
                      ])}
                      dialogueNames={Object.fromEntries(
                        [...dialogues.values()].map((d) => [d.id, d.name]),
                      )}
                    />
                  }
                />
              </Box>
            </VStack>
          }
        />
      }
    />
  );
};

const ReferenceSelect: React.FC<{
  value: string;
  options: { id: string; label: string; disabled?: boolean; note?: string }[];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => (
  <Select value={value} placeholder="Select…" onChange={(e) => onChange(e.target.value)}>
    {value && !options.some((o) => o.id === value) && (
      <option value={value}>Missing: {value}</option>
    )}
    {options.map((option) => (
      <option key={option.id} value={option.id} disabled={option.disabled}>
        {option.label} · {option.id}
        {option.note ? ` (${option.note})` : ''}
      </option>
    ))}
  </Select>
);
