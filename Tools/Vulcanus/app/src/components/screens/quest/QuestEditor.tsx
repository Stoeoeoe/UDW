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
import { questStartWarnings } from '../../../lib/quests';
import { describeStartMoment, questStartedBy } from '../../../lib/questStarters';
import { ConditionEditor } from '../scripting/ConditionEditor';
import { EditorHeaderActions, EditorValidationStatus } from '../../common/EditorDocumentFrame';
import { QuestGraphCanvas } from './QuestGraphCanvas';
import {
  newQuestObjective,
  objectivePin,
  questActionResources,
  questNodeLabels,
  questStepLabels,
  removeQuestNodes,
} from '../../../lib/questGraph';
import type { QuestGraph, QuestGraphNode } from '../../../types/questGraph';
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
import { OpenResourceButton } from '../../workspace/OpenResourceButton';
import type { EditorResourceTypeId } from '../../../types/editorResource';

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
  type,
}: {
  label: string;
  value: string;
  entries: readonly { id: string; name: string }[];
  onChange: (value: string) => void;
  empty?: string;
  /** What kind of resource the field names; adds a button that opens it. */
  type?: EditorResourceTypeId;
}) {
  return (
    <FormControl>
      <FieldLabel>{label}</FieldLabel>
      <HStack spacing={1}>
        <Select
          size="sm"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
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
        {type && (
          <OpenResourceButton
            resource={value ? { type, id: value } : null}
            label={`Open ${label.toLowerCase()}`}
          />
        )}
      </HStack>
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

/** A node, and for a step node optionally one of its objectives by position. */
type Selection = 'settings' | 'issues' | { nodeId: string; objective?: number };

function QuestWorkspace({ quest }: { quest: Quest }) {
  const characters = useEditorStore((s) => s.characters);
  const items = useEditorStore((s) => s.items);
  const maps = useEditorStore((s) => s.maps);
  const update = useEditorStore((s) => s.updateQuest);
  const issues = useEditorStore((s) => s.questIssues[quest.id]);
  const checkQuest = useEditorStore((s) => s.checkQuest);
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const resources = useMemo(
    () => questActionResources(manifest, { characters, items }),
    [manifest, characters, items],
  );
  const deities = useMemo(
    () => (resources.deity ?? []).map((d) => ({ id: d.id, name: d.description ?? d.id })),
    [resources],
  );
  const graph = quest.editorGraph;
  const [selection, setSelection] = useState<Selection>(() => ({
    nodeId: graph.nodes.find((n) => n.kind === 'step' && n.stepId === quest.steps[0].id)!.id,
  }));
  const selectedNode =
    typeof selection === 'object' ? graph.nodes.find((n) => n.id === selection.nodeId) : undefined;
  const step =
    selectedNode?.kind === 'step'
      ? quest.steps.find((s) => s.id === selectedNode.stepId)
      : undefined;
  // A step with one objective edits it straight away.
  const index =
    (typeof selection === 'object' ? selection.objective : undefined) ??
    (step?.objectives.length === 1 ? 0 : -1);
  const o = step?.objectives[index];
  const grouped = selectedNode?.group === true || (step?.objectives.length ?? 0) > 1;
  /** The selected node unless it is a step, which has its own fields. */
  const node = selectedNode?.kind !== 'step' ? selectedNode : undefined;
  const selectNode = (node: QuestGraphNode) => setSelection({ nodeId: node.id });
  const patch = (updates: Partial<Quest>) => update(quest.id, updates);
  const patchStep = (updates: Partial<QuestStep>) =>
    patch({
      steps: quest.steps.map((s) => (s === step ? { ...s, ...updates } : s)),
      editorGraph:
        updates.id === undefined
          ? graph
          : {
              ...graph,
              nodes: graph.nodes.map((n) =>
                n === selectedNode ? { ...n, stepId: updates.id } : n,
              ),
            },
    });
  /** An objective's branch wire leaves the pin named after its ID, so it follows renames and goes with removal. */
  const withObjectiveWires = (
    change: (edge: QuestGraph['edges'][number]) => QuestGraph['edges'][number] | null,
  ) => ({
    ...graph,
    edges: graph.edges.flatMap((e) =>
      e.source === selectedNode!.id && e.sourcePin !== 'next' ? (change(e) ?? []) : [e],
    ),
  });
  const patchObjective = (objectiveIndex: number, objective: QuestObjective) => {
    const previous = step!.objectives[objectiveIndex];
    const objectives = step!.objectives.map((entry, i) =>
      i === objectiveIndex ? objective : entry,
    );
    if (previous.id === objective.id) return patchStep({ objectives });
    patch({
      steps: quest.steps.map((s) => (s === step ? { ...s, objectives } : s)),
      editorGraph: withObjectiveWires((e) =>
        e.sourcePin === objectivePin(previous.id)
          ? { ...e, sourcePin: objectivePin(objective.id) }
          : e,
      ),
    });
  };
  const removeSelected = () => {
    if (o && grouped) {
      patch({
        steps: quest.steps.map((s) =>
          s === step ? { ...s, objectives: step.objectives.filter((_, oi) => oi !== index) } : s,
        ),
        editorGraph: withObjectiveWires((e) => (e.sourcePin === objectivePin(o.id) ? null : e)),
      });
      setSelection({ nodeId: selectedNode!.id });
    } else {
      patch(removeQuestNodes(quest, [selectedNode!.id]));
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
              : selectedNode
                ? questNodeLabels[selectedNode.kind]
                : ''
      }
      subtitle={o?.id ?? step?.id ?? node?.action?.method}
      onDelete={
        selectedNode && !['entry', 'exit'].includes(selectedNode.kind) ? removeSelected : undefined
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
            type="character"
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
          {!issues ? (
            <Text fontSize="sm" color="editorMutedText">
              Not checked yet. Saving checks the quest, or press Validate.
            </Text>
          ) : !issues.errors.length && !issues.warnings.length ? (
            <Text fontSize="sm" color="editorMutedText">
              No quest errors.
            </Text>
          ) : null}
          {issues?.errors.map((error, i) => (
            <Text key={`error-${i}`} role="alert" fontSize="sm" color="editorDangerText">
              {error}
            </Text>
          ))}
          {issues?.warnings.map((warning, i) => (
            <Text key={`warning-${i}`} role="status" fontSize="sm" color="orange.400">
              {warning}
            </Text>
          ))}
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
                : node.kind === 'branch' || node.kind === 'function' || node.kind === 'expression'
                  ? 'Edit the values directly on the node, or wire a read-only node into an input. A Branch continues to True when its condition holds when the step completes.'
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
              onChange={(e) =>
                patchObjective(index, {
                  ...newQuestObjective(e.target.value as QuestObjective['kind'], o.id),
                  text: o.text,
                })
              }
            >
              {['talk', 'deliver', 'have', 'reach', 'condition'].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </Select>
          </FormControl>
          {'character' in o && (
            <Reference
              label="Character"
              type="character"
              value={o.character}
              entries={characters}
              onChange={(character) => patchObjective(index, { ...o, character })}
            />
          )}
          {'item' in o && (
            <Reference
              label="Item"
              type="item"
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
                type="location"
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
              documentId={`${quest.id}/${selectedNode!.id}/${index}/condition`}
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
            documentId={`${quest.id}/${selectedNode!.id}/failWhen`}
            onChange={(failWhen) => patchStep({ failWhen })}
          />
        </>
      )}
    </InspectorShell>
  );

  return (
    <>
      <EditorHeaderActions>
        {issues && (
          <EditorValidationStatus errors={issues.errors} onClick={() => setSelection('issues')} />
        )}
        {issues && issues.warnings.length > 0 && (
          <Text fontSize="sm" color="orange.400">
            {issues.warnings.length} {issues.warnings.length === 1 ? 'warning' : 'warnings'}
          </Text>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            checkQuest(quest.id);
            setSelection('issues');
          }}
        >
          Validate
        </Button>
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
            onObjective={(nodeId, objective) => setSelection({ nodeId, objective })}
          />
        }
      />
    </>
  );
}
