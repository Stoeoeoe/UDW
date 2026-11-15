import { FieldLabel } from '../../common/Typography';
import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  HStack,
  Input,
  Select,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { validateQuest, unusedQuestLocalId } from '../../../lib/quests';
import { ConditionEditor } from '../scripting/ConditionEditor';
import { EditorHeaderActions, EditorValidationStatus } from '../../common/EditorDocumentFrame';
import { SequenceCard, SequenceToolbar } from '../../common/SequenceEditor';
import { InspectorShell } from '../../common/InspectorShell';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { FiPlus, FiSettings } from 'react-icons/fi';
import type { Quest, QuestObjective, QuestStep } from '../../../types/quest';
import { LuaScriptEditor } from '../scripting/LuaScriptEditor';
import { DialogueSelect } from '../routine/DialogueSelect';

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <FormControl>
      <FieldLabel>{label}</FieldLabel>
      {multiline ? (
        <Textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input
          aria-label={label}
          size="sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </FormControl>
  );
}
function Reference({
  label,
  value,
  entries,
  onChange,
  empty = 'Choose…',
}: {
  label: string;
  value: string;
  entries: readonly { id: string; name: string }[];
  onChange: (value: string) => void;
  empty?: string;
}) {
  return (
    <FormControl>
      <FieldLabel>{label}</FieldLabel>
      <Select size="sm" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{empty}</option>
        {value && !entries.some((e) => e.id === value) && (
          <option value={value}>{value} (unknown)</option>
        )}
        {entries.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} — {e.id}
          </option>
        ))}
      </Select>
    </FormControl>
  );
}
function LuaField({
  label,
  value,
  onChange,
  documentId,
  condition = false,
}: {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  documentId: string;
  condition?: boolean;
}) {
  if (condition)
    return (
      <Box>
        <ConditionEditor
          label={label}
          value={value ?? ''}
          onChange={(v) => onChange(v.trim() ? v : undefined)}
        />
      </Box>
    );
  return (
    <Box w="full">
      <FieldLabel>{label}</FieldLabel>
      <LuaScriptEditor
        value={value ?? ''}
        onChange={(v) => onChange(v.trim() ? v : undefined)}
        height="110px"
        documentId={documentId}
      />
    </Box>
  );
}

export function QuestEditor({ questId }: { questId: string }) {
  const quest = useEditorStore((s) => s.quests.find((q) => q.id === questId));
  return quest ? (
    <QuestWorkspace key={questId} quest={quest} />
  ) : (
    <Text p={6}>Quest not found.</Text>
  );
}

type Selection = 'settings' | 'issues' | { step: number; objective?: number };

