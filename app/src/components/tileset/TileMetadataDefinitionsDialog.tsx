import React, { useMemo, useState } from 'react';
import {
  FormControl,
  FormLabel,
  HStack,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  Switch,
  Text,
} from '@chakra-ui/react';
import { EntityFormDialog } from '../screens/common';
import { PropertyDefinition, PropertyType, PropertyValue } from '../../types/schema';

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
  const [enumOptionsText, setEnumOptionsText] = useState('');
  const [defaultNumber, setDefaultNumber] = useState(0);
  const [defaultString, setDefaultString] = useState('');
  const [defaultBoolean, setDefaultBoolean] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedKey = useMemo(() => key.replace(/[^a-zA-Z0-9_]/g, '').trim(), [key]);

  const keyExists = useMemo(
    () => existingDefinitions.some((definition) => definition.key === normalizedKey),
    [existingDefinitions, normalizedKey],
  );

  const canSave = useMemo(() => {
    if (isSaving) return false;
    if (!normalizedKey) return false;
    if (keyExists) return false;
    if (!label.trim()) return false;
    if (type === 'enum') {
      const options = enumOptionsText
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      return options.length > 0;
    }
    return true;
  }, [enumOptionsText, isSaving, keyExists, label, normalizedKey, type]);

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
        ? {
            options: enumOptionsText
              .split(',')
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0),
          }
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
      onCancel={onClose}
      onSubmit={() => {
        void handleCreate();
      }}
      submitLabel={isSaving ? 'Creating...' : 'Create Metadata'}
      isSubmitDisabled={!canSave}
      minWidth="520px"
    >
      <FormControl isRequired>
        <FormLabel fontSize="xs" color="gray.400">
          Label
        </FormLabel>
        <Input
          size="sm"
          bg="#0a0a0b"
          borderColor="#1a1a2e"
          color="white"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. Is Farmable"
          autoFocus
        />
      </FormControl>

      <FormControl isRequired>
        <FormLabel fontSize="xs" color="gray.400">
          Key
        </FormLabel>
        <Input
          size="sm"
          bg="#0a0a0b"
          borderColor="#1a1a2e"
          color="white"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="isFarmable"
          fontFamily="mono"
          isInvalid={keyExists}
        />
        {keyExists && (
          <Text mt={1} fontSize="10px" color="red.400">
            A metadata entry with this key already exists.
          </Text>
        )}
      </FormControl>

      <HStack spacing={4} align="start">
        <FormControl>
          <FormLabel fontSize="xs" color="gray.400">
            Type
          </FormLabel>
          <Select
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={type}
            onChange={(event) => {
              const nextType = event.target.value as PropertyType;
              setType(nextType);
              if (nextType === 'string' || nextType === 'enum') {
                setDefaultString('');
              }
              if (nextType === 'int' || nextType === 'float' || nextType === 'number') {
                setDefaultNumber(0);
              }
              if (nextType === 'boolean') {
                setDefaultBoolean(false);
              }
            }}
          >
            {SUPPORTED_METADATA_TYPES.map((entry) => (
              <option key={entry} value={entry} style={{ background: '#0a0a0b' }}>
                {entry}
              </option>
            ))}
          </Select>
        </FormControl>

        <FormControl>
          <FormLabel fontSize="xs" color="gray.400">
            Required
          </FormLabel>
          <Switch
            size="sm"
            isChecked={required}
            onChange={(event) => setRequired(event.target.checked)}
          />
        </FormControl>
      </HStack>

      {type === 'enum' && (
        <FormControl isRequired>
          <FormLabel fontSize="xs" color="gray.400">
            Enum Options
          </FormLabel>
          <Input
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={enumOptionsText}
            onChange={(event) => setEnumOptionsText(event.target.value)}
            placeholder="yes, no, unknown"
          />
        </FormControl>
      )}

      <FormControl>
        <FormLabel fontSize="xs" color="gray.400">
          Default Value
        </FormLabel>
        {(type === 'int' || type === 'float' || type === 'number') && (
          <NumberInput
            size="sm"
            value={defaultNumber}
            step={type === 'int' ? 1 : 0.01}
            precision={type === 'int' ? 0 : 2}
            onChange={(_, valueAsNumber) => {
              setDefaultNumber(Number.isNaN(valueAsNumber) ? 0 : valueAsNumber);
            }}
          >
            <NumberInputField bg="#0a0a0b" borderColor="#1a1a2e" color="white" />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
        )}

        {(type === 'string' || type === 'enum') && (
          <Input
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={defaultString}
            onChange={(event) => setDefaultString(event.target.value)}
          />
        )}

        {type === 'boolean' && (
          <Switch
            size="sm"
            isChecked={defaultBoolean}
            onChange={(event) => setDefaultBoolean(event.target.checked)}
          />
        )}
      </FormControl>

      <FormControl>
        <FormLabel fontSize="xs" color="gray.400">
          Description
        </FormLabel>
        <Input
          size="sm"
          bg="#0a0a0b"
          borderColor="#1a1a2e"
          color="white"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional"
        />
      </FormControl>
    </EntityFormDialog>
  );
};

export default TileMetadataDefinitionsDialog;
