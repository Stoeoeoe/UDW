import { SequenceCard } from '../../common/SequenceEditor';
import React from 'react';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  HStack,
  Select,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import {
  CompactInput,
  CompactNumberInput,
  DestructiveIconButton,
  Field,
} from '../../common/Fields';
import { SectionLabel } from '../../common/Typography';
import { ManifestResourceSelect } from '../../common/ManifestResourceSelect';
import { ConditionEditor } from '../scripting/ConditionEditor';
import {
  dayAt,
  goalDialogues,
  routineLabel,
  goalRuns,
  type GoalDialogues,
  minutesOf,
  timeOf,
  TIME_PATTERN,
  type RoutineDayRef,
  type RoutineIssue,
} from '../../../lib/routines';
import { LOCAL_ID_PATTERN } from '../../../lib/resourceIds';
import {
  newGoal,
  setDayGoals,
  updateChoice,
  updateEntry,
  withCondition,
  without,
} from '../../../lib/routineEditing';
import type { Routine, RoutineGoal } from '../../../types/routine';
import { PlaceField } from './PlaceField';
import { useEditorStore } from '../../../store/useEditorStore';
import { DialogueSelect } from './DialogueSelect';
import { describeDoors } from './useRoutineLegs';
import type { RoutineLeg } from './useRoutineLegs';
import { formatWalk } from '../../../lib/routineTiming';
import type { PlaceTarget } from './RoutineEditor';

/** The selected day: its ID and condition, a timeline of the day and its goals in departure order. */
export const RoutineDayPanel: React.FC<{
  routine: Routine;
  dayRef: RoutineDayRef;
  issues: RoutineIssue[];
  selectedGoal: number | null;
  onSelectGoal: (index: number | null) => void;
  picking: PlaceTarget | null;
  onPick: (target: PlaceTarget | null) => void;
  onChange: (routine: Routine) => void;
  preview: ReadonlySet<string> | null;
  legs: RoutineLeg[];
}> = ({
  routine,
  dayRef,
  issues,
  selectedGoal,
  onSelectGoal,
  picking,
  onPick,
  onChange,
  preview,
  legs,
}) => {
  const speaker = useEditorStore((state) => routineLabel(routine, state.characters));
  const day = dayAt(routine, dayRef);
  if (!day) return null;
  const { entry, choice, goals } = day;
  const dayIssues = issues.filter(
    (issue) =>
      issue.day &&
      issue.day.list === dayRef.list &&
      issue.day.entryIndex === dayRef.entryIndex &&
      (issue.day.choiceIndex === null || issue.day.choiceIndex === dayRef.choiceIndex),
  );
  const dialogues = goalDialogues(routine, goals, preview);
  const setGoals = (next: RoutineGoal[]) => onChange(setDayGoals(routine, dayRef, next));
  const setGoal = (index: number, goal: RoutineGoal) =>
    setGoals(goals.map((existing, i) => (i === index ? goal : existing)));

  return (
    <VStack align="stretch" spacing={4} h="full" minH={0} overflowY="auto" p={4}>
      <VStack align="stretch" spacing={3}>
        <HStack spacing={3} align="end">
          <Field label={choice ? 'Pool ID' : 'Day ID'} flex={1}>
            <CompactInput
              value={entry.id}
              onChange={(event) =>
                onChange(
                  updateEntry(routine, dayRef.list, dayRef.entryIndex, (e) => ({
                    ...e,
                    id: event.target.value,
                  })),
                )
              }
            />
          </Field>
          <Badge mb={1}>{dayRef.list === 'overrides' ? 'Special day' : 'Ordinary day'}</Badge>
        </HStack>
        <ConditionEditor
          label={choice ? 'Pool applies if' : 'Day applies if (empty = always)'}
          value={entry.condition ?? ''}
          onChange={(condition) =>
            onChange(
              updateEntry(routine, dayRef.list, dayRef.entryIndex, (e) =>
                withCondition(e, condition),
              ),
            )
          }
        />
        {choice && (
          <Box pl={3} borderLeft="2px solid" borderColor="purple.300">
            <HStack spacing={3} align="end">
              <Field label="Option ID" flex={1}>
                <CompactInput
                  value={choice.id}
                  onChange={(event) =>
                    onChange(
                      updateChoice(routine, dayRef, (c) => ({ ...c, id: event.target.value })),
                    )
                  }
                />
              </Field>
              <Field label="Weight" w="110px">
                <CompactNumberInput
                  min={0.01}
                  step={0.5}
                  value={choice.weight ?? 1}
                  onChange={(_, weight) =>
                    onChange(
                      updateChoice(routine, dayRef, (c) =>
                        Number.isNaN(weight) || weight === 1
                          ? without(c, 'weight')
                          : { ...c, weight },
                      ),
                    )
                  }
                />
              </Field>
            </HStack>
            <Box mt={3}>
              <ConditionEditor
                label="Option is possible if (empty = always)"
                value={choice.condition ?? ''}
                onChange={(condition) =>
                  onChange(updateChoice(routine, dayRef, (c) => withCondition(c, condition)))
                }
              />
            </Box>
          </Box>
        )}
        {dayIssues
          .filter((issue) => issue.goalIndex === undefined)
          .map((issue, i) => (
            <Text key={i} fontSize="xs" color="editorDangerText">
              {issue.message}
            </Text>
          ))}
      </VStack>

      <DayTimeline
        routine={routine}
        goals={goals}
        selectedGoal={selectedGoal}
        onSelectGoal={onSelectGoal}
        preview={preview}
        legs={legs}
      />

      <VStack align="stretch" spacing={2}>
        <SectionLabel>Goals</SectionLabel>
        {goals.length === 0 && (
          <Text fontSize="xs" color="editorMutedText">
            No goals: {routineHomeLabel(routine)} all day.
          </Text>
        )}
        {goals.map((goal, index) => (
          <GoalCard
            key={index}
            index={index}
            goal={goal}
            isSelected={selectedGoal === index}
            skipped={preview !== null && !goalRuns(goal, preview)}
            leg={legs.find((leg) => leg.goalIndex === index)}
            dialogues={dialogues[index]}
            issues={dayIssues.filter((issue) => issue.goalIndex === index)}
            picking={picking?.kind === 'goal' && picking.goalIndex === index}
            onSelect={() => onSelectGoal(index)}
            onPick={() =>
              onPick(
                picking?.kind === 'goal' && picking.goalIndex === index
                  ? null
                  : { kind: 'goal', goalIndex: index },
              )
            }
            onChange={(next) => setGoal(index, next)}
            onRemove={() => {
              setGoals(goals.filter((_, i) => i !== index));
              onSelectGoal(null);
            }}
            home={routine.home}
            speaker={speaker}
          />
        ))}
        <Box>
          <Button
            size="xs"
            variant="outline"
            leftIcon={<AddIcon fontSize="8px" />}
            onClick={() => {
              setGoals([...goals, newGoal(goals)]);
              onSelectGoal(goals.length);
            }}
          >
            Add goal
          </Button>
        </Box>
      </VStack>
    </VStack>
  );
};

