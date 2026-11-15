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
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { questStartWarnings, validateQuest } from '../../../lib/quests';
import { describeStartMoment, questStartedBy } from '../../../lib/questStarters';
import { ConditionEditor } from '../scripting/ConditionEditor';
import { EditorHeaderActions, EditorValidationStatus } from '../../common/EditorDocumentFrame';
import { QuestGraphCanvas } from './QuestGraphCanvas';
import {
  graphFromQuest,
  editQuestGraph,
  removeQuestNode,
  questActionResources,
  questStepLabels,
} from '../../../lib/questGraph';
import type { QuestGraphNode } from '../../../types/questGraph';
import { InspectorShell } from '../../common/InspectorShell';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { FiSettings } from 'react-icons/fi';
import type {
  Quest,
  QuestObjective,
  QuestSeason,
  QuestStart,
  QuestStartMoment,
  QuestStep,
} from '../../../types/quest';
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

const START_MOMENTS: { on: QuestStartMoment['on']; label: string }[] = [
  { on: 'gameStart', label: 'Game start' },
  { on: 'newDay', label: 'New day' },
  { on: 'newSeason', label: 'New season' },
  { on: 'everyTenMinutes', label: 'Every 10 minutes' },
  { on: 'divineFavour', label: 'Divine favour changes' },
  { on: 'locationChanged', label: 'Location changed' },
];
const SEASONS: QuestSeason[] = ['spring', 'summer', 'autumn', 'winter'];

