import React from 'react';
import { FormControl, HStack, Input, Select, Textarea } from '@chakra-ui/react';
import { EditorModal } from './EditorModal';
import { EntityFormDialog } from '../screens/common/EntityFormDialog';
import { ColorPicker, IconPicker } from '../screens/common/FormFields';
import { FormLabel } from './FormLabel';
import type { EditorResourceMetadataField as ResourceMetadataField } from '../../types/editorResource';

export interface ResourceMetadataFormDialogProps<TValues extends Record<string, unknown>> {
  isOpen: boolean;
  title: string;
  values: TValues;
  fields: ResourceMetadataField[];
  onChange: <K extends keyof TValues>(key: K, value: TValues[K]) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}

function renderField<TValues extends Record<string, unknown>>(
  field: ResourceMetadataField,
  values: TValues,
  onChange: <K extends keyof TValues>(key: K, value: TValues[K]) => void,
): React.ReactNode {
  const rawValue = values[field.key as keyof TValues];

  switch (field.type) {
    case 'textarea':
      return (
        <Textarea
          value={String(rawValue ?? '')}
          onChange={(e) =>
            onChange(field.key as keyof TValues, e.target.value as TValues[keyof TValues])
          }
          placeholder={field.placeholder}
        />
      );
    case 'select':
      return (
        <Select
          value={String(rawValue ?? '')}
          onChange={(e) =>
            onChange(field.key as keyof TValues, e.target.value as TValues[keyof TValues])
          }
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    case 'icon':
      return (
        <IconPicker
          value={String(rawValue ?? '')}
          onChange={(value) =>
            onChange(field.key as keyof TValues, (value ?? '') as TValues[keyof TValues])
          }
        />
      );
    case 'color':
      return (
        <ColorPicker
          value={String(rawValue ?? '')}
          onChange={(value) =>
            onChange(field.key as keyof TValues, value as TValues[keyof TValues])
          }
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          min={field.min}
          value={Number(rawValue ?? 0)}
          onChange={(e) =>
            onChange(
              field.key as keyof TValues,
              (Number(e.target.value) || field.min || 0) as TValues[keyof TValues],
            )
          }
          placeholder={field.placeholder}
        />
      );
    case 'text':
    default:
      return (
        <Input
          value={String(rawValue ?? '')}
          onChange={(e) =>
            onChange(field.key as keyof TValues, e.target.value as TValues[keyof TValues])
          }
          placeholder={field.placeholder}
        />
      );
  }
}

function renderFields<TValues extends Record<string, unknown>>(
  fields: ResourceMetadataField[],
  values: TValues,
  onChange: <K extends keyof TValues>(key: K, value: TValues[K]) => void,
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const nextField = fields[index + 1];

    if (field.width === 'half' && nextField?.width === 'half') {
      elements.push(
        <HStack key={`${field.key}:${nextField.key}`} spacing={4} align="start">
          {[field, nextField].map((entry) => (
            <FormControl key={entry.key}>
              <FormLabel>{entry.label}</FormLabel>
              {renderField(entry, values, onChange)}
            </FormControl>
          ))}
        </HStack>,
      );
      index += 1;
      continue;
    }

    elements.push(
      <FormControl key={field.key}>
        <FormLabel>{field.label}</FormLabel>
        {renderField(field, values, onChange)}
      </FormControl>,
    );
  }

  return elements;
}

export function ResourceMetadataFormDialog<TValues extends Record<string, unknown>>({
  isOpen,
  title,
  values,
  fields,
  onChange,
  onClose,
  onSubmit,
}: ResourceMetadataFormDialogProps<TValues>) {
  return (
    <EditorModal isOpen={isOpen} onClose={onClose}>
      <EntityFormDialog
        title={title}
        onCancel={onClose}
        onSubmit={onSubmit}
        submitLabel="Save"
        scrollable
      >
        {renderFields(fields, values, onChange)}
      </EntityFormDialog>
    </EditorModal>
  );
}

export default ResourceMetadataFormDialog;
