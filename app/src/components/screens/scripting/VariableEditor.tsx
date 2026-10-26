import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Select,
  Switch,
  IconButton,
  Badge,
  Tooltip,
  Collapse,
  Button,
  NumberInput,
  NumberInputField,
  useDisclosure,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon, ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import {
  GameVariable,
  GameVariableType,
  ScriptTable,
  ScriptFunction,
  ScriptNamespace,
  ScriptContextType,
} from '../../../types/schema';
import { ConditionEditor } from './ConditionEditor';
import { FormLabel } from '../../common/FormLabel';
import { GlobalFunctionEditor } from './GlobalFunctionEditor';
import { NamespaceEditor } from './NamespaceEditor';
import { ContextTypeEditor } from './ContextTypeEditor';
import { TableEditor } from './TableEditor';
import { ScriptingManifestSettings } from './ScriptingManifestSettings';
import { TopTabbedEditorLayout } from '../common/TopTabbedEditorLayout';
import { DialogListWorkspace } from '../common/DialogListWorkspace';
import { EditorModal } from '../../common/EditorModal';
import { EntityFormDialog } from '../common/EntityFormDialog';
import { SectionLabel } from '../../common/Typography.tsx';

type ScriptingTab = 'manifest' | 'variables' | 'tables' | 'functions' | 'namespaces' | 'contexts';

// ─── Constants ───────────────────────────────────────────────────────────────

const PRIMITIVE_TYPES: {
  value: 'boolean' | 'number' | 'string' | 'enum';
  label: string;
  badge: string;
  color: string;
}[] = [
  { value: 'boolean', label: 'Boolean', badge: '⊘', color: 'yellow' },
  { value: 'number', label: 'Number', badge: '#', color: 'blue' },
  { value: 'string', label: 'String', badge: 'Aa', color: 'green' },
  { value: 'enum', label: 'Enum', badge: '☰', color: 'purple' },
];

const VARIABLE_TYPES: { value: GameVariableType; label: string; badge: string; color: string }[] = [
  ...PRIMITIVE_TYPES,
  { value: 'table', label: 'Table', badge: '{}', color: 'orange' },
];

function defaultValueForPrimitive(
  type: 'boolean' | 'number' | 'string' | 'enum',
): boolean | number | string {
  switch (type) {
    case 'boolean':
      return false;
    case 'number':
      return 0;
    case 'string':
      return '';
    case 'enum':
      return '';
  }
}

