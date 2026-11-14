import React from 'react';
import {
  Box,
  FormControl,
  FormHelperText,
  HStack,
  IconButton,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  Text,
  Textarea,
  Tooltip,
  VStack,
  type FormControlProps,
  type IconButtonProps,
  type InputProps,
  type NumberInputProps,
  type SelectProps,
  type TextareaProps,
} from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { FieldLabel, SectionLabel } from './Typography.tsx';

export const FieldStack: React.FC<React.PropsWithChildren<{ spacing?: number | string }>> = ({
  children,
  spacing = 3,
}) => (
  <VStack align="stretch" spacing={spacing}>
    {children}
  </VStack>
);

export interface InspectorSectionProps {
  title?: React.ReactNode;
  children: React.ReactNode;
}

export const InspectorSection: React.FC<InspectorSectionProps> = ({ title, children }) => (
  <VStack align="stretch" spacing={3}>
    {title ? <SectionLabel textStyle="fieldLabel">{title}</SectionLabel> : null}
    {children}
  </VStack>
);

export interface FieldProps extends Omit<FormControlProps, 'label'> {
  label: React.ReactNode;
  helperText?: React.ReactNode;
}

export const Field: React.FC<React.PropsWithChildren<FieldProps>> = ({
  label,
  helperText,
  children,
  ...props
}) => (
  <FormControl {...props}>
    <FieldLabel>{label}</FieldLabel>
    {children}
    {helperText ? <FormHelperText textStyle="helperText">{helperText}</FormHelperText> : null}
  </FormControl>
);

export const CompactInput: React.FC<InputProps> = (props) => (
  <Input size="xs" variant="compact" {...props} />
);

export const CompactTextarea: React.FC<TextareaProps> = (props) => (
  <Textarea size="xs" variant="compact" {...props} />
);

export const CompactSelect: React.FC<SelectProps> = (props) => (
  <Select size="xs" variant="compact" {...props} />
);

export const ReadOnlyIdField: React.FC<Omit<InputProps, 'value'> & { value: string }> = ({
  value,
  ...props
}) => <Input size="xs" variant="readOnly" value={value} isReadOnly {...props} />;

export interface InlineEditorCardProps {
  children: React.ReactNode;
}

export const InlineEditorCard: React.FC<InlineEditorCardProps> = ({ children }) => (
  <Box bg="editorInlineBg" borderRadius="md" border="1px" borderColor="editorInlineBorder" p={2}>
    {children}
  </Box>
);

export interface DestructiveIconButtonProps extends Omit<IconButtonProps, 'aria-label'> {
  label?: string;
}

export const DestructiveIconButton: React.FC<DestructiveIconButtonProps> = ({
  label = 'Delete',
  icon = <DeleteIcon fontSize="8px" />,
  size = 'xs',
  variant = 'ghost',
  ...props
}) => (
  <Tooltip label={label} hasArrow>
    <IconButton
      aria-label={label}
      icon={icon}
      size={size}
      variant={variant}
      color="editorMutedText"
      _hover={{ color: 'editorDangerText', bg: 'red.900' }}
      {...props}
    />
  </Tooltip>
);

export interface InlineNumberPairProps {
  labels: [string, string];
  values: [number, number];
  onChange: (next: [number, number]) => void;
  precision?: number;
  step?: number;
  min?: number;
}

export const InlineNumberPair: React.FC<InlineNumberPairProps> = ({
  labels,
  values,
  onChange,
  precision = 0,
  step,
  min,
}) => {
  const renderInput = (index: 0 | 1, label: string) => {
    const next = [...values] as [number, number];

    return (
      <>
        <Text fontSize="xs" color="gray.400" flexShrink={0}>
          {label}
        </Text>
        <NumberInput
          size="xs"
          variant="compact"
          value={values[index]}
          precision={precision}
          step={step}
          min={min}
          onChange={(_, value) => {
            if (!isNaN(value)) {
              next[index] = precision === 0 ? Math.round(value) : value;
              onChange(next);
            }
          }}
          flex={1}
        >
          <NumberInputField
            fontFamily="mono"
            bg="editorFieldBg"
            borderColor="editorFieldBorder"
            color="editorText"
            _hover={{ bg: 'editorFieldHoverBg', borderColor: 'editorFieldBorderHover' }}
          />
        </NumberInput>
      </>
    );
  };

  return (
    <HStack spacing={2}>
      {renderInput(0, labels[0])}
      {renderInput(1, labels[1])}
    </HStack>
  );
};

export interface CompactNumberInputProps extends NumberInputProps {
  inputProps?: React.ComponentProps<typeof NumberInputField>;
}

export const CompactNumberInput: React.FC<CompactNumberInputProps> = ({
  children,
  inputProps,
  ...props
}) => (
  <NumberInput size="xs" variant="compact" {...props}>
    <NumberInputField
      fontFamily="mono"
      bg="editorFieldBg"
      borderColor="editorFieldBorder"
      color="editorText"
      _hover={{ bg: 'editorFieldHoverBg', borderColor: 'editorFieldBorderHover' }}
      {...inputProps}
    />
    {children}
  </NumberInput>
);
