import { FieldLabel } from '../../common/Typography';
import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Flex,
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
import { CONDITION_SCOPE } from '../../../lib/luaBindings';
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
  return (
    <Box w="full">
      <Text fontSize="sm" mb={2}>
        {label}
      </Text>
      <LuaScriptEditor
        value={value ?? ''}
        onChange={(v) => onChange(v.trim() ? v : undefined)}
        height="110px"
        documentId={documentId}
        scope={condition ? CONDITION_SCOPE : undefined}
        expression={condition}
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

function QuestWorkspace({ quest }: { quest: Quest }) {
  const characters = useEditorStore((s) => s.characters);
  const items = useEditorStore((s) => s.items);
  const maps = useEditorStore((s) => s.maps);
  const dialogues = useEditorStore((s) => s.dialogues);
  const update = useEditorStore((s) => s.updateQuest);
  const undo = useEditorStore((s) => s.undoQuest);
  const redo = useEditorStore((s) => s.redoQuest);
  const canUndo = useEditorStore((s) => !!s.questPast[quest.id]?.length);
  const canRedo = useEditorStore((s) => !!s.questFuture[quest.id]?.length);
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const [selected, setSelected] = useState(0);
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
  const step = quest.steps[selected];
  const patchStep = (updates: Partial<QuestStep>) =>
    patch({ steps: quest.steps.map((s, i) => (i === selected ? { ...s, ...updates } : s)) });
  const patchObjective = (index: number, objective: QuestObjective) =>
    patchStep({ objectives: step.objectives.map((o, i) => (i === index ? objective : o)) });
  const move = (delta: number) => {
    const steps = [...quest.steps];
    [steps[selected], steps[selected + delta]] = [steps[selected + delta], steps[selected]];
    patch({ steps });
    setSelected(selected + delta);
  };
  return (
    <Flex h="full" overflow="hidden" bg="editorBg">
      <VStack
        w="260px"
        flexShrink={0}
        align="stretch"
        p={4}
        spacing={3}
        overflowY="auto"
        borderRightWidth="1px"
        borderColor="editorBorder"
      >
        <Text fontWeight="bold">{quest.title}</Text>
        <Text fontSize="xs" color="editorMutedText">
          {quest.id}
        </Text>
        <HStack>
          <Button size="xs" isDisabled={!canUndo} onClick={() => undo(quest.id)}>
            Undo
          </Button>
          <Button size="xs" isDisabled={!canRedo} onClick={() => redo(quest.id)}>
            Redo
          </Button>
        </HStack>
        <Button
          size="sm"
          variant={selected === -1 ? 'solid' : 'ghost'}
          onClick={() => setSelected(-1)}
        >
          Quest settings
        </Button>
        <Text fontWeight="semibold">Steps in order</Text>
        {quest.steps.map((s, i) => (
          <Button
            key={i}
            size="sm"
            justifyContent="start"
            variant={i === selected ? 'solid' : 'ghost'}
            onClick={() => setSelected(i)}
          >
            {i + 1}. {s.id}
          </Button>
        ))}
        <Button
          size="sm"
          onClick={() => {
            patch({
              steps: [
                ...quest.steps,
                { id: unusedQuestLocalId(quest.steps, 'step'), journal: '', objectives: [] },
              ],
            });
            setSelected(quest.steps.length);
          }}
        >
          Add step
        </Button>
        <Text fontWeight="semibold" mt={3}>
          Validation
        </Text>
        {errors.length ? (
          errors.map((error, i) => (
            <Text key={i} role="alert" fontSize="xs" color="red.300">
              {error}
            </Text>
          ))
        ) : (
          <Text fontSize="sm" color="green.300">
            No quest errors.
          </Text>
        )}
      </VStack>
      <VStack flex={1} minW={0} align="stretch" overflowY="auto" p={6} spacing={5}>
        {selected === -1 && (
          <>
            <Text fontSize="lg" fontWeight="bold">
              Quest
            </Text>
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
                label={`Quest ${field}`}
                value={quest[field]}
                documentId={`${quest.id}/${field}`}
                onChange={(value) => patch({ [field]: value })}
              />
            ))}
          </>
        )}
        {step && (
          <>
            <HStack>
              <Text fontSize="lg" fontWeight="bold" flex={1}>
                Step {selected + 1}
              </Text>
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
              <Button
                size="xs"
                onClick={() => {
                  patch({ steps: quest.steps.filter((_, i) => i !== selected) });
                  setSelected(Math.max(0, selected - 1));
                }}
              >
                Delete step
              </Button>
            </HStack>
            <Text fontSize="xs" color="editorMutedText">
              Step and objective IDs are used by saves and translation keys. Keep them stable after
              publishing content.
            </Text>
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
              label="Step onComplete"
              value={step.onComplete}
              documentId={`${quest.id}/${selected}/onComplete`}
              onChange={(onComplete) => patchStep({ onComplete })}
            />
            <Text fontWeight="bold">Objectives — all must be completed</Text>
            {step.objectives.map((o, index) => (
              <VStack
                key={index}
                align="stretch"
                p={4}
                spacing={3}
                borderWidth="1px"
                borderColor="editorBorder"
                borderRadius="md"
              >
                <HStack>
                  <Text flex={1} fontWeight="semibold">
                    Objective {index + 1}
                  </Text>
                  <Button
                    size="xs"
                    onClick={() =>
                      patchStep({ objectives: step.objectives.filter((_, i) => i !== index) })
                    }
                  >
                    Delete objective
                  </Button>
                </HStack>
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
                      onChange={(e) =>
                        patchObjective(index, { ...o, count: Number(e.target.value) })
                      }
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
                      entries={(
                        maps.find((m) => m.id === o.map)?.spatialPrimitives?.triggers ?? []
                      ).map((t) => ({ id: t.id, name: t.id }))}
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
                    onChange={(condition) =>
                      patchObjective(index, { ...o, condition: condition ?? '' })
                    }
                  />
                )}
              </VStack>
            ))}
            <Button
              alignSelf="start"
              size="sm"
              onClick={() =>
                patchStep({
                  objectives: [
                    ...step.objectives,
                    {
                      id: unusedQuestLocalId(step.objectives, 'objective'),
                      text: '',
                      kind: 'talk',
                      character: '',
                    },
                  ],
                })
              }
            >
              Add objective
            </Button>
          </>
        )}
      </VStack>
    </Flex>
  );
}