// Single-entry variable editor — shown in dialog when editing a variable
export const VariableListEditorSingle: React.FC<{
  variable: GameVariable;
  tables: ScriptTable[];
  onUpdate: (key: string, updates: Partial<GameVariable>) => void;
  onMove: (key: string, direction: -1 | 1) => void;
}> = ({ variable: v, tables, onUpdate, onMove }) => {
  return (
    <VStack spacing={3} align="stretch" p={4}>
      <Box>
        <FormLabel>Key (Lua path)</FormLabel>
        <Input
          size="xs"
          fontFamily="mono"
          value={v.key}
          onChange={(e) => onUpdate(v.key, { key: e.target.value.replace(/[^a-zA-Z0-9_.]/g, '') })}
          placeholder="e.g. weather.isRain"
        />
      </Box>

      <HStack spacing={3}>
        <Box flex={1}>
          <FormLabel>Type</FormLabel>
          <Select
            size="xs"
            value={v.type}
            onChange={(e) => {
              const newType = e.target.value as GameVariableType;
              onUpdate(v.key, {
                type: newType,
                defaultValue:
                  newType === 'table'
                    ? ''
                    : defaultValueForPrimitive(newType as 'boolean' | 'number' | 'string' | 'enum'),
                enumValues:
                  newType === 'enum'
                    ? v.enumValues?.length
                      ? v.enumValues
                      : ['option1', 'option2']
                    : undefined,
                tableId: newType === 'table' ? (v.tableId ?? undefined) : undefined,
              });
            }}
          >
            {VARIABLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.badge} {t.label}
              </option>
            ))}
          </Select>
        </Box>
        <Box flex={1}>
          <FormLabel>Category</FormLabel>
          <Input
            size="xs"
            value={v.category}
            onChange={(e) => onUpdate(v.key, { category: e.target.value })}
            placeholder="e.g. Weather"
            list="variable-categories"
          />
        </Box>
      </HStack>

      {v.type === 'table' && (
        <Box>
          <FormLabel>Table Type</FormLabel>
          <Select
            size="xs"
            value={v.tableId ?? ''}
            onChange={(e) => onUpdate(v.key, { tableId: e.target.value || undefined })}
          >
            <option value="">— select a table —</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.fields.length} fields)
              </option>
            ))}
          </Select>
        </Box>
      )}

      {v.type !== 'table' && (
        <Box>
          <FormLabel>Default Value</FormLabel>
          {v.type === 'boolean' && (
            <Switch
              size="sm"
              colorScheme="green"
              isChecked={!!v.defaultValue}
              onChange={(e) => onUpdate(v.key, { defaultValue: e.target.checked })}
            />
          )}
          {v.type === 'number' && (
            <NumberInput
              size="xs"
              value={typeof v.defaultValue === 'number' ? v.defaultValue : 0}
              step={1}
              onChange={(_, val) => onUpdate(v.key, { defaultValue: isNaN(val) ? 0 : val })}
            >
              <NumberInputField />
            </NumberInput>
          )}
          {v.type === 'string' && (
            <Input
              size="xs"
              value={typeof v.defaultValue === 'string' ? v.defaultValue : ''}
              onChange={(e) => onUpdate(v.key, { defaultValue: e.target.value })}
            />
          )}
          {v.type === 'enum' && (
            <Select
              size="xs"
              value={typeof v.defaultValue === 'string' ? v.defaultValue : ''}
              onChange={(e) => onUpdate(v.key, { defaultValue: e.target.value })}
            >
              {(v.enumValues || []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          )}
        </Box>
      )}

      {v.type === 'enum' && (
        <Box>
          <FormLabel>Enum Values</FormLabel>
          <VStack spacing={1} align="stretch">
            {(v.enumValues || []).map((opt, optIdx) => (
              <HStack key={optIdx} spacing={1}>
                <Input
                  size="xs"
                  value={opt}
                  onChange={(e) => {
                    const vals = [...(v.enumValues || [])];
                    vals[optIdx] = e.target.value;
                    onUpdate(v.key, { enumValues: vals });
                  }}
                />
                <IconButton
                  aria-label="Remove value"
                  icon={<DeleteIcon fontSize="8px" />}
                  size="xs"
                  variant="ghost"
                  color="gray.600"
                  _hover={{ color: 'red.300' }}
                  onClick={() => {
                    const vals = (v.enumValues || []).filter((_, i) => i !== optIdx);
                    onUpdate(v.key, {
                      enumValues: vals,
                      ...(v.defaultValue === opt ? { defaultValue: vals[0] ?? '' } : {}),
                    });
                  }}
                />
              </HStack>
            ))}
            <Button
              size="xs"
              variant="ghost"
              color="gray.500"
              _hover={{ color: 'white' }}
              leftIcon={<AddIcon fontSize="8px" />}
              onClick={() => {
                const vals = [...(v.enumValues || []), `value_${(v.enumValues?.length || 0) + 1}`];
                onUpdate(v.key, { enumValues: vals });
              }}
            >
              Add Value
            </Button>
          </VStack>
        </Box>
      )}

      <Box>
        <FormLabel>Description</FormLabel>
        <Input
          size="xs"
          value={v.description ?? ''}
          onChange={(e) => onUpdate(v.key, { description: e.target.value || undefined })}
          placeholder="Optional — shown in editor UI"
        />
      </Box>

      <HStack spacing={1} justify="flex-end">
        <Tooltip label="Move Up" hasArrow>
          <IconButton
            aria-label="Move Up"
            icon={<ChevronUpIcon />}
            size="xs"
            variant="ghost"
            color="gray.500"
            onClick={() => onMove(v.key, -1)}
          />
        </Tooltip>
        <Tooltip label="Move Down" hasArrow>
          <IconButton
            aria-label="Move Down"
            icon={<ChevronDownIcon />}
            size="xs"
            variant="ghost"
            color="gray.500"
            onClick={() => onMove(v.key, 1)}
          />
        </Tooltip>
      </HStack>
    </VStack>
  );
};

