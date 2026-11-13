import React, { useMemo, useState } from 'react';
import { Badge, Box, Flex, HStack, Text, Tooltip, VStack } from '@chakra-ui/react';
import { FiClock } from 'react-icons/fi';
import { MdRedo, MdUndo } from 'react-icons/md';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { useEditorStore } from '../../../store/useEditorStore';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { EditorResizeHandle } from '../../common/EditorWorkspaceShell';
import { GhostIconButton } from '../../common/IconButtons';
import { EmptyScreen } from '../common/EmptyScreen';
import {
  dayAt,
  entriesOf,
  fallbackIndex,
  routineLabel,
  validateRoutine,
  type RoutineDayRef,
} from '../../../lib/routines';
import type { Routine, RoutinePlace } from '../../../types/routine';
import { RoutineDaysPanel } from './RoutineDaysPanel';
import { RoutineDayPanel } from './RoutineDayPanel';
import { RoutineMapPanel } from './RoutineMapPanel';
import { useRoutineLegs } from './useRoutineLegs';
import type { RoutineGoal } from '../../../types/routine';

const NO_GOALS: RoutineGoal[] = [];
import { PlaceField } from './PlaceField';

/** What a map click assigns while picking: the routine's home, or a goal's destination. */
export type PlaceTarget = { kind: 'home' } | { kind: 'goal'; goalIndex: number };

/**
 * Edits one NPC's daily routine: the list of days in first-hit order, the selected day's goals, and a map with
 * the walked routes. See docs/routine-editor.md.
 */
export const RoutineEditor: React.FC<{ routineId: string }> = ({ routineId }) => {
  const routine = useEditorStore((state) => state.routines.find((entry) => entry.id === routineId));
  if (!routine)
    return (
      <EmptyScreen
        icon={<FiClock />}
        title="Routine not found"
        description="The routine was deleted or renamed outside Vulcanus."
      />
    );
  return <RoutineWorkspace key={routine.id} routine={routine} />;
};

function initialDay(routine: Routine): RoutineDayRef {
  const fallback = fallbackIndex(routine.variants);
  const entryIndex = Math.max(0, fallback);
  return {
    list: 'variants',
    entryIndex,
    choiceIndex: routine.variants[entryIndex]?.pickOne ? 0 : null,
  };
}

