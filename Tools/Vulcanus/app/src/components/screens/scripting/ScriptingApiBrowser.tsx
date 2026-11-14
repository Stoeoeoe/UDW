import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Select,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { ListPanel } from '../common/ListPanel';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { TopTabbedEditorLayout } from '../common/TopTabbedEditorLayout';
import { EmptyScreen } from '../common/EmptyScreen';
import { InspectorSection } from '../../common/Fields';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { ScriptingManifestSettings } from './ScriptingManifestSettings';
import type { ScriptingManifest } from '../../../lib/scriptingManifest';

type Method = ScriptingManifest['modules'][number]['methods'][number];
export function ScriptingApiBrowser() {
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const [tab, setTab] = useState('api');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [selected, setSelected] = useState<string>();
  const entries = useMemo(
    () => [
      ...(manifest?.modules ?? []).flatMap((module) =>
        module.methods.map((method) => ({
          id: `method:${module.path}.${method.name}`,
          name: `${module.path}.${method.name}`,
          kind: method.action ? 'Action' : 'Call',
          description: method.action?.description ?? '',
          method,
          fields: undefined as
            | NonNullable<ScriptingManifest['tables']>[number]['fields']
            | undefined,
        })),
      ),
      ...(manifest?.tables ?? []).map((table) => ({
        id: `table:${table.name}`,
        name: table.name,
        kind: 'Table',
        description: 'Fields returned by the game API.',
        method: undefined,
        fields: table.fields,
      })),
    ],
    [manifest],
  );
  const visible = entries.filter(
    (entry) =>
      (!kind || entry.kind === kind) &&
      `${entry.name} ${entry.description} ${entry.method?.action?.category ?? ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const entry = visible.find((item) => item.id === selected) ?? visible[0];
  const tableTypes = new Set((manifest?.tables ?? []).map((table) => table.name));
  const openTable = (name: string) => {
    setQuery('');
    setKind('Table');
    setSelected(`table:${name}`);
  };
  return (
    <TopTabbedEditorLayout
      title="Scripting"
      tabs={[
        { id: 'api', label: 'Lua API' },
        { id: 'manifest', label: 'Manifest connection' },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      mainContent={
        tab === 'manifest' ? (
          <ScriptingManifestSettings />
        ) : (
          <ResizableEditorLayout
            leftPanel={
              <ListPanel
                title="Lua API"
                items={visible.map((item) => ({
                  id: item.id,
                  label: item.name,
                  sublabel: item.kind,
                }))}
                selectedId={entry?.id}
                onSelect={setSelected}
                emptyMessage={
                  manifest
                    ? 'No matching API entries'
                    : 'Connect a Lua manifest to browse the game API.'
                }
                topContent={
                  <VStack p={3}>
                    <Input
                      size="sm"
                      aria-label="Search Lua API"
                      placeholder="Search API…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <Select
                      size="sm"
                      aria-label="API entry type"
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="">All entries</option>
                      <option>Action</option>
                      <option>Call</option>
                      <option>Table</option>
                    </Select>
                  </VStack>
                }
              />
            }
            content={
              entry ? (
                <Box p={6} h="full" overflowY="auto">
                  <VStack align="stretch" spacing={5} maxW="900px">
                    <Text fontSize="lg" fontFamily="mono">
                      {entry.name}
                    </Text>
                    <HStack>
                      <Badge>{entry.kind}</Badge>
                      {entry.method && (
                        <Badge colorScheme={entry.method.writesState ? 'orange' : 'green'}>
                          {entry.method.writesState
                            ? 'Changes game state'
                            : entry.method.action && !entry.method.callable
                              ? 'Action step'
                              : 'Read-only'}
                        </Badge>
                      )}
                    </HStack>
                    {entry.description && <Text>{entry.description}</Text>}
                    {entry.method && (
                      <MethodDetails
                        method={entry.method}
                        tableTypes={tableTypes}
                        openTable={openTable}
                      />
                    )}
                    {entry.fields && (
                      <InspectorSection title="Fields">
                        <TypeFields fields={entry.fields} />
                      </InspectorSection>
                    )}
                  </VStack>
                </Box>
              ) : (
                <EmptyScreen
                  icon="⌘"
                  title={manifest ? 'No matching API entries' : 'Connect the game API'}
                  description={
                    manifest
                      ? 'Try another search or entry type.'
                      : 'Choose bindings.json in Manifest connection. API definitions come from Unity.'
                  }
                />
              )
            }
          />
        )
      }
    />
  );
}
function MethodDetails({
  method,
  tableTypes,
  openTable,
}: {
  method: Method;
  tableTypes: Set<string>;
  openTable: (name: string) => void;
}) {
  const declared =
    method.outputs ??
    (method.returnType && method.returnType !== 'nil'
      ? [{ name: 'result', type: method.returnType, nullable: method.returnNullable }]
      : []);
  const outputs = declared.map((output) =>
    declared.length === 1 &&
    output.type === 'table' &&
    method.returnType &&
    tableTypes.has(method.returnType)
      ? { ...output, type: method.returnType }
      : output,
  );
  return (
    <>
      {method.action && (
        <InspectorSection title="Execution">
          <Text>
            {method.action.execution === 'awaitable'
              ? 'Waits until finished before continuing.'
              : 'Completes immediately.'}
          </Text>
          <Text>Used in: {method.action.contexts.join(', ')}</Text>
          <Text>Phases: {(method.action.phases ?? ['sequence']).join(', ')}</Text>
          <Text>Category: {method.action.category}</Text>
        </InspectorSection>
      )}
      <InspectorSection title="Inputs">
        {method.parameters.length ? (
          <TypeFields fields={method.parameters} tableTypes={tableTypes} openTable={openTable} />
        ) : (
          <Text>No inputs.</Text>
        )}
      </InspectorSection>
      <InspectorSection title="Outputs">
        {outputs.length ? (
          <TypeFields fields={outputs} tableTypes={tableTypes} openTable={openTable} />
        ) : (
          <Text>No returned values.</Text>
        )}
      </InspectorSection>
    </>
  );
}
function TypeFields({
  fields,
  tableTypes,
  openTable,
}: {
  fields: {
    name: string;
    type: string;
    nullable?: boolean;
    optional?: boolean;
    defaultValue?: unknown;
  }[];
  tableTypes?: Set<string>;
  openTable?: (name: string) => void;
}) {
  return (
    <Table size="sm">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Type</Th>
          <Th>Details</Th>
        </Tr>
      </Thead>
      <Tbody>
        {fields.map((field) => (
          <Tr key={field.name}>
            <Td fontFamily="mono">{field.name}</Td>
            <Td>
              {tableTypes?.has(field.type) && openTable ? (
                <Button variant="link" size="sm" onClick={() => openTable(field.type)}>
                  {field.type}
                </Button>
              ) : (
                field.type
              )}
              {field.nullable ? ' (can be nil)' : ''}
            </Td>
            <Td>
              {field.optional ? `Optional · default: ${JSON.stringify(field.defaultValue)}` : ''}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