// ─── Script Tester ───────────────────────────────────────────────────────────

const ScriptTester: React.FC<{
  variables: GameVariable[];
  tables: ScriptTable[];
  functions: ScriptFunction[];
  namespaces: ScriptNamespace[];
  contextTypes: ScriptContextType[];
}> = ({ variables, tables, functions, namespaces, contextTypes }) => {
  const [expr, setExpr] = useState('');
  const [open, setOpen] = useState(true);
  const [selectedContext, setSelectedContext] = useState<string | ''>('');

  const activeContext = contextTypes.find((ct) => ct.id === selectedContext);

  return (
    <Box borderTop="1px" borderColor="editorShellBorder" bg="editorPanelBg" flexShrink={0}>
      <HStack
        px={3}
        py={1.5}
        cursor="pointer"
        onClick={() => setOpen((o) => !o)}
        _hover={{ bg: 'whiteAlpha.50' }}
        spacing={2}
      >
        <SectionLabel textStyle="panelLabel" flex={1}>
          Script Tester
        </SectionLabel>
        {open ? <ChevronUpIcon color="gray.600" /> : <ChevronDownIcon color="gray.600" />}
      </HStack>
      <Collapse in={open} animateOpacity>
        <Box px={3} pb={3} pt={1}>
          {contextTypes.length > 0 && (
            <HStack mb={2} spacing={2}>
              <SectionLabel textStyle="panelLabel">Context</SectionLabel>
              <Select
                size="xs"
                w="140px"
                value={selectedContext}
                onChange={(e) => setSelectedContext(e.target.value)}
              >
                <option value="">— none —</option>
                {contextTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    self ({ct.name})
                  </option>
                ))}
              </Select>
            </HStack>
          )}
          <ConditionEditor
            value={expr}
            onChange={setExpr}
            variables={variables}
            tables={tables}
            functions={functions}
            namespaces={namespaces}
            activeContextType={activeContext}
          />
        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Tab button ─────────────────────────────────────────────────────────────

const TAB_DEFS: {
  id: ScriptingTab;
  label: string;
  badge: (s: ReturnType<typeof useScriptingState>) => number;
}[] = [
  { id: 'variables', label: 'Variables', badge: (s) => s.gameVariables.length },
  { id: 'tables', label: 'Tables', badge: (s) => s.scriptTables.length },
  { id: 'functions', label: 'Functions', badge: (s) => s.scriptFunctions.length },
  { id: 'namespaces', label: 'Namespaces', badge: (s) => s.scriptNamespaces.length },
  { id: 'contexts', label: 'Contexts', badge: (s) => s.scriptContextTypes.length },
  { id: 'manifest', label: 'Lua Manifest', badge: () => 0 },
];

