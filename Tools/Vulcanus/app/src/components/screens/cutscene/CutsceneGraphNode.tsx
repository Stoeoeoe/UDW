import React, { lazy, Suspense, useContext, useMemo, useState } from 'react';
import { Box, Button, HStack, Input, Select, Switch, Text } from '@chakra-ui/react';
import { GraphNodeFrame, GraphExecutionPort } from '../../common/graph/GraphNodeFrame';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { CutsceneData } from '../../../types/cutscene';
import type { CutsceneGraphNode as AuthoredNode } from '../../../types/cutsceneGraph';
import { graphSignature, isPureGraphNode } from '../../../lib/cutsceneGraph';
import {
  canonicalVariableType,
  variableCompatible,
  variableTypes,
} from '../../../lib/cutsceneVariables';
import { NumericCutsceneArgument } from './NumericCutsceneArgument';
import { CutsceneJsonValueField } from './CutsceneVariableFields';
import { GraphEditingContext } from './CutsceneGraphContext';

const LuaEditor = lazy(() => import('./CutsceneGraphLuaEditor'));

export type GraphViewNode = Node<
  {
    authored: AuthoredNode;
    incoming: string[];
    tracks: number;
    options: Record<string, { id: string; label: string }[]>;
  },
  'cutscene'
>;

