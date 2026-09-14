import React, { useMemo, useState } from 'react';
import {
  Button,
  FormControl,
  HStack,
  IconButton,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  Switch,
  Text,
  VStack,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { EntityFormDialog } from '../screens/common';
import { PropertyDefinition, PropertyType, PropertyValue } from '../../types/schema';
import { FormLabel } from '../common/FormLabel';

interface TileMetadataDefinitionsDialogProps {
  existingDefinitions: PropertyDefinition[];
  onCreate: (definition: PropertyDefinition) => Promise<void>;
  onClose: () => void;
}

const SUPPORTED_METADATA_TYPES: PropertyType[] = ['string', 'int', 'float', 'boolean', 'enum'];

export const TileMetadataDefinitionsDialog: React.FC<TileMetadataDefinitionsDialogProps> = ({
  existingDefinitions,
  onCreate,
  onClose,
}) => {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [type, setType] = useState<PropertyType>('string');
  const [description, setDescription] = useState('');
  const [required, setRequired] = useState(false);
  const [enumOptions, setEnumOptions] = useState<string[]>([]);
  const [defaultNumber, setDefaultNumber] = useState(0);
  const [defaultString, setDefaultString] = useState('');
  const [defaultBoolean, setDefaultBoolean] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedKey = useMemo(() => key.replace(/[^a-zA-Z0-9_]/g, '').trim(), [key]);
  const keyExists = useMemo(
    () => existingDefinitions.some((d) => d.key === normalizedKey),
    [existingDefinitions, normalizedKey],
  );

  const canSave = useMemo(() => {
    if (isSaving || !normalizedKey || keyExists || !label.trim()) return false;
    if (type === 'enum') return enumOptions.filter((o) => o.trim()).length > 0;
    return true;
  }, [enumOptions, isSaving, keyExists, label, normalizedKey, type]);

  const getDefaultValue = (): PropertyValue => {
    if (type === 'boolean') return defaultBoolean;
    if (type === 'int') return Math.round(defaultNumber);
    if (type === 'float' || type === 'number') return defaultNumber;
    return defaultString;
  };

  const handleCreate = async () => {
    if (!canSave) return;
    const constraints =
      type === 'enum'
        ? { options: enumOptions.filter((o) => o.trim()).map((o) => o.trim()) }
        : undefined;
    const nextDefinition: PropertyDefinition = {
      key: normalizedKey,
      label: label.trim(),
      type,
      defaultValue: getDefaultValue(),
      required,
      description: description.trim() || undefined,
      constraints,
    };
    setIsSaving(true);
    try {
      await onCreate(nextDefinition);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <EntityFormDialog
      title="New Tile Metadata"
      description="Define a new project-level metadata field for tiles."
      onCancel={onClose}
      onSubmit={() => {
        void handleCreate();
      }}
      submitLabel={isSaving ? 'Creating...' : 'Create Metadata'}
      isSubmitDisabled={!canSave}
      minWidth="520px"
    >
      <FormControl isRequired>
        <FormLabel>Label</FormLabel>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Is Farmable"
          autoFocus
        />
      </FormControl>

      <FormControl isRequired>
        <FormLabel>Key</FormLabel>
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="isFarmable"
          fontFamily="mono"
          isInvalid={keyExists}
        />
        {keyExists && (
          <Text mt={1} fontSize="xs" color="red.400">
            A metadata entry with this key already exists.
          </Text>
        )}
      </FormControl>

      <HStack spacing={4} align="start">
        <FormControl>
          <FormLabel>Type</FormLabel>
          <Select
            value={type}
            onChange={(e) => {
              const nextType = e.target.value as PropertyType;
              setType(nextType);
              if (nextType === 'string' || nextType === 'enum') setDefaultString('');
              if (nextType === 'int' || nextType === 'float' || nextType === 'number')
                setDefaultNumber(0);
              if (nextType === 'boolean') setDefaultBoolean(false);
              if (nextType !== 'enum') setEnumOptions([]);
            }}
          >
            {SUPPORTED_METADATA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </FormControl>

        <FormControl>
          <FormLabel>Required</FormLabel>
          <Switch size="sm" isChecked={required} onChange={(e) => setRequired(e.target.checked)} />
        </FormControl>
      </HStack>

      {type === 'enum' && (
        <FormControl isRequired>
          <FormLabel>Enum Options</FormLabel>
          <VStack spacing={1} align="stretch">
            {enumOptions.map((opt, idx) => (
              <HStack key={idx} spacing={1}>
                <Input
                  value={opt}
                  onChange={(e) => {
                    const next = [...enumOptions];
                    next[idx] = e.target.value;
                    setEnumOptions(next);
                  }}
                />
                <IconButton
                  aria-label="Remove option"
                  icon={<DeleteIcon fontSize="8px" />}
                  size="sm"
                  variant="ghost"
                  color="gray.600"
                  _hover={{ color: 'red.300' }}
                  onClick={() => setEnumOptions(enumOptions.filter((_, i) => i !== idx))}
                />
              </HStack>
            ))}
            <Button
              size="xs"
              variant="ghost"
              color="gray.500"
              _hover={{ color: 'white' }}
              leftIcon={<AddIcon fontSize="8px" />}
              onClick={() => setEnumOptions([...enumOptions, `option_${enumOptions.length + 1}`])}
            >
              Add Option
            </Button>
          </VStack>
        </FormControl>
      )}

      <FormControl>
        <FormLabel>Default Value</FormLabel>
        {(type === 'int' || type === 'float' || type === 'number') && (
          <NumberInput
            value={defaultNumber}
            step={type === 'int' ? 1 : 0.01}
            precision={type === 'int' ? 0 : 2}
            onChange={(_, v) => setDefaultNumber(Number.isNaN(v) ? 0 : v)}
          >
            <NumberInputField />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
        )}
        {(type === 'string' || type === 'enum') && (
          <Input value={defaultString} onChange={(e) => setDefaultString(e.target.value)} />
        )}
        {type === 'boolean' && (
          <Switch
            size="sm"
            isChecked={defaultBoolean}
            onChange={(e) => setDefaultBoolean(e.target.checked)}
          />
        )}
      </FormControl>

      <FormControl>
        <FormLabel>Description</FormLabel>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </FormControl>
    </EntityFormDialog>
  );
};

export default TileMetadataDefinitionsDialog;
