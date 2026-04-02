import React, { useState } from 'react';
import {
  VStack,
  HStack,
  Text,
  Box,
  Switch,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Divider,
  Badge,
} from '@chakra-ui/react';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel, ListPanelItem } from '../common';

// Settings categories
type SettingsCategory = 'general' | 'editor' | 'grid' | 'export' | 'shortcuts';

interface AppSettings {
  // General
  theme: 'dark' | 'light';
  autosaveEnabled: boolean;
  autosaveInterval: number; // minutes
  undoHistorySize: number;

  // Editor
  showTileIndices: boolean;
  snapToGrid: boolean;
  highlightHoveredTile: boolean;
  defaultTool: 'select' | 'stamp' | 'entitySelect';

  // Grid
  showGrid: boolean;
  gridOpacity: number;
  gridColor: string;

  // Export
  exportFormat: 'json' | 'xml' | 'binary';
  prettyPrintJson: boolean;
  includeMetadata: boolean;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  autosaveEnabled: true,
  autosaveInterval: 5,
  undoHistorySize: 50,
  showTileIndices: false,
  snapToGrid: true,
  highlightHoveredTile: true,
  defaultTool: 'select',
  showGrid: true,
  gridOpacity: 30,
  gridColor: '#ffffff',
  exportFormat: 'json',
  prettyPrintJson: true,
  includeMetadata: true,
};

/**
 * SettingsEditor - Global application settings.
 */