export const CutsceneGraphNode = React.memo(
  function CutsceneGraphNode({ data, selected }: NodeProps<GraphViewNode>) {
    const {
      scene,
      actions,
      resources,
      phase,
      change,
      spatial,
      characterReferences,
      argumentReferences,
      executionOnly,
      luaContext,
    } = useContext(GraphEditingContext);
    const scriptScope = useMemo(
      () => ({
        mode: 'script' as const,
        context: luaContext ?? 'cutscene',
        phase,
        cutsceneVariables: scene.variables,
      }),
      [phase, scene.variables, luaContext],
    );
    const expressionScope = useMemo(
      () => ({ ...scriptScope, mode: 'condition' as const }),
      [scriptScope],
    );
    const n = data.authored;
    const [details, setDetails] = useState(false);
    let signature: ReturnType<typeof graphSignature>;
    let error: string | undefined;
    try {
      signature = graphSignature(n, scene, actions);
    } catch (e) {
      error = (e as Error).message;
      signature = { inputs: [], outputs: [] };
    }
    const pure = isPureGraphNode(n);
    const title =
      signature.action?.displayName ??
      (n.kind === 'variable'
        ? `Get ${n.variable}`
        : ((
            {
              entry: 'Begin',
              exit: 'Complete',
              branch: 'If / Else',
              parallel: 'Parallel',
              join: 'Join',
              position: 'Make position',
              expression: 'Lua expression',
              lua: 'Lua script',
            } as Record<string, string>
          )[n.kind] ?? n.kind));
    const update = (key: string, value: CutsceneData) =>
      change(n.id, (node) => {
        (node.kind === 'action' ? node.step!.arguments : (node.arguments ??= {}))[key] = value;
        if (node.step?.argumentVariables) delete node.step.argumentVariables[key];
      });
    const codeEditor = (
      value: string,
      onChange: (value: string) => void,
      key: string,
      readOnly = false,
    ) => (
      <Box className="nodrag nowheel nopan" onKeyDown={(e) => e.stopPropagation()}>
        <Suspense fallback={<Text fontSize="xs">Loading Lua editor…</Text>}>
          <LuaEditor
            value={value}
            onChange={onChange}
            height="180px"
            expression={readOnly}
            documentId={`cutscene-graph/${scene.id}/${n.id}/${key}`}
            scope={readOnly ? expressionScope : scriptScope}
            characterReferences={characterReferences}
            argumentReferences={argumentReferences}
          />
        </Suspense>
      </Box>
    );
    const exec = (direction: 'source' | 'target', id: string, label: string) => (
      <GraphExecutionPort key={id} direction={direction} id={id} label={label} />
    );
    const changeComment = (value: string | undefined) =>
      change(n.id, (node) => {
        if (value === undefined) delete node.comment;
        else node.comment = value;
      });
    if (n.kind === 'comment')
      return (
        <GraphNodeFrame
          title="Comment"
          annotation
          selected={selected}
          comment={n.comment}
          onCommentChange={changeComment}
        />
      );
    return (
      <GraphNodeFrame
        title={title}
        category={
          pure ? 'value' : n.kind === 'action' ? 'action' : n.kind === 'lua' ? 'script' : 'flow'
        }
        selected={selected}
        pure={pure}
        subtitle={
          pure
            ? 'Read-only · calculated when needed'
            : signature.action?.execution === 'awaitable'
              ? 'Completes before continuing'
              : 'Execution'
        }
        comment={n.comment}
        onCommentChange={changeComment}
      >
        {!pure && (
          <HStack className="cutscene-graph-execution" justify="space-between">
            {n.kind !== 'entry' && n.kind !== 'join' && exec('target', 'in', 'In')}
            {n.kind !== 'exit' &&
              !['branch', 'parallel'].includes(n.kind) &&
              exec('source', 'next', n.kind === 'entry' ? 'Begin' : 'Completed')}
          </HStack>
        )}
        {n.kind === 'join' &&
          Array.from({ length: data.tracks }, (_, i) =>
            exec('target', `track-${i}`, `Track ${i + 1}`),
          )}
        {error && (
          <Text p={3} fontSize="xs" color="editorDangerText">
            {error}
          </Text>
        )}
        {n.kind === 'variable' && (
          <Box p={3}>
            <Select
              className="nodrag"
              size="xs"
              aria-label="Cutscene variable"
              value={n.variable ?? ''}
              onChange={(e) =>
                change(n.id, (node) => {
                  node.variable = e.target.value;
                })
              }
            >
              <option value="">Choose variable…</option>
              {n.variable && !scene.variables?.some((v) => v.name === n.variable) && (
                <option value={n.variable}>Missing: {n.variable}</option>
              )}
              {scene.variables?.map((v) => (
                <option value={v.name} key={v.name}>
                  {v.name} · {v.type}
                </option>
              ))}
            </Select>
          </Box>
        )}
        {signature.inputs.map((p) => {
          const authoredValue = (n.step?.arguments ?? n.arguments ?? {})[p.name];
          const value = authoredValue === undefined && p.optional ? p.defaultValue : authoredValue;
          const linked = n.step?.argumentVariables?.[p.name];
          const connected = data.incoming.includes(p.name);
          const options =
            data.options[p.name] ??
            (p.resourceType
              ? resources[p.resourceType]?.map((r) => ({ id: r.id, label: r.description || r.id }))
              : undefined);
          const colorType = canonicalVariableType(p.type);
          return (
            <Box className={`cutscene-graph-port data pin-${colorType}`} key={p.name}>
              {!executionOnly && (
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`data:${p.name}`}
                  className={connected ? 'connected' : ''}
                />
              )}
              <HStack justify="space-between" mb={1}>
                <Text fontSize="11px">{p.name.replace(/([A-Z])/g, ' $1')}</Text>
                <Text fontSize="8px" color="editorMutedText">
                  {colorType}
                  {p.nullable ? '?' : ''}
                </Text>
              </HStack>
              {connected ? (
                <Text fontSize="10px" color="green.200">
                  From connection
                </Text>
              ) : linked ? (
                <HStack>
                  <Text fontSize="xs">⚡ {linked}</Text>
                  <Button
                    size="xs"
                    onClick={() =>
                      change(n.id, (node) => {
                        delete node.step!.argumentVariables![p.name];
                      })
                    }
                  >
                    Use literal
                  </Button>
                </HStack>
              ) : p.type === 'path' || p.type === 'position' ? (
                <Button
                  className="nodrag"
                  size="xs"
                  w="full"
                  variant="outline"
                  onClick={() => spatial(n.id, p.name, p.type as 'position' | 'path')}
                >
                  ⌖{' '}
                  {p.type === 'path'
                    ? `${Array.isArray(value) ? value.length : 0} waypoints · Edit on map`
                    : `${value === null ? 'No position' : JSON.stringify(value)} · Edit on map`}
                </Button>
              ) : p.type === 'boolean' ? (
                <Switch
                  className="nodrag"
                  aria-label={`${title} ${p.name}`}
                  size="sm"
                  isChecked={value === true}
                  onChange={(e) => update(p.name, e.target.checked)}
                />
              ) : p.picker === 'lua' ? (
                codeEditor(String(value ?? ''), (value) => update(p.name, value), p.name)
              ) : options ? (
                <Select
                  className="nodrag"
                  size="xs"
                  aria-label={`${title} ${p.name}`}
                  value={String(value ?? '')}
                  onChange={(e) => update(p.name, e.target.value)}
                >
                  <option value="">Choose…</option>
                  {value && !options.some((o) => o.id === value) ? (
                    <option value={String(value)}>Missing: {String(value)}</option>
                  ) : null}
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : colorType === 'number' ? (
                <Box className="nodrag">
                  <NumericCutsceneArgument
                    label={`${title} ${p.name}`}
                    value={typeof value === 'number' || typeof value === 'string' ? value : ''}
                    onChange={(v) => update(p.name, v)}
                  />
                </Box>
              ) : p.type === 'table' || p.type.includes('|') || p.type === 'storyValue' ? (
                <Box className="nodrag nowheel">
                  <CutsceneJsonValueField
                    label={`${title} ${p.name}`}
                    value={value}
                    onChange={(v) => update(p.name, v as CutsceneData)}
                  />
                </Box>
              ) : (
                <Input
                  className="nodrag"
                  size="xs"
                  aria-label={`${title} ${p.name}`}
                  value={String(value ?? '')}
                  onChange={(e) => update(p.name, e.target.value)}
                />
              )}
            </Box>
          );
        })}
        {(n.kind === 'expression' || n.kind === 'lua') && (
          <Box p={3}>
            <Text fontSize="10px" color="editorMutedText" mb={2}>
              {n.kind === 'expression'
                ? 'One value, without return. Reads state when a connected action starts; cannot change state. Example: Cutscene.Variables.speed * 2'
                : 'Runs on execution. Use return to supply the outputs below, in order.'}
            </Text>
            {codeEditor(
              n.expression ?? '',
              (value) =>
                change(n.id, (node) => {
                  node.expression = value;
                }),
              'code',
              n.kind === 'expression',
            )}
            {n.kind === 'expression' && !error && (
              <HStack mt={2}>
                <Text fontSize="xs">Result type</Text>
                <Select
                  className="nodrag"
                  size="xs"
                  aria-label="Expression result type"
                  value={n.outputs![0].type}
                  onChange={(e) =>
                    change(n.id, (node) => {
                      node.outputs![0].type = e.target.value as (typeof node.outputs)[0]['type'];
                    })
                  }
                >
                  {variableTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </HStack>
            )}
            <Button size="xs" mt={2} onClick={() => setDetails(!details)}>
              {n.kind === 'expression' ? 'Advanced output settings' : 'Outputs'}
            </Button>
            {details && (
              <Box mt={2}>
                {n.outputs?.map((output, index) => (
                  <Box key={index} mb={2}>
                    <HStack>
                      <Input
                        className="nodrag"
                        size="xs"
                        aria-label={`Output ${index + 1} name`}
                        value={output.name}
                        onChange={(e) =>
                          change(n.id, (node) => {
                            node.outputs![index].name = e.target.value;
                          })
                        }
                      />
                      <Select
                        className="nodrag"
                        size="xs"
                        value={output.type}
                        aria-label={`Output ${index + 1} type`}
                        onChange={(e) =>
                          change(n.id, (node) => {
                            node.outputs![index].type = e.target.value as typeof output.type;
                          })
                        }
                      >
                        {variableTypes.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                    </HStack>
                    <HStack mt={1}>
                      <Switch
                        className="nodrag"
                        size="sm"
                        aria-label={`Output ${index + 1} nullable`}
                        isChecked={output.nullable === true}
                        onChange={(e) =>
                          change(n.id, (node) => {
                            node.outputs![index].nullable = e.target.checked;
                          })
                        }
                      />
                      <Text fontSize="9px">Allow nil</Text>
                      {n.kind === 'lua' && (
                        <Button
                          size="xs"
                          onClick={() =>
                            change(n.id, (node) => {
                              node.outputs!.splice(index, 1);
                              node.resultVariables?.splice(index, 1);
                            })
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </HStack>
                  </Box>
                ))}
                {n.kind === 'lua' && (
                  <Button
                    size="xs"
                    onClick={() =>
                      change(n.id, (node) => {
                        (node.outputs ??= []).push({
                          name: `result${node.outputs!.length + 1}`,
                          type: 'number',
                        });
                        node.resultVariables?.push(null);
                      })
                    }
                  >
                    ＋ Output
                  </Button>
                )}
              </Box>
            )}
          </Box>
        )}
        {signature.outputs.map((output, index) => (
          <Box
            key={output.name}
            className={`cutscene-graph-port output data pin-${canonicalVariableType(output.type)}`}
          >
            <Handle type="source" id={`data:${output.name}`} position={Position.Right} />
            <HStack justify="space-between">
              <Text fontSize="10px">{output.name}</Text>
              <Text fontSize="8px" color="editorMutedText">
                {output.type}
                {output.nullable ? '?' : ''}
              </Text>
            </HStack>
            {!pure && (
              <Select
                className="nodrag"
                size="xs"
                mt={1}
                aria-label={`Store ${output.name}`}
                value={(n.step?.resultVariables ?? n.resultVariables)?.[index] ?? ''}
                onChange={(e) =>
                  change(n.id, (node) => {
                    const owner = node.step ?? node;
                    const destinations = owner.resultVariables ?? signature.outputs.map(() => null);
                    destinations[index] = e.target.value || null;
                    owner.resultVariables = destinations;
                  })
                }
              >
                <option value="">Do not store</option>
                {(n.step?.resultVariables ?? n.resultVariables)?.[index] &&
                  !scene.variables?.some(
                    (v) =>
                      v.name === (n.step?.resultVariables ?? n.resultVariables)?.[index] &&
                      variableCompatible(output, v),
                  ) && (
                    <option value={(n.step?.resultVariables ?? n.resultVariables)![index]!}>
                      Missing or incompatible:{' '}
                      {(n.step?.resultVariables ?? n.resultVariables)![index]}
                    </option>
                  )}
                {scene.variables
                  ?.filter((v) => variableCompatible(output, v))
                  .map((v) => (
                    <option value={v.name} key={v.name}>
                      {v.name}
                    </option>
                  ))}
              </Select>
            )}
          </Box>
        ))}
        {n.kind === 'branch' &&
          ['then', 'else'].map((pin) => exec('source', pin, pin === 'then' ? 'True' : 'False'))}
        {n.kind === 'parallel' && (
          <>
            {Array.from({ length: n.tracks ?? 2 }, (_, i) =>
              exec('source', `track-${i}`, `Track ${i + 1}`),
            )}
            <Button
              size="xs"
              m={2}
              onClick={() =>
                change(n.id, (node) => {
                  node.tracks = (node.tracks ?? 2) + 1;
                })
              }
            >
              ＋ Track
            </Button>
          </>
        )}
      </GraphNodeFrame>
    );
  },
  (previous, next) => previous.data === next.data && previous.selected === next.selected,
);