const RoutineWorkspace: React.FC<{ routine: Routine }> = ({ routine }) => {
  const characters = useEditorStore((state) => state.characters);
  const maps = useEditorStore((state) => state.maps);
  const routines = useEditorStore((state) => state.routines);
  const updateRoutine = useEditorStore((state) => state.updateRoutine);
  const undo = useEditorStore((state) => state.undoRoutine);
  const redo = useEditorStore((state) => state.redoRoutine);
  const canUndo = useEditorStore((state) => (state.routinePast[routine.id]?.length ?? 0) > 0);
  const canRedo = useEditorStore((state) => (state.routineFuture[routine.id]?.length ?? 0) > 0);
  const animations = useScriptingManifestStore((state) => state.manifest?.resources?.animation);

  const [selectedDay, setSelectedDay] = useState<RoutineDayRef>(() => initialDay(routine));
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);
  const [picking, setPicking] = useState<PlaceTarget | null>(null);
  /** Conditions ticked in the day preview, or null while the preview is off. */
  const [preview, setPreview] = useState<ReadonlySet<string> | null>(null);

  const issues = useMemo(
    () =>
      validateRoutine(routine, {
        maps,
        characterIds: new Set(characters.map((character) => character.id)),
        animationIds: animations ? new Set(animations.map((animation) => animation.id)) : null,
        otherRoutines: routines,
      }),
    [routine, maps, characters, animations, routines],
  );

  // Keep the selection valid when days are removed or reordered elsewhere (undo, another tab).
  const day = dayAt(routine, selectedDay);
  const effectiveDay = day ? selectedDay : initialDay(routine);
  const goals = dayAt(routine, effectiveDay)?.goals ?? NO_GOALS;
  const legs = useRoutineLegs(routine, goals, preview);
  const goalIndex = selectedGoal !== null && selectedGoal < goals.length ? selectedGoal : null;

  const selectDay = (ref: RoutineDayRef) => {
    setSelectedDay(ref);
    setSelectedGoal(null);
    setPicking(null);
  };
  const update = (next: Routine) => updateRoutine(routine.id, next);
  const setHome = (home: RoutinePlace) => update({ ...routine, home });
  const generalIssues = issues.filter((issue) => !issue.day);
  const name = routineLabel(routine, characters);
  const reachableCount =
    (routine.overrides?.length ?? 0) +
    entriesOf(routine, 'variants').slice(0, Math.max(0, fallbackIndex(routine.variants)) + 1)
      .length;

  return (
    <Flex direction="column" h="full" minH={0} bg="editorPanelBg">
      <HStack
        px={4}
        py={2}
        spacing={4}
        borderBottom="1px"
        borderColor="editorShellBorder"
        bg="editorHeaderBg"
        align="center"
        flexShrink={0}
      >
        <VStack align="start" spacing={0} minW="160px">
          <Text fontWeight="bold" color="editorText" lineHeight={1.2}>
            {name}
          </Text>
          <Text textStyle="monoMeta">{routine.id}</Text>
        </VStack>
        <HStack spacing={2} flex={1} minW={0}>
          <Text fontSize="xs" color="editorMutedText" flexShrink={0}>
            Home
          </Text>
          <Box flex={1} maxW="420px">
            <PlaceField
              value={routine.home}
              onChange={setHome}
              picking={picking?.kind === 'home'}
              onPick={() => setPicking(picking?.kind === 'home' ? null : { kind: 'home' })}
            />
          </Box>
        </HStack>
        <Badge variant="editor">{reachableCount} days</Badge>
        {issues.length > 0 ? (
          <Tooltip
            hasArrow
            label={
              <VStack align="start" spacing={0.5}>
                {issues.slice(0, 12).map((issue, i) => (
                  <Text key={i} fontSize="xs">
                    {issue.message}
                  </Text>
                ))}
              </VStack>
            }
          >
            <Badge colorScheme="red">{issues.length} to fix</Badge>
          </Tooltip>
        ) : (
          <Badge colorScheme="green">Valid</Badge>
        )}
        <HStack spacing={0}>
          <GhostIconButton
            aria-label="Undo"
            icon={<MdUndo />}
            isDisabled={!canUndo}
            onClick={() => undo(routine.id)}
          />
          <GhostIconButton
            aria-label="Redo"
            icon={<MdRedo />}
            isDisabled={!canRedo}
            onClick={() => redo(routine.id)}
          />
        </HStack>
      </HStack>
      {generalIssues.length > 0 && (
        <Box px={4} py={1.5} bg="red.900" flexShrink={0}>
          {generalIssues.map((issue, i) => (
            <Text key={i} fontSize="xs" color="editorDangerText">
              {issue.message}
            </Text>
          ))}
        </Box>
      )}
      <Box flex={1} minH={0}>
        <PanelGroup direction="horizontal" autoSaveId="routine-editor">
          <Panel defaultSize={22} minSize={15}>
            <RoutineDaysPanel
              routine={routine}
              issues={issues}
              selected={effectiveDay}
              onSelect={selectDay}
              onChange={update}
              preview={preview}
              onPreviewChange={setPreview}
            />
          </Panel>
          <EditorResizeHandle direction="horizontal" />
          <Panel defaultSize={34} minSize={22}>
            <RoutineDayPanel
              routine={routine}
              dayRef={effectiveDay}
              issues={issues}
              selectedGoal={goalIndex}
              onSelectGoal={setSelectedGoal}
              picking={picking}
              onPick={setPicking}
              onChange={update}
              preview={preview}
              legs={legs}
            />
          </Panel>
          <EditorResizeHandle direction="horizontal" />
          <Panel defaultSize={44} minSize={25}>
            <RoutineMapPanel
              routine={routine}
              dayRef={effectiveDay}
              selectedGoal={goalIndex}
              onSelectGoal={setSelectedGoal}
              picking={picking}
              onPicked={() => setPicking(null)}
              onCancelPick={() => setPicking(null)}
              onChange={update}
              legs={legs}
            />
          </Panel>
        </PanelGroup>
      </Box>
    </Flex>
  );
};
