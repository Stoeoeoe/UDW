import React from 'react';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  HStack,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Switch,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { AddIcon, ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { SectionLabel } from '../../common/Typography';
import { DestructiveIconButton } from '../../common/Fields';
import { GhostIconButton } from '../../common/IconButtons';
import {
  entriesOf,
  fallbackIndex,
  previewDay,
  routineConditions,
  sameDayRef,
  type RoutineDayRef,
  type RoutineIssue,
} from '../../../lib/routines';
import { addChoice, addEntry, moveEntry, removeDay } from '../../../lib/routineEditing';
import type { Routine, RoutineEntry, RoutineList } from '../../../types/routine';

const LISTS: { list: RoutineList; title: string; help: string }[] = [
  {
    list: 'overrides',
    title: 'Special days',
    help: 'Checked first, for days that must win, such as festivals. Each needs a condition.',
  },
  {
    list: 'variants',
    title: 'Ordinary days',
    help: 'The first day whose condition holds is chosen. The last one without a condition is the fallback.',
  },
];

/** The routine's days in evaluation order, plus a preview of which day a set of conditions picks. */
export const RoutineDaysPanel: React.FC<{
  routine: Routine;
  issues: RoutineIssue[];
  selected: RoutineDayRef;
  onSelect: (ref: RoutineDayRef) => void;
  onChange: (routine: Routine) => void;
  preview: ReadonlySet<string> | null;
  onPreviewChange: (preview: ReadonlySet<string> | null) => void;
}> = ({ routine, issues, selected, onSelect, onChange, preview, onPreviewChange }) => {
  const chosen = preview ? previewDay(routine, preview) : null;
  const hasIssue = (ref: RoutineDayRef) =>
    issues.some(
      (issue) =>
        issue.day &&
        issue.day.list === ref.list &&
        issue.day.entryIndex === ref.entryIndex &&
        (ref.choiceIndex === null || issue.day.choiceIndex === ref.choiceIndex),
    );

  const add = (list: RoutineList, pool: boolean) => {
    const result = addEntry(routine, list, pool);
    onChange(result.routine);
    onSelect(result.ref);
  };
  const remove = (ref: RoutineDayRef) => {
    onChange(removeDay(routine, ref));
    onSelect({
      list: 'variants',
      entryIndex: 0,
      choiceIndex: routine.variants[0]?.pickOne ? 0 : null,
    });
  };

  return (
    <VStack align="stretch" spacing={0} h="full" minH={0} overflowY="auto">
      {LISTS.map(({ list, title, help }) => {
        const entries = entriesOf(routine, list);
        const fallback = list === 'variants' ? fallbackIndex(entries) : -1;
        return (
          <Box key={list} borderBottom="1px" borderColor="editorShellBorder" pb={2}>
            <HStack px={3} pt={3} pb={1} justify="space-between">
              <Tooltip hasArrow label={help}>
                <SectionLabel>{title}</SectionLabel>
              </Tooltip>
              {list === 'overrides' ? (
                <GhostIconButton
                  aria-label="Add special day"
                  icon={<AddIcon fontSize="8px" />}
                  size="xs"
                  onClick={() => add(list, false)}
                />
              ) : (
                <Menu isLazy>
                  <MenuButton
                    as={GhostIconButton}
                    aria-label="Add ordinary day"
                    icon={<AddIcon fontSize="8px" />}
                    size="xs"
                  />
                  <MenuList fontSize="sm">
                    <MenuItem onClick={() => add(list, false)}>Day with fixed goals</MenuItem>
                    <MenuItem onClick={() => add(list, true)}>Pick one of several days</MenuItem>
                  </MenuList>
                </Menu>
              )}
            </HStack>
            {entries.length === 0 && (
              <Text px={3} fontSize="xs" color="editorMutedText">
                None.
              </Text>
            )}
            {entries.map((entry, entryIndex) => (
              <EntryRow
                key={`${entry.id}-${entryIndex}`}
                entry={entry}
                list={list}
                entryIndex={entryIndex}
                isLast={entryIndex === entries.length - 1}
                unreachable={fallback >= 0 && entryIndex > fallback}
                isFallback={entryIndex === fallback}
                chosen={
                  chosen && chosen.list === list && chosen.entryIndex === entryIndex
                    ? (chosen.candidates ?? [])
                    : null
                }
                selected={selected}
                hasIssue={hasIssue}
                onSelect={onSelect}
                onMove={(delta) => {
                  onChange(moveEntry(routine, list, entryIndex, delta));
                  if (selected.list === list && selected.entryIndex === entryIndex)
                    onSelect({ ...selected, entryIndex: entryIndex + delta });
                }}
                onAddChoice={() => {
                  const result = addChoice(routine, list, entryIndex);
                  onChange(result.routine);
                  onSelect(result.ref);
                }}
                onRemove={remove}
              />
            ))}
          </Box>
        );
      })}
      <DayPreview routine={routine} preview={preview} onPreviewChange={onPreviewChange} />
    </VStack>
  );
};

const EntryRow: React.FC<{
  entry: RoutineEntry;
  list: RoutineList;
  entryIndex: number;
  isLast: boolean;
  unreachable: boolean;
  isFallback: boolean;
  /** Pool members the preview could choose, an empty array for a chosen fixed day, or null if not chosen. */
  chosen: number[] | null;
  selected: RoutineDayRef;
  hasIssue: (ref: RoutineDayRef) => boolean;
  onSelect: (ref: RoutineDayRef) => void;
  onMove: (delta: -1 | 1) => void;
  onAddChoice: () => void;
  onRemove: (ref: RoutineDayRef) => void;
}> = ({
  entry,
  list,
  entryIndex,
  isLast,
  unreachable,
  isFallback,
  chosen,
  selected,
  hasIssue,
  onSelect,
  onMove,
  onAddChoice,
  onRemove,
}) => {
  const ref: RoutineDayRef = { list, entryIndex, choiceIndex: entry.pickOne ? 0 : null };
  const totalWeight = entry.pickOne?.reduce((sum, choice) => sum + (choice.weight ?? 1), 0) ?? 0;
  return (
    <Box opacity={unreachable ? 0.45 : 1}>
      <DayRow
        label={entry.id}
        condition={entry.condition}
        isSelected={!entry.pickOne && sameDayRef(selected, ref)}
        isChosen={chosen !== null}
        hasIssue={!entry.pickOne && hasIssue(ref)}
        badges={
          <>
            {entry.pickOne && <Badge colorScheme="purple">pick one</Badge>}
            {isFallback && <Badge colorScheme="green">fallback</Badge>}
            {unreachable && <Badge colorScheme="red">never chosen</Badge>}
          </>
        }
        onClick={() => onSelect(ref)}
        actions={
          <>
            <GhostIconButton
              aria-label="Move up"
              icon={<ChevronUpIcon />}
              size="xs"
              isDisabled={entryIndex === 0}
              onClick={() => onMove(-1)}
            />
            <GhostIconButton
              aria-label="Move down"
              icon={<ChevronDownIcon />}
              size="xs"
              isDisabled={isLast}
              onClick={() => onMove(1)}
            />
            <DestructiveIconButton
              label={`Delete ${entry.id}`}
              onClick={() => onRemove({ list, entryIndex, choiceIndex: null })}
            />
          </>
        }
      />
      {entry.pickOne?.map((choice, choiceIndex) => {
        const memberRef: RoutineDayRef = { list, entryIndex, choiceIndex };
        const weight = choice.weight ?? 1;
        return (
          <Box key={`${choice.id}-${choiceIndex}`} pl={5}>
            <DayRow
              label={choice.id}
              condition={choice.condition}
              isSelected={sameDayRef(selected, memberRef)}
              isChosen={chosen?.includes(choiceIndex) ?? false}
              hasIssue={hasIssue(memberRef)}
              badges={
                <Tooltip hasArrow label="Chance when every member's condition holds">
                  <Badge variant="outline">{Math.round((weight / totalWeight) * 100)}%</Badge>
                </Tooltip>
              }
              onClick={() => onSelect(memberRef)}
              actions={
                <DestructiveIconButton
                  label={`Delete ${choice.id}`}
                  isDisabled={entry.pickOne!.length === 1}
                  onClick={() => onRemove(memberRef)}
                />
              }
            />
          </Box>
        );
      })}
      {entry.pickOne && (
        <Box pl={7} pb={1}>
          <Button
            size="xs"
            variant="ghost"
            leftIcon={<AddIcon fontSize="8px" />}
            onClick={onAddChoice}
          >
            Add option
          </Button>
        </Box>
      )}
    </Box>
  );
};

const DayRow: React.FC<{
  label: string;
  condition?: string;
  isSelected: boolean;
  isChosen: boolean;
  hasIssue: boolean;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  onClick: () => void;
}> = ({ label, condition, isSelected, isChosen, hasIssue, badges, actions, onClick }) => (
  <HStack
    role="button"
    tabIndex={0}
    aria-pressed={isSelected}
    px={3}
    py={1}
    spacing={2}
    cursor="pointer"
    bg={isSelected ? 'whiteAlpha.100' : undefined}
    borderLeft="3px solid"
    borderLeftColor={isChosen ? 'green.300' : isSelected ? 'cyan.400' : 'transparent'}
    _hover={{ bg: 'whiteAlpha.50' }}
    onClick={onClick}
    onKeyDown={(event) => {
      if (event.key === 'Enter') onClick();
    }}
  >
    <VStack align="start" spacing={0} flex={1} minW={0}>
      <HStack spacing={1}>
        <Text fontSize="sm" color={hasIssue ? 'editorDangerText' : 'editorText'} noOfLines={1}>
          {label}
        </Text>
        {badges}
      </HStack>
      <Text fontSize="10px" fontFamily="mono" color="editorMutedText" noOfLines={1}>
        {condition?.trim() ? `if ${condition}` : 'always'}
      </Text>
    </VStack>
    <HStack spacing={0} onClick={(event) => event.stopPropagation()}>
      {actions}
    </HStack>
  </HStack>
);

/** Toggle the routine's conditions to see which day Unity's planner would choose; nothing runs Lua. */
const DayPreview: React.FC<{
  routine: Routine;
  preview: ReadonlySet<string> | null;
  onPreviewChange: (preview: ReadonlySet<string> | null) => void;
}> = ({ routine, preview, onPreviewChange }) => {
  const conditions = routineConditions(routine);
  const chosen = preview ? previewDay(routine, preview) : null;
  const chosenEntry = chosen ? entriesOf(routine, chosen.list)[chosen.entryIndex] : null;
  return (
    <Box px={3} py={3}>
      <HStack justify="space-between">
        <Tooltip hasArrow label="Tick the conditions that hold to see which day would be chosen.">
          <SectionLabel>Which day wins?</SectionLabel>
        </Tooltip>
        <Switch
          size="sm"
          isChecked={preview !== null}
          onChange={(event) => onPreviewChange(event.target.checked ? new Set() : null)}
        />
      </HStack>
      {preview && (
        <VStack align="stretch" spacing={1} mt={2}>
          {conditions.length === 0 && (
            <Text fontSize="xs" color="editorMutedText">
              This routine has no conditions.
            </Text>
          )}
          {conditions.map((condition) => (
            <Checkbox
              key={condition}
              size="sm"
              isChecked={preview.has(condition)}
              onChange={(event) => {
                const next = new Set(preview);
                if (event.target.checked) next.add(condition);
                else next.delete(condition);
                onPreviewChange(next);
              }}
            >
              <Text fontSize="xs" fontFamily="mono" noOfLines={2}>
                {condition}
              </Text>
            </Checkbox>
          ))}
          <Text fontSize="xs" color={chosenEntry ? 'green.300' : 'editorDangerText'} pt={1}>
            {chosenEntry
              ? chosen!.candidates
                ? `${chosenEntry.id}: one of ${chosen!.candidates.map((c) => chosenEntry.pickOne![c].id).join(', ')}`
                : `${chosenEntry.id} is chosen.`
              : 'No day matches.'}
          </Text>
        </VStack>
      )}
    </Box>
  );
};