function useScriptingState() {
  const gameVariables = useEditorStore((s) => s.gameVariables);
  const addGameVariable = useEditorStore((s) => s.addGameVariable);
  const updateGameVariable = useEditorStore((s) => s.updateGameVariable);
  const deleteGameVariable = useEditorStore((s) => s.deleteGameVariable);
  const scriptTables = useEditorStore((s) => s.scriptTables);
  const addScriptTable = useEditorStore((s) => s.addScriptTable);
  const updateScriptTable = useEditorStore((s) => s.updateScriptTable);
  const deleteScriptTable = useEditorStore((s) => s.deleteScriptTable);
  const scriptFunctions = useEditorStore((s) => s.scriptFunctions);
  const addScriptFunction = useEditorStore((s) => s.addScriptFunction);
  const updateScriptFunction = useEditorStore((s) => s.updateScriptFunction);
  const deleteScriptFunction = useEditorStore((s) => s.deleteScriptFunction);
  const scriptNamespaces = useEditorStore((s) => s.scriptNamespaces);
  const addScriptNamespace = useEditorStore((s) => s.addScriptNamespace);
  const updateScriptNamespace = useEditorStore((s) => s.updateScriptNamespace);
  const deleteScriptNamespace = useEditorStore((s) => s.deleteScriptNamespace);
  const scriptContextTypes = useEditorStore((s) => s.scriptContextTypes);
  const addScriptContextType = useEditorStore((s) => s.addScriptContextType);
  const updateScriptContextType = useEditorStore((s) => s.updateScriptContextType);
  const deleteScriptContextType = useEditorStore((s) => s.deleteScriptContextType);
  return {
    gameVariables,
    addGameVariable,
    updateGameVariable,
    deleteGameVariable,
    scriptTables,
    addScriptTable,
    updateScriptTable,
    deleteScriptTable,
    scriptFunctions,
    addScriptFunction,
    updateScriptFunction,
    deleteScriptFunction,
    scriptNamespaces,
    addScriptNamespace,
    updateScriptNamespace,
    deleteScriptNamespace,
    scriptContextTypes,
    addScriptContextType,
    updateScriptContextType,
    deleteScriptContextType,
  };
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export const VariableEditor: React.FC = () => {
  const s = useScriptingState();
  const [activeTab, setActiveTab] = useState<ScriptingTab>('variables');
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const itemDialog = useDisclosure();

  const openEditDialog = useCallback(
    (id: string) => {
      setFocusedItemId(id);
      itemDialog.onOpen();
    },
    [itemDialog],
  );

  const closeDialog = useCallback(() => {
    setFocusedItemId(null);
    itemDialog.onClose();
  }, [itemDialog]);

  const handleAddItem = useCallback(() => {
    switch (activeTab) {
      case 'variables': {
        const key = `variable_${Date.now()}`;
        s.addGameVariable({ key, type: 'boolean', category: 'Game State', defaultValue: false });
        openEditDialog(key);
        break;
      }
      case 'tables': {
        const id = `tbl_${Date.now()}`;
        s.addScriptTable({ id, name: 'table', fields: [] });
        openEditDialog(id);
        break;
      }
      case 'functions': {
        const id = `fn_${Date.now()}`;
        s.addScriptFunction({ id, name: 'newFunction', params: [], returnType: 'void' });
        openEditDialog(id);
        break;
      }
      case 'namespaces': {
        const id = `ns_${Date.now()}`;
        s.addScriptNamespace({ id, name: 'namespace', fields: [], functions: [] });
        openEditDialog(id);
        break;
      }
      case 'contexts': {
        const id = `ctx_${Date.now()}`;
        s.addScriptContextType({ id, name: 'context', fields: [], functions: [] });
        openEditDialog(id);
        break;
      }
    }
  }, [activeTab, s, openEditDialog]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    s.gameVariables.forEach((v) => {
      if (v.category) set.add(v.category);
    });
    return Array.from(set).sort();
  }, [s.gameVariables]);

  const handleMove = useCallback(
    (key: string, direction: -1 | 1) => {
      const idx = s.gameVariables.findIndex((v) => v.key === key);
      if (idx < 0) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= s.gameVariables.length) return;
      const a = s.gameVariables[idx];
      const b = s.gameVariables[newIdx];
      const aData = {
        type: a.type,
        category: a.category,
        description: a.description,
        defaultValue: a.defaultValue,
        enumValues: a.enumValues,
        tableId: a.tableId,
      };
      const bData = {
        type: b.type,
        category: b.category,
        description: b.description,
        defaultValue: b.defaultValue,
        enumValues: b.enumValues,
        tableId: b.tableId,
      };
      s.updateGameVariable(a.key, bData);
      s.updateGameVariable(b.key, aData);
    },
    [s],
  );

  const handleUpdateGameVariable = useCallback(
    (key: string, updates: Partial<GameVariable>) => {
      s.updateGameVariable(key, updates);
      if (focusedItemId && key === focusedItemId && typeof updates.key === 'string') {
        setFocusedItemId(updates.key);
      }
    },
    [focusedItemId, s],
  );

  const variableItems = useMemo(
    () =>
      s.gameVariables.map((v) => {
        const typeInfo = VARIABLE_TYPES.find((t) => t.value === v.type)!;
        return {
          id: v.key,
          title: v.key,
          subtitle: v.category || 'Uncategorized',
          badge: (
            <Badge fontSize="9px" colorScheme={typeInfo.color} variant="subtle">
              {typeInfo.badge} {v.type}
            </Badge>
          ),
          meta: (
            <Text fontSize="10px" color="gray.500" fontFamily="mono">
              {v.type === 'table'
                ? `table: ${v.tableId || '(unset)'}`
                : `default: ${String(v.defaultValue)}`}
            </Text>
          ),
        };
      }),
    [s.gameVariables],
  );

  const tableItems = useMemo(
    () =>
      s.scriptTables.map((table) => ({
        id: table.id,
        title: table.name,
        subtitle: table.id,
        badge: (
          <Badge fontSize="9px" colorScheme="orange" variant="subtle">
            {table.fields.length} fields
          </Badge>
        ),
      })),
    [s.scriptTables],
  );

  const functionItems = useMemo(
    () =>
      s.scriptFunctions.map((fn) => ({
        id: fn.id,
        title: `${fn.name}(${fn.params.map((p) => p.name).join(', ')})`,
        subtitle: fn.description || fn.id,
        badge: (
          <Badge fontSize="9px" colorScheme="teal" variant="subtle">
            {fn.returnType}
          </Badge>
        ),
      })),
    [s.scriptFunctions],
  );

  const namespaceItems = useMemo(
    () =>
      s.scriptNamespaces.map((ns) => ({
        id: ns.id,
        title: ns.name,
        subtitle: ns.id,
        badge: (
          <Badge fontSize="9px" colorScheme="cyan" variant="subtle">
            {ns.fields.length} fields, {ns.functions.length} funcs
          </Badge>
        ),
      })),
    [s.scriptNamespaces],
  );

  const contextItems = useMemo(
    () =>
      s.scriptContextTypes.map((ct) => ({
        id: ct.id,
        title: `self (${ct.name})`,
        subtitle: ct.id,
        badge: (
          <Badge fontSize="9px" colorScheme="orange" variant="subtle">
            {ct.fields.length} fields, {ct.functions.length} funcs
          </Badge>
        ),
      })),
    [s.scriptContextTypes],
  );

  // Center workspace content depends on active tab
  const mainContent = useMemo(() => {
    switch (activeTab) {
      case 'manifest':
        return <ScriptingManifestSettings />;
      case 'variables':
        return (
          <DialogListWorkspace
            title="Variables"
            description="Lua-exposed runtime variables. Click an entry to edit it."
            items={variableItems}
            enableSearch={true}
            addLabel="Add Variable"
            onAdd={handleAddItem}
            onOpenItem={openEditDialog}
            onDeleteItem={(key) => s.deleteGameVariable(key)}
            emptyIcon="📊"
            emptyTitle="No variables"
            emptyDescription="Create variables for game state, flags, and script values."
          />
        );
      case 'tables':
        return (
          <DialogListWorkspace
            title="Tables"
            description="Reusable table schemas used by variables, namespaces, and context types."
            items={tableItems}
            enableSearch={true}
            addLabel="Add Table"
            onAdd={handleAddItem}
            onOpenItem={openEditDialog}
            onDeleteItem={(id) => s.deleteScriptTable(id)}
            emptyIcon="{}"
            emptyTitle="No table schemas"
            emptyDescription="Define structured table types for script APIs."
          />
        );
      case 'functions':
        return (
          <DialogListWorkspace
            title="Global Functions"
            description="Callable functions available anywhere in the Lua sandbox."
            items={functionItems}
            enableSearch={true}
            addLabel="Add Function"
            onAdd={handleAddItem}
            onOpenItem={openEditDialog}
            onDeleteItem={(id) => s.deleteScriptFunction(id)}
            emptyIcon="⚡"
            emptyTitle="No global functions"
            emptyDescription="Define reusable script functions such as wait, setFlag, or query helpers."
          />
        );
      case 'namespaces':
        return (
          <DialogListWorkspace
            title="Namespaces"
            description="Singleton script APIs such as weather, camera, and audio systems."
            items={namespaceItems}
            enableSearch={true}
            addLabel="Add Namespace"
            onAdd={handleAddItem}
            onOpenItem={openEditDialog}
            onDeleteItem={(id) => s.deleteScriptNamespace(id)}
            emptyIcon="📦"
            emptyTitle="No namespaces"
            emptyDescription="Create namespace APIs to group fields and callable functions."
          />
        );
      case 'contexts':
        return (
          <DialogListWorkspace
            title="Context Types"
            description="Defines the shape of self for script execution contexts."
            items={contextItems}
            enableSearch={true}
            addLabel="Add Context"
            onAdd={handleAddItem}
            onOpenItem={openEditDialog}
            onDeleteItem={(id) => s.deleteScriptContextType(id)}
            emptyIcon="🎭"
            emptyTitle="No context types"
            emptyDescription="Create context definitions for character, cutscene, or event script scopes."
          />
        );
    }
  }, [
    activeTab,
    contextItems,
    functionItems,
    handleAddItem,
    openEditDialog,
    namespaceItems,
    tableItems,
    variableItems,
    s,
  ]);

  const dialogContent = useMemo(() => {
    if (!focusedItemId) return null;
    switch (activeTab) {
      case 'variables': {
        const variable = s.gameVariables.find((v) => v.key === focusedItemId);
        return variable ? (
          <Box>
            <datalist id="variable-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <VariableListEditorSingle
              variable={variable}
              tables={s.scriptTables}
              onUpdate={handleUpdateGameVariable}
              onMove={handleMove}
            />
          </Box>
        ) : null;
      }
      case 'tables':
        return (
          <TableEditor
            tables={s.scriptTables}
            onAdd={s.addScriptTable}
            onUpdate={s.updateScriptTable}
            onDelete={s.deleteScriptTable}
            initialExpandedId={focusedItemId}
          />
        );
      case 'functions':
        return (
          <GlobalFunctionEditor
            functions={s.scriptFunctions}
            tables={s.scriptTables}
            onAdd={s.addScriptFunction}
            onUpdate={s.updateScriptFunction}
            onDelete={s.deleteScriptFunction}
            initialExpandedId={focusedItemId}
          />
        );
      case 'namespaces':
        return (
          <NamespaceEditor
            namespaces={s.scriptNamespaces}
            tables={s.scriptTables}
            onAdd={s.addScriptNamespace}
            onUpdate={s.updateScriptNamespace}
            onDelete={s.deleteScriptNamespace}
            initialExpandedId={focusedItemId}
          />
        );
      case 'contexts':
        return (
          <ContextTypeEditor
            contextTypes={s.scriptContextTypes}
            tables={s.scriptTables}
            onAdd={s.addScriptContextType}
            onUpdate={s.updateScriptContextType}
            onDelete={s.deleteScriptContextType}
            initialExpandedId={focusedItemId}
          />
        );
    }
  }, [activeTab, categories, focusedItemId, handleMove, handleUpdateGameVariable, s]);

  return (
    <>
      <TopTabbedEditorLayout
        title="Scripting"
        tabs={TAB_DEFS.map((tab) => ({
          id: tab.id,
          label: tab.label,
          badge: tab.badge(s),
        }))}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        mainContent={mainContent}
        footerContent={
          <ScriptTester
            variables={s.gameVariables}
            tables={s.scriptTables}
            functions={s.scriptFunctions}
            namespaces={s.scriptNamespaces}
            contextTypes={s.scriptContextTypes}
          />
        }
      />

      <EditorModal isOpen={itemDialog.isOpen} onClose={closeDialog} size="xl">
        <EntityFormDialog
          title={
            activeTab === 'variables'
              ? 'Edit Variable'
              : activeTab === 'tables'
                ? 'Edit Table'
                : activeTab === 'functions'
                  ? 'Edit Function'
                  : activeTab === 'namespaces'
                    ? 'Edit Namespace'
                    : 'Edit Context Type'
          }
          onCancel={closeDialog}
          scrollable
        >
          {dialogContent}
        </EntityFormDialog>
      </EditorModal>
    </>
  );
};

export default VariableEditor;