/** When the quest starts by itself, and what else starts it. */
function StartSection({
  quest,
  onChange,
  maps,
  deities,
  documentId,
}: {
  quest: Quest;
  onChange: (start: QuestStart | undefined) => void;
  maps: readonly { id: string; name: string }[];
  deities: readonly { id: string; name: string }[];
  documentId: string;
}) {
  const quests = useEditorStore((s) => s.quests);
  const dialogues = useEditorStore((s) => s.dialogues);
  const cutscenes = useEditorStore((s) => s.cutscenes);
  const startedBy = useMemo(
    () => questStartedBy(quest.id, { quests, dialogues, cutscenes }),
    [quest.id, quests, dialogues, cutscenes],
  );
  const names = useMemo(
    () => Object.fromEntries([...maps, ...deities].map((r) => [r.id, r.name])),
    [maps, deities],
  );
  const start = quest.start;
  const setMoment = (i: number, moment: QuestStartMoment) =>
    onChange({ ...start!, when: start!.when.map((m, j) => (j === i ? moment : m)) });
  return (
    <>
      <Checkbox
        isChecked={!!start}
        onChange={(e) => onChange(e.target.checked ? { when: [{ on: 'newDay' }] } : undefined)}
      >
        Starts by itself
      </Checkbox>
      {start && (
        <>
          {start.when.map((moment, i) => (
            <Box key={i} borderWidth="1px" borderRadius="md" p={2}>
              <HStack align="end">
                <FormControl>
                  <FieldLabel>Moment {i + 1}</FieldLabel>
                  <Select
                    size="sm"
                    aria-label={`Moment ${i + 1}`}
                    value={moment.on}
                    onChange={(e) => setMoment(i, { on: e.target.value } as QuestStartMoment)}
                  >
                    {START_MOMENTS.map((m) => (
                      <option key={m.on} value={m.on}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Remove moment ${i + 1}`}
                  onClick={() =>
                    onChange(
                      start.when.length > 1
                        ? { ...start, when: start.when.filter((_, j) => j !== i) }
                        : undefined,
                    )
                  }
                >
                  Remove
                </Button>
              </HStack>
              {moment.on === 'newSeason' && (
                <FormControl mt={2}>
                  <FieldLabel>Season</FieldLabel>
                  <Select
                    size="sm"
                    aria-label="Season"
                    value={moment.season ?? ''}
                    onChange={(e) =>
                      setMoment(i, {
                        on: 'newSeason',
                        season: (e.target.value || undefined) as QuestSeason | undefined,
                      })
                    }
                  >
                    <option value="">Any season</option>
                    {SEASONS.map((season) => (
                      <option key={season} value={season}>
                        {season}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              )}
              {moment.on === 'divineFavour' && (
                <>
                  <Reference
                    label="Deity"
                    value={moment.deity ?? ''}
                    entries={deities}
                    empty="Any deity"
                    onChange={(deity) => setMoment(i, { ...moment, deity: deity || undefined })}
                  />
                  <FormControl mt={2}>
                    <FieldLabel>Favour at least (empty = any)</FieldLabel>
                    <Input
                      aria-label="Favour at least"
                      size="sm"
                      type="number"
                      value={moment.atLeast ?? ''}
                      onChange={(e) =>
                        setMoment(i, {
                          ...moment,
                          atLeast: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                </>
              )}
              {moment.on === 'locationChanged' && (
                <Reference
                  label="Map"
                  value={moment.map ?? ''}
                  entries={maps}
                  empty="Any map"
                  onChange={(map) => setMoment(i, { on: 'locationChanged', map: map || undefined })}
                />
              )}
            </Box>
          ))}
          {questStartWarnings(quest).map((warning) => (
            <Text key={warning} role="status" fontSize="sm" color="orange.400">
              {warning}
            </Text>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange({ ...start, when: [...start.when, { on: 'newDay' }] })}
          >
            Add moment
          </Button>
          <LuaField
            label="Start condition (optional)"
            value={start.condition}
            condition
            documentId={`${documentId}/start`}
            onChange={(condition) => onChange({ ...start, condition })}
          />
        </>
      )}
      <Box>
        <FieldLabel>Started by</FieldLabel>
        {!start && !startedBy.length && (
          <Text fontSize="sm" color="editorMutedText">
            Nothing starts this quest yet. Add a Quests.Start call to a dialogue or cutscene, or let
            it start by itself.
          </Text>
        )}
        {start?.when.map((moment, i) => (
          <Text key={`moment-${i}`} fontSize="sm">
            {describeStartMoment(moment, names)}
            {start.condition ? ' and the start condition holds' : ''}
          </Text>
        ))}
        {startedBy.map((starter) => (
          <Text key={`${starter.kind}-${starter.id}-${starter.nodeId ?? ''}`} fontSize="sm">
            {starter.kind === 'dialogue'
              ? `Dialogue ${starter.name}, node ${starter.nodeId}`
              : starter.kind === 'cutscene'
                ? `Cutscene ${starter.name}`
                : `Quest ${starter.name}`}
          </Text>
        ))}
      </Box>
    </>
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

type Selection = 'settings' | 'issues' | { step: number; objective?: number } | { nodeId: string };

function QuestWorkspace({ quest }: { quest: Quest }) {
  const characters = useEditorStore((s) => s.characters);
  const items = useEditorStore((s) => s.items);
  const maps = useEditorStore((s) => s.maps);
  const dialogues = useEditorStore((s) => s.dialogues);
  const update = useEditorStore((s) => s.updateQuest);
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const resources = useMemo(
    () => questActionResources(manifest, { characters, items }),
    [manifest, characters, items],
  );
  const deities = useMemo(
    () => (resources.deity ?? []).map((d) => ({ id: d.id, name: d.description ?? d.id })),
    [resources],
  );
  const [selection, setSelection] = useState<Selection>({ step: 0 });
  const graph = useMemo(() => graphFromQuest(quest), [quest]);
  const selectionNode =
    typeof selection === 'object' && 'nodeId' in selection
      ? graph.nodes.find((n) => n.id === selection.nodeId)
      : undefined;
  const selected =
    selectionNode?.kind === 'step'
      ? quest.steps.findIndex((s) => s.id === selectionNode.stepId)
      : typeof selection === 'object' && 'step' in selection
        ? selection.step
        : -1;
  const step = quest.steps[selected];
  const index =
    selectionNode?.kind === 'step' && step?.objectives.length === 1
      ? 0
      : typeof selection === 'object' && 'step' in selection
        ? (selection.objective ?? -1)
        : -1;
  const o = step?.objectives[index];
  const grouped =
    graph.nodes.find((n) => n.kind === 'step' && n.stepId === step?.id)?.group === true ||
    (step?.objectives.length ?? 0) > 1;
  const node = selectionNode?.kind !== 'step' ? selectionNode : undefined;
  const selectNode = (node: QuestGraphNode) => setSelection({ nodeId: node.id });
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
        resources,
      ),
    [quest, characters, items, dialogues, maps, manifest, resources],
  );
  const patch = (updates: Partial<Quest>) => {
    const merged = { ...quest, ...updates };
    update(quest.id, editQuestGraph(merged, updates.editorGraph ?? graph, manifest, resources));
  };
  const patchStep = (updates: Partial<QuestStep>) => {
    const next =
      updates.id === undefined
        ? graph
        : {
            ...graph,
            nodes: graph.nodes.map((n) =>
              n.kind === 'step' && n.stepId === step.id ? { ...n, stepId: updates.id } : n,
            ),
          };
    patch({
      steps: quest.steps.map((s, i) => (i === selected ? { ...s, ...updates } : s)),
      editorGraph: next,
    });
  };
  const patchObjective = (objectiveIndex: number, objective: QuestObjective) =>
    patchStep({
      objectives: step.objectives.map((entry, i) => (i === objectiveIndex ? objective : entry)),
    });
  const removeSelected = () => {
    if (o && grouped) {
      patchStep({ objectives: step.objectives.filter((_, i) => i !== index) });
      setSelection({ step: selected });
    } else {
      const removing = node ?? graph.nodes.find((n) => n.stepId === step?.id);
      if (!removing) return;
      patch({
        editorGraph: removeQuestNode(graph, removing.id),
        steps:
          removing.kind === 'step'
            ? quest.steps.filter((s) => s.id !== removing.stepId)
            : quest.steps,
      });
      setSelection('settings');
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
              ? questStepLabels[o.kind]
              : node
                ? node.kind === 'lua'
                  ? 'Execute Lua Script'
                  : node.kind === 'action'
                    ? 'Action'
                    : node.kind === 'exit'
                      ? 'Complete quest'
                      : node.kind === 'failure'
                        ? 'On failure'
                        : 'Begin'
                : 'Step'
      }
      subtitle={o?.id ?? step?.id ?? node?.action?.method}
      onDelete={
        step || (node && !['entry', 'exit'].includes(node.kind)) ? removeSelected : undefined
      }
      deleteLabel={o && grouped ? 'Delete objective' : step ? 'Delete step' : 'Delete node'}
    >
      {step && (
        <>
          <Field label="Step ID" value={step.id} onChange={(id) => patchStep({ id })} />
          <Field
            label="Journal"
            value={step.journal}
            onChange={(journal) => patchStep({ journal })}
            multiline
          />
        </>
      )}
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
          <StartSection
            quest={quest}
            onChange={(start) => patch({ start })}
            maps={maps}
            deities={deities}
            documentId={quest.id}
          />
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
      ) : node ? (
        node.kind === 'lua' ? (
          <LuaField
            label="Script"
            value={node.code}
            documentId={quest.id + '/' + node.id}
            onChange={(code) =>
              patch({
                editorGraph: {
                  ...graph,
                  nodes: graph.nodes.map((n) =>
                    n.id === node.id ? { ...n, code: code ?? '' } : n,
                  ),
                },
              })
            }
          />
        ) : (
          <>
            <Text fontSize="sm" color="editorMutedText">
              {node.kind === 'action'
                ? 'Edit the action parameters directly on the node. Its result is currently discarded, as in a Lua statement.'
                : node.kind === 'exit'
                  ? 'The quest becomes completed when the previous step finishes. Connect quest completion actions to this output.'
                  : node.kind === 'failure'
                    ? 'Actions connected here run when a step deadline or fail condition fails the quest.'
                    : 'Actions before the first quest step run when the quest starts.'}
            </Text>
            {node.kind === 'entry' && (
              <StartSection
                quest={quest}
                onChange={(start) => patch({ start })}
                maps={maps}
                deities={deities}
                documentId={quest.id}
              />
            )}
          </>
        )
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
              label="Complete when"
              value={o.condition}
              condition
              documentId={`${quest.id}/${selected}/${index}/condition`}
              onChange={(condition) => patchObjective(index, { ...o, condition: condition ?? '' })}
            />
          )}
        </>
      ) : step ? (
        <Text fontSize="sm" color="editorMutedText">
          Select an objective in the node to edit its fields. Add or remove objectives directly in
          the node.
        </Text>
      ) : (
        <Text fontSize="sm" color="editorMutedText">
          Select a step or objective to edit its properties.
        </Text>
      )}
      {step && (
        <>
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
            label="Fail when"
            value={step.failWhen}
            condition
            documentId={`${quest.id}/${selected}/failWhen`}
            onChange={(failWhen) => patchStep({ failWhen })}
          />
        </>
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
          <QuestGraphCanvas
            quest={quest}
            onChange={patch}
            onSelect={selectNode}
            onObjective={(step, objective) => setSelection({ step, objective })}
          />
        }
      />
    </>
  );
}