const routineHomeLabel = (routine: Routine) => `stays home at ${routine.home.anchor || 'home'}`;

const destinationLabel = (goal: RoutineGoal) =>
  goal.destination === 'home' ? 'home' : goal.destination.anchor || '?';

/** The day as a strip: home until the first departure, then each goal until the next one. */
const DayTimeline: React.FC<{
  routine: Routine;
  goals: RoutineGoal[];
  selectedGoal: number | null;
  onSelectGoal: (index: number) => void;
  preview: ReadonlySet<string> | null;
  legs: RoutineLeg[];
}> = ({ goals, selectedGoal, onSelectGoal, preview, legs }) => {
  const DAY = 24 * 60;
  const timed = goals
    .map((goal, index) => ({ goal, index }))
    .filter(
      ({ goal }) =>
        TIME_PATTERN.test(goal.departAt) && (preview === null || goalRuns(goal, preview)),
    );
  const percent = (minutes: number) => `${(minutes / DAY) * 100}%`;
  return (
    <Box>
      <Box position="relative" h="26px" bg="whiteAlpha.50" borderRadius="sm" overflow="hidden">
        {timed.map(({ goal, index }, i) => {
          const start = minutesOf(goal.departAt);
          const end = i + 1 < timed.length ? minutesOf(timed[i + 1].goal.departAt) : DAY;
          if (end <= start) return null;
          const atHome = goal.destination === 'home';
          const leg = legs.find((entry) => entry.goalIndex === index);
          // Walking takes the start of the segment; the rest is time spent at the destination.
          const walking = leg?.arriveMinute != null ? Math.min(leg.arriveMinute, end) - start : 0;
          const label =
            `${goal.departAt} → ${destinationLabel(goal)}` +
            (leg?.minutes != null ? `, walking ${formatWalk(leg.minutes)}` : '');
          return (
            <Tooltip key={index} hasArrow label={label}>
              <Box
                position="absolute"
                top={0}
                bottom={0}
                left={percent(start)}
                width={percent(end - start)}
                bg={atHome ? 'whiteAlpha.100' : selectedGoal === index ? 'cyan.600' : 'cyan.800'}
                borderLeft="2px solid"
                borderColor={leg?.problem ? 'orange.300' : 'cyan.300'}
                cursor="pointer"
                onClick={() => onSelectGoal(index)}
                overflow="hidden"
                px={1}
              >
                {walking > 0 && (
                  <Box
                    position="absolute"
                    top={0}
                    bottom={0}
                    left={0}
                    width={`${(walking / (end - start)) * 100}%`}
                    bgImage="repeating-linear-gradient(135deg, rgba(255,255,255,0.18) 0 3px, transparent 3px 7px)"
                  />
                )}
                <Text
                  position="relative"
                  fontSize="10px"
                  color="editorText"
                  noOfLines={1}
                  lineHeight="26px"
                >
                  {destinationLabel(goal)}
                </Text>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      <HStack justify="space-between" mt={0.5}>
        {['00:00', '06:00', '12:00', '18:00', '24:00'].map((label) => (
          <Text key={label} fontSize="9px" color="editorMutedText">
            {label}
          </Text>
        ))}
      </HStack>
    </Box>
  );
};

/** When the NPC gets there, and why that does not work if it does not. */
const WalkSummary: React.FC<{ leg: RoutineLeg }> = ({ leg }) => {
  if (leg.problem)
    return (
      <Text fontSize="xs" color="orange.300">
        {leg.problem}
      </Text>
    );
  const doors = describeDoors(leg);
  if (leg.minutes === null || leg.arriveMinute === null)
    return doors ? (
      <Text fontSize="xs" color="editorMutedText">
        Walks {doors}.
      </Text>
    ) : null;
  return (
    <Text fontSize="xs" color="editorMutedText">
      Arrives about {timeOf(Math.ceil(leg.arriveMinute) % (24 * 60))} after{' '}
      {formatWalk(leg.minutes)} on foot{doors ? ` ${doors}` : ''}.
    </Text>
  );
};

const GoalCard: React.FC<{
  index: number;
  goal: RoutineGoal;
  home: Routine['home'];
  /** The character's name, for naming and filing dialogues created here. */
  speaker: string;
  isSelected: boolean;
  skipped: boolean;
  /** The walk to this goal, unless the goal is skipped. */
  leg?: RoutineLeg;
  /** What the character says during this goal, unless the goal is skipped. */
  dialogues: GoalDialogues | null;
  issues: RoutineIssue[];
  picking: boolean;
  onSelect: () => void;
  onPick: () => void;
  onChange: (goal: RoutineGoal) => void;
  onRemove: () => void;
}> = ({
  index,
  goal,
  home,
  speaker,
  isSelected,
  skipped,
  leg,
  dialogues,
  issues,
  picking,
  onSelect,
  onPick,
  onChange,
  onRemove,
}) => {
  const conditional = goal.condition !== undefined;
  return (
    <SequenceCard selected={isSelected} muted={skipped} onClick={onSelect}>
      <VStack align="stretch" spacing={2}>
        <HStack spacing={2}>
          <Badge colorScheme="cyan" minW="20px" textAlign="center">
            {index + 1}
          </Badge>
          <CompactInput
            type="time"
            w="96px"
            aria-label="Departs at"
            value={goal.departAt}
            isInvalid={!TIME_PATTERN.test(goal.departAt)}
            onChange={(event) => onChange({ ...goal, departAt: event.target.value })}
          />
          <Text fontSize="xs" color="editorMutedText">
            go to
          </Text>
          <Select
            size="xs"
            variant="compact"
            w="96px"
            aria-label="Destination"
            value={goal.destination === 'home' ? 'home' : 'place'}
            onChange={(event) =>
              onChange({
                ...goal,
                destination: event.target.value === 'home' ? 'home' : { map: home.map, anchor: '' },
              })
            }
          >
            <option value="home">home</option>
            <option value="place">a place</option>
          </Select>
          {skipped && <Badge>skipped</Badge>}
          <Box flex={1} />
          <DestructiveIconButton label="Delete goal" onClick={onRemove} />
        </HStack>
        {goal.destination !== 'home' && (
          <PlaceField
            value={goal.destination}
            onChange={(destination) => onChange({ ...goal, destination })}
            picking={picking}
            onPick={onPick}
          />
        )}
        <HStack spacing={2}>
          <Text fontSize="xs" color="editorMutedText" flexShrink={0}>
            then
          </Text>
          <ManifestResourceSelect
            resourceType="animation"
            placeholder="just stand there"
            value={goal.activity?.animation}
            onChange={(animation) =>
              onChange(animation ? { ...goal, activity: { animation } } : without(goal, 'activity'))
            }
          />
        </HStack>
        <HStack spacing={2}>
          <Text fontSize="xs" color="editorMutedText" flexShrink={0}>
            busy with
          </Text>
          <CompactInput
            aria-label="Occupation"
            placeholder="nothing in particular"
            value={goal.occupation ?? ''}
            isInvalid={goal.occupation !== undefined && !LOCAL_ID_PATTERN.test(goal.occupation)}
            onChange={(event) =>
              onChange(
                event.target.value
                  ? { ...goal, occupation: event.target.value }
                  : without(goal, 'occupation'),
              )
            }
          />
        </HStack>
        <HStack spacing={2}>
          <Text fontSize="xs" color="editorMutedText" w="72px" flexShrink={0}>
            says on the way
          </Text>
          <DialogueSelect
            label="Dialogue while walking there"
            newName={`${speaker} – on the way to ${goal.id}`}
            newFolder={speaker}
            value={goal.walkingDialogue ?? undefined}
            inherited={dialogues?.walking.inherited ? dialogues.walking.id : null}
            inheritedSilent={dialogues?.walking.inherited && dialogues.walking.silent}
            emptyLabel="character's usual dialogue"
            silent={goal.walkingDialogue === null}
            onSilent={() => onChange({ ...goal, walkingDialogue: null })}
            onChange={(dialogue) =>
              onChange(
                dialogue
                  ? { ...goal, walkingDialogue: dialogue }
                  : without(goal, 'walkingDialogue'),
              )
            }
          />
        </HStack>
        <HStack spacing={2}>
          <Text fontSize="xs" color="editorMutedText" w="72px" flexShrink={0}>
            says there
          </Text>
          <DialogueSelect
            label="Dialogue once there"
            newName={`${speaker} – ${goal.id}`}
            newFolder={speaker}
            value={goal.dialogue ?? undefined}
            inherited={dialogues?.there.inherited ? dialogues.there.id : null}
            inheritedSilent={dialogues?.there.inherited && dialogues.there.silent}
            emptyLabel="character's usual dialogue"
            silent={goal.dialogue === null}
            onSilent={() => onChange({ ...goal, dialogue: null })}
            onChange={(dialogue) =>
              onChange(dialogue ? { ...goal, dialogue } : without(goal, 'dialogue'))
            }
          />
        </HStack>
        <HStack spacing={3}>
          <Checkbox
            size="sm"
            isChecked={conditional}
            onChange={(event) =>
              onChange(
                event.target.checked ? { ...goal, condition: '' } : without(goal, 'condition'),
              )
            }
          >
            <Text fontSize="xs">Only on some days</Text>
          </Checkbox>
          <Box flex={1} />
          <Tooltip hasArrow label="Goal ID, unique within this day">
            <CompactInput
              w="120px"
              aria-label="Goal ID"
              value={goal.id}
              onChange={(event) => onChange({ ...goal, id: event.target.value })}
            />
          </Tooltip>
        </HStack>
        {conditional && (
          <ConditionEditor
            label="Goal happens if"
            value={goal.condition ?? ''}
            onChange={(condition) => onChange({ ...goal, condition })}
          />
        )}
        {leg && <WalkSummary leg={leg} />}
        {issues.map((issue, i) => (
          <Text key={i} fontSize="xs" color="editorDangerText">
            {issue.message}
          </Text>
        ))}
      </VStack>
    </SequenceCard>
  );
};