export const SettingsEditor: React.FC = () => {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>('general');
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    // TODO: Persist to localStorage or electron store
  };

  const categories: ListPanelItem[] = [
    { id: 'general', label: 'General', icon: <Text>⚙️</Text> },
    { id: 'editor', label: 'Editor', icon: <Text>✏️</Text> },
    { id: 'grid', label: 'Grid & Display', icon: <Text>📐</Text> },
    { id: 'export', label: 'Export', icon: <Text>📦</Text> },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: <Text>⌨️</Text> },
  ];

  const leftPanel = (
    <ListPanel
      title="Settings"
      items={categories}
      selectedId={activeCategory}
      onSelect={(id: string) => setActiveCategory(id as SettingsCategory)}
    />
  );

  const renderSettingRow = (
    label: string,
    description: string,
    control: React.ReactNode,
  ) => (
    <HStack justify="space-between" align="start" py={3}>
      <VStack align="start" spacing={0} flex={1}>
        <Text fontSize="sm" fontWeight="medium" color="gray.200">
          {label}
        </Text>
        <Text fontSize="xs" color="gray.500">
          {description}
        </Text>
      </VStack>
      <Box flexShrink={0}>{control}</Box>
    </HStack>
  );

  const renderGeneralSettings = () => (
    <VStack
      align="stretch"
      spacing={0}
      divider={<Divider borderColor="#071018" />}
    >
      {renderSettingRow(
        'Theme',
        'Application color theme',
        <HStack>
          <Badge colorScheme="blue" fontSize="xs">
            Dark Only
          </Badge>
        </HStack>,
      )}
      {renderSettingRow(
        'Autosave',
        'Automatically save project changes',
        <Switch
          isChecked={settings.autosaveEnabled}
          onChange={(e) => updateSetting('autosaveEnabled', e.target.checked)}
          colorScheme="blue"
        />,
      )}
      {renderSettingRow(
        'Autosave Interval',
        'Minutes between automatic saves',
        <NumberInput
          size="sm"
          w="80px"
          min={1}
          max={60}
          value={settings.autosaveInterval}
          onChange={(_, val) => updateSetting('autosaveInterval', val)}
          isDisabled={!settings.autosaveEnabled}
        >
          <NumberInputField bg="#0a0a0b" borderColor="#071018" />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>,
      )}
      {renderSettingRow(
        'Undo History Size',
        'Maximum number of undo steps to keep',
        <NumberInput
          size="sm"
          w="80px"
          min={10}
          max={200}
          step={10}
          value={settings.undoHistorySize}
          onChange={(_, val) => updateSetting('undoHistorySize', val)}
        >
          <NumberInputField bg="#0a0a0b" borderColor="#071018" />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>,
      )}
    </VStack>
  );

  const renderEditorSettings = () => (
    <VStack
      align="stretch"
      spacing={0}
      divider={<Divider borderColor="#071018" />}
    >
      {renderSettingRow(
        'Show Tile Indices',
        'Display tile index numbers on the tileset',
        <Switch
          isChecked={settings.showTileIndices}
          onChange={(e) => updateSetting('showTileIndices', e.target.checked)}
          colorScheme="blue"
        />,
      )}
      {renderSettingRow(
        'Snap to Grid',
        'Align entities and selections to tile grid',
        <Switch
          isChecked={settings.snapToGrid}
          onChange={(e) => updateSetting('snapToGrid', e.target.checked)}
          colorScheme="blue"
        />,
      )}
      {renderSettingRow(
        'Highlight Hovered Tile',
        'Show indicator on tile under cursor',
        <Switch
          isChecked={settings.highlightHoveredTile}
          onChange={(e) =>
            updateSetting('highlightHoveredTile', e.target.checked)
          }
          colorScheme="blue"
        />,
      )}
      {renderSettingRow(
        'Default Tool',
        'Tool selected when opening a map',
        <Select
          size="sm"
          w="130px"
          value={settings.defaultTool}
          onChange={(e) =>
            updateSetting(
              'defaultTool',
              e.target.value as AppSettings['defaultTool'],
            )
          }
          bg="#0a0a0b"
          borderColor="#071018"
        >
          <option value="select" style={{ background: '#0a0a0b' }}>
            Select
          </option>
          <option value="stamp" style={{ background: '#0a0a0b' }}>
            Stamp
          </option>
          <option value="entityPlace" style={{ background: '#0a0a0b' }}>
            Entity Place
          </option>
        </Select>,
      )}
    </VStack>
  );

  const renderGridSettings = () => (
    <VStack
      align="stretch"
      spacing={0}
      divider={<Divider borderColor="#071018" />}
    >
      {renderSettingRow(
        'Show Grid',
        'Display grid overlay on map viewport',
        <Switch
          isChecked={settings.showGrid}
          onChange={(e) => updateSetting('showGrid', e.target.checked)}
          colorScheme="blue"
        />,
      )}
      {renderSettingRow(
        'Grid Opacity',
        'Transparency of grid lines (0-100%)',
        <NumberInput
          size="sm"
          w="80px"
          min={5}
          max={100}
          step={5}
          value={settings.gridOpacity}
          onChange={(_, val) => updateSetting('gridOpacity', val)}
          isDisabled={!settings.showGrid}
        >
          <NumberInputField bg="#0a0a0b" borderColor="#071018" />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>,
      )}
    </VStack>
  );

  const renderExportSettings = () => (
    <VStack
      align="stretch"
      spacing={0}
      divider={<Divider borderColor="#071018" />}
    >
      {renderSettingRow(
        'Export Format',
        'Default format for map exports',
        <Select
          size="sm"
          w="100px"
          value={settings.exportFormat}
          onChange={(e) =>
            updateSetting(
              'exportFormat',
              e.target.value as AppSettings['exportFormat'],
            )
          }
          bg="#0a0a0b"
          borderColor="#071018"
        >
          <option value="json" style={{ background: '#0a0a0b' }}>
            JSON
          </option>
          <option value="xml" style={{ background: '#0a0a0b' }}>
            XML
          </option>
          <option value="binary" style={{ background: '#0a0a0b' }}>
            Binary
          </option>
        </Select>,
      )}
      {renderSettingRow(
        'Pretty Print JSON',
        'Format JSON output with indentation',
        <Switch
          isChecked={settings.prettyPrintJson}
          onChange={(e) => updateSetting('prettyPrintJson', e.target.checked)}
          colorScheme="blue"
          isDisabled={settings.exportFormat !== 'json'}
        />,
      )}
      {renderSettingRow(
        'Include Metadata',
        'Add editor metadata to exports',
        <Switch
          isChecked={settings.includeMetadata}
          onChange={(e) => updateSetting('includeMetadata', e.target.checked)}
          colorScheme="blue"
        />,
      )}
    </VStack>
  );

  const renderShortcutsSettings = () => (
    <VStack align="stretch" spacing={4}>
      <Text fontSize="xs" color="gray.500">
        Keyboard shortcuts cannot be customized yet. Here are the current
        bindings:
      </Text>
      <VStack
        align="stretch"
        spacing={0}
        divider={<Divider borderColor="#071018" />}
      >
        {[
          ['B', 'Brush / Paint tool'],
          ['E', 'Eraser tool'],
          ['G', 'Bucket fill tool'],
          ['V', 'Select tool'],
          ['Space + Drag', 'Pan viewport'],
          ['Scroll', 'Zoom in/out'],
          ['Ctrl + Z', 'Undo'],
          ['Ctrl + Shift + Z', 'Redo'],
          ['Ctrl + S', 'Save project'],
          ['Delete', 'Delete selected'],
        ].map(([key, action]) => (
          <HStack key={key} justify="space-between" py={2}>
            <Text fontSize="sm" color="gray.300">
              {action}
            </Text>
            <Badge
              bg="#071018"
              color="gray.300"
              fontFamily="mono"
              fontSize="xs"
              px={2}
            >
              {key}
            </Badge>
          </HStack>
        ))}
      </VStack>
    </VStack>
  );

  const renderCategoryContent = () => {
    switch (activeCategory) {
      case 'general':
        return renderGeneralSettings();
      case 'editor':
        return renderEditorSettings();
      case 'grid':
        return renderGridSettings();
      case 'export':
        return renderExportSettings();
      case 'shortcuts':
        return renderShortcutsSettings();
      default:
        return null;
    }
  };

  const categoryTitles: Record<SettingsCategory, string> = {
    general: 'General Settings (Fake. TODO!)',
    editor: 'Editor Preferences',
    grid: 'Grid & Display',
    export: 'Export Options',
    shortcuts: 'Keyboard Shortcuts',
  };

  return (
    <ResizableEditorLayout
      header={{
        title: 'Settings',
        subtitle: 'Configure application preferences',
      }}
      content={
        <Box p={6} maxW="700px" mx="auto">
          <VStack align="stretch" spacing={4}>
            <Text fontSize="lg" fontWeight="bold" color="white">
              {categoryTitles[activeCategory]}
            </Text>
            {renderCategoryContent()}
          </VStack>
        </Box>
      }
      leftPanel={leftPanel}
      leftPanelDefaultSize={15}
    />
  );
};

export default SettingsEditor;