function QuestWorkspace({ quest }: { quest: Quest }) {
  const characters = useEditorStore((s) => s.characters);
  const items = useEditorStore((s) => s.items);
  const maps = useEditorStore((s) => s.maps);
  const dialogues = useEditorStore((s) => s.dialogues);
  const update = useEditorStore((s) => s.updateQuest);
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const [selection, setSelection] = useState<Selection>({ step: 0 });
  const selected = typeof selection === 'object' ? selection.step : -1;
  const index = typeof selection === 'object' ? (selection.objective ?? -1) : -1;
  const step = quest.steps[selected];
  const o = step?.objectives[index];
  const errors = useMemo(
    () =>
      validateQuest(
        quest,
        {
          characterIds: new Set(characters.map((c) => c.id)),
          itemIds: new Set(items.map((i) => i.id)),
          dialogueIds: new Set(dialogues.keys()),
          maps,
        },
        manifest,
      ),
    [quest, characters, items, dialogues, maps, manifest],
  );
  const patch = (updates: Partial<Quest>) => update(quest.id, updates);
  const patchStep = (updates: Partial<QuestStep>) =>
    patch({ steps: quest.steps.map((s, i) => (i === selected ? { ...s, ...updates } : s)) });
  const patchObjective = (objectiveIndex: number, objective: QuestObjective) =>
    patchStep({
      objectives: step.objectives.map((entry, i) => (i === objectiveIndex ? objective : entry)),
    });
  const addStep = () => {
    patch({
      steps: [
        ...quest.steps,
        {
          id: unusedQuestLocalId(quest.steps, 'step'),
          journal: 'Complete the next objective.',
          objectives: [
            { id: 'objective-1', kind: 'condition', text: 'New objective', condition: 'false' },
          ],
        },
      ],
    });
    setSelection({ step: quest.steps.length });
  };
  const move = (delta: number) => {
    const steps = [...quest.steps];
    [steps[selected], steps[selected + delta]] = [steps[selected + delta], steps[selected]];
    patch({ steps });
    setSelection({ step: selected + delta });
  };
  const removeSelected = () => {
    if (o) {
      patchStep({ objectives: step.objectives.filter((_, i) => i !== index) });
      setSelection({ step: selected });
    } else {
      patch({ steps: quest.steps.filter((_, i) => i !== selected) });
      setSelection(
        quest.steps.length > 1 ? { step: Math.min(selected, quest.steps.length - 2) } : 'settings',
      );
    }
  };
  const inspector = (
    <InspectorShell
      title={
        selection === 'settings'
          ? 'Quest settings'
          : selection === 'issues'
            ? 'Validation'
            : o
              ? 'Objective'
              : 'Step'
      }
      subtitle={o?.id ?? step?.id}
      onDelete={step ? removeSelected : undefined}
      deleteLabel={o ? 'Delete objective' : 'Delete step'}
    >
      {selection === 'settings' ? (
        <>
          <Field label="Title" value={quest.title} onChange={(title) => patch({ title })} />
          <Field
            label="Description"
            value={quest.description}
            onChange={(description) => patch({ description })}
            multiline
          />
          <Reference
            label="Giver"
            value={quest.giver ?? ''}
            entries={characters}
            empty="No giver"
            onChange={(giver) => patch({ giver: giver || undefined })}
          />
          {(['onStart', 'onComplete', 'onFail'] as const).map((field) => (
            <LuaField
              key={field}
              label={
                field === 'onStart'
                  ? 'On start'
                  : field === 'onComplete'
                    ? 'On completion'
                    : 'On failure'
              }
              value={quest[field]}
              documentId={quest.id + '/' + field}
              onChange={(value) => patch({ [field]: value })}
            />
          ))}
        </>
      ) : selection === 'issues' ? (
        <>
          {errors.length ? (
            errors.map((error, i) => (
              <Text key={i} role="alert" fontSize="sm" color="editorDangerText">
                {error}
              </Text>
            ))
          ) : (
            <Text fontSize="sm" color="editorMutedText">
              No quest errors.
            </Text>
          )}
        </>
      ) : o ? (
        <>
          <Field
            label="Objective ID"
            value={o.id}
            onChange={(id) => patchObjective(index, { ...o, id })}
          />
          <Field
            label="Objective text"
            value={o.text}
            onChange={(text) => patchObjective(index, { ...o, text })}
          />
          <FormControl>
            <FieldLabel>Kind</FieldLabel>
            <Select
              aria-label="Objective kind"
              size="sm"
              value={o.kind}
              onChange={(e) => {
                const base = { id: o.id, text: o.text };
                const kind = e.target.value as QuestObjective['kind'];
                const objective: QuestObjective =
                  kind === 'talk'
                    ? { ...base, kind, character: '' }
                    : kind === 'deliver'
                      ? { ...base, kind, character: '', item: '', count: 1 }
                      : kind === 'have'
                        ? { ...base, kind, item: '', count: 1 }
                        : kind === 'reach'
                          ? { ...base, kind, map: '' }
                          : { ...base, kind, condition: '' };
                patchObjective(index, objective);
              }}
            >
              {['talk', 'deliver', 'have', 'reach', 'condition'].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </Select>
          </FormControl>
          {'character' in o && (
            <Reference
              label="Character"
              value={o.character}
              entries={characters}
              onChange={(character) => patchObjective(index, { ...o, character })}
            />
          )}
          {'item' in o && (
            <Reference
              label="Item"
              value={o.item}
              entries={items}
              onChange={(item) => patchObjective(index, { ...o, item })}
            />
          )}
          {'count' in o && (
            <FormControl>
              <FieldLabel>Count</FieldLabel>
              <Input
                aria-label="Count"
                size="sm"
                type="number"
                min={1}
                value={o.count}
                onChange={(e) => patchObjective(index, { ...o, count: Number(e.target.value) })}
              />
            </FormControl>
          )}
          {(o.kind === 'talk' || o.kind === 'deliver') && (
            <Box>
              <Text fontSize="sm" mb={2}>
                Quest dialogue
              </Text>
              <DialogueSelect
                label="Quest dialogue"
                value={o.dialogue}
                inherited={null}
                emptyLabel="Character's usual dialogue"
                newName={`${quest.title} — ${step.id} — ${o.id}`}
                newFolder={quest.folderPath || quest.title}
                onChange={(dialogue) => patchObjective(index, { ...o, dialogue })}
              />
            </Box>
          )}
          {o.kind === 'reach' && (
            <>
              <Reference
                label="Map"
                value={o.map}
                entries={maps}
                onChange={(map) => patchObjective(index, { ...o, map, trigger: undefined })}
              />
              <Reference
                label="Trigger"
                value={o.trigger ?? ''}
                entries={(maps.find((m) => m.id === o.map)?.spatialPrimitives?.triggers ?? []).map(
                  (t) => ({ id: t.id, name: t.id }),
                )}
                empty="Anywhere on the map"
                onChange={(trigger) =>
                  patchObjective(index, { ...o, trigger: trigger || undefined })
                }
              />
            </>
          )}
          {o.kind === 'condition' && (
            <LuaField
              label="Objective condition"
              value={o.condition}
              condition
              documentId={`${quest.id}/${selected}/${index}/condition`}
              onChange={(condition) => patchObjective(index, { ...o, condition: condition ?? '' })}
            />
          )}
        </>
      ) : step ? (
        <>
          <HStack>
            <Button size="xs" isDisabled={selected === 0} onClick={() => move(-1)}>
              Move up
            </Button>
            <Button
              size="xs"
              isDisabled={selected === quest.steps.length - 1}
              onClick={() => move(1)}
            >
              Move down
            </Button>
          </HStack>
          <Field label="Step ID" value={step.id} onChange={(id) => patchStep({ id })} />
          <Field
            label="Journal"
            value={step.journal}
            onChange={(journal) => patchStep({ journal })}
            multiline
          />
          <Checkbox
            isChecked={!!step.deadline}
            onChange={(e) => patchStep({ deadline: e.target.checked ? { days: 0 } : undefined })}
          >
            Deadline
          </Checkbox>
          {step.deadline && (
            <HStack>
              <FormControl>
                <FieldLabel>Days after step begins</FieldLabel>
                <Input
                  aria-label="Deadline days"
                  size="sm"
                  type="number"
                  min={0}
                  value={step.deadline.days}
                  onChange={(e) =>
                    patchStep({ deadline: { ...step.deadline!, days: Number(e.target.value) } })
                  }
                />
              </FormControl>
              <Field
                label="Deadline time (HH:MM, empty = end of day)"
                value={step.deadline.at ?? ''}
                onChange={(at) =>
                  patchStep({ deadline: { ...step.deadline!, at: at || undefined } })
                }
              />
            </HStack>
          )}
          <LuaField
            label="Fail condition"
            value={step.failWhen}
            condition
            documentId={`${quest.id}/${selected}/failWhen`}
            onChange={(failWhen) => patchStep({ failWhen })}
          />
          <LuaField
            label="On completion"
            value={step.onComplete}
            documentId={`${quest.id}/${selected}/onComplete`}
            onChange={(onComplete) => patchStep({ onComplete })}
          />

          <Button
            size="sm"
            variant="outline"
            leftIcon={<FiPlus />}
            onClick={() => {
              patchStep({
                objectives: [
                  ...step.objectives,
                  {
                    id: unusedQuestLocalId(step.objectives, 'objective'),
                    kind: 'condition',
                    text: 'New objective',
                    condition: 'false',
                  },
                ],
              });
              setSelection({ step: selected, objective: step.objectives.length });
            }}
          >
            Add objective
          </Button>
        </>
      ) : (
        <Text fontSize="sm" color="editorMutedText">
          Select a step or objective to edit its properties.
        </Text>
      )}
    </InspectorShell>
  );

  return (
    <>
      <EditorHeaderActions>
        <EditorValidationStatus errors={errors} onClick={() => setSelection('issues')} />
        <Button
          size="sm"
          variant="outline"
          leftIcon={<FiSettings />}
          onClick={() => setSelection('settings')}
        >
          Settings
        </Button>
      </EditorHeaderActions>
      <ResizableEditorLayout
        viewportBackground={false}
        rightPanel={inspector}
        rightPanelDefaultSize={32}
        rightPanelMinSize={22}
        content={
          <VStack h="full" align="stretch" spacing={0} bg="editorWorkspaceBg">
            <SequenceToolbar>
              <Text fontSize="sm" color="editorMutedText" flex={1}>
                {quest.steps.length} steps · complete all objectives in each step
              </Text>
              <Button size="xs" variant="outline" leftIcon={<FiPlus />} onClick={addStep}>
                Add step
              </Button>
            </SequenceToolbar>
            <Box flex={1} minH={0} overflowY="auto" p={4}>
              {quest.steps.map((entry, stepIndex) => (
                <SequenceCard
                  key={stepIndex}
                  selected={selected === stepIndex}
                  label={'Step ' + (stepIndex + 1)}
                  onClick={() => setSelection({ step: stepIndex })}
                >
                  <HStack mb={2}>
                    <Text fontSize="xs" color="editorMutedText">
                      STEP {stepIndex + 1}
                    </Text>
                    <Text fontSize="xs" fontFamily="mono" color="editorMutedText">
                      {entry.id}
                    </Text>
                    {entry.deadline && (
                      <Text ml="auto" fontSize="xs" color="editorMutedText">
                        Due day +{entry.deadline.days}
                        {entry.deadline.at ? ' at ' + entry.deadline.at : ', end of day'}
                      </Text>
                    )}
                  </HStack>
                  <Text fontSize="sm" mb={3}>
                    {entry.journal}
                  </Text>
                  <VStack align="stretch" spacing={1}>
                    {entry.objectives.map((objective, objectiveIndex) => (
                      <Button
                        key={objectiveIndex}
                        aria-label={'Select objective ' + objective.id}
                        size="sm"
                        variant="ghost"
                        fontWeight="normal"
                        justifyContent="start"
                        isActive={selected === stepIndex && index === objectiveIndex}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelection({ step: stepIndex, objective: objectiveIndex });
                        }}
                      >
                        <Text fontSize="xs" color="editorMutedText" mr={2}>
                          {objective.kind}
                        </Text>
                        <Text noOfLines={1}>{objective.text}</Text>
                      </Button>
                    ))}
                    {!entry.objectives.length && (
                      <Text fontSize="xs" color="editorDangerText">
                        Add an objective to this step.
                      </Text>
                    )}
                  </VStack>
                </SequenceCard>
              ))}
              {!quest.steps.length && (
                <Text color="editorMutedText" fontSize="sm">
                  Add the first step to start authoring this quest.
                </Text>
              )}
            </Box>
          </VStack>
        }
      />
    </>
  );
}
