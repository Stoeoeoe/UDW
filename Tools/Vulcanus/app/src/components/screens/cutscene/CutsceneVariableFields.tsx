import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  HStack,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { Field, InspectorSection } from '../../common/Fields';
import type { CutsceneVariable } from '../../../types/cutscene';
import { initialVariableValue, variableTypes } from '../../../lib/cutsceneVariables';

export function CutsceneJsonValueField({
  value,
  label,
  onChange,
}: {
  value: unknown;
  label: string;
  onChange: (value: unknown) => void;
}) {
  const [json, setJson] = useState(() => JSON.stringify(value) ?? '');
  const [error, setError] = useState(false);
  useEffect(() => {
    if (value !== undefined) {
      setJson(JSON.stringify(value));
      setError(false);
    }
  }, [value]);
  return (
    <Box>
      <Textarea
        aria-label={label}
        fontFamily="mono"
        value={json}
        onChange={(event) => {
          setJson(event.target.value);
          try {
            onChange(JSON.parse(event.target.value));
            setError(false);
          } catch {
            setError(true);
            onChange(undefined);
          }
        }}
      />
      {error && (
        <Text color="editorDangerText" fontSize="xs">
          Enter valid JSON.
        </Text>
      )}
    </Box>
  );
}

function InitialValue({
  variable,
  onChange,
}: {
  variable: CutsceneVariable;
  onChange: (value: unknown) => void;
}) {
  if (variable.initialValue === null)
    return (
      <Text textStyle="helperText">
        nil{' '}
        <Button size="xs" onClick={() => onChange(initialVariableValue(variable.type))}>
          Set a value
        </Button>
      </Text>
    );
  if (variable.type === 'boolean')
    return (
      <Switch
        aria-label={`Initial value for ${variable.name}`}
        isChecked={variable.initialValue === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  if (variable.type === 'string')
    return (
      <Input
        aria-label={`Initial value for ${variable.name}`}
        value={typeof variable.initialValue === 'string' ? variable.initialValue : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  if (variable.type === 'number')
    return (
      <Input
        type="number"
        aria-label={`Initial value for ${variable.name}`}
        value={typeof variable.initialValue === 'number' ? variable.initialValue : ''}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      />
    );
  return (
    <CutsceneJsonValueField
      value={variable.initialValue}
      label={`Initial value for ${variable.name}`}
      onChange={onChange}
    />
  );
}

export function CutsceneVariablesEditor({
  variables,
  onChange,
}: {
  variables: readonly CutsceneVariable[];
  onChange: (variables: CutsceneVariable[]) => void;
}) {
  const change = (index: number, patch: Partial<CutsceneVariable>) =>
    onChange(
      variables.map((variable, at) => (at === index ? { ...variable, ...patch } : variable)),
    );
  return (
    <InspectorSection title="Cutscene variables">
      <Text textStyle="helperText">
        Typed values shared by this run's blocks and Lua: Cutscene.Variables.name. They reset on
        each playback.
      </Text>
      {variables.map((variable, index) => (
        <VStack
          key={index}
          align="stretch"
          spacing={2}
          borderBottom="1px solid"
          borderColor="editorInlineBorder"
          pb={3}
        >
          <HStack>
            <Input
              aria-label={`Variable ${index + 1} name`}
              value={variable.name}
              onChange={(event) => change(index, { name: event.target.value })}
            />
            <Select
              aria-label={`Variable ${index + 1} type`}
              value={variable.type}
              onChange={(event) => {
                const type = event.target.value as CutsceneVariable['type'];
                change(index, { type, initialValue: initialVariableValue(type) });
              }}
            >
              {variableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
            <Button
              size="xs"
              aria-label={`Remove variable ${index + 1}`}
              onClick={() => onChange(variables.filter((_, at) => at !== index))}
            >
              Remove
            </Button>
          </HStack>
          <Field label="Initial value">
            <InitialValue
              key={variable.type}
              variable={variable}
              onChange={(initialValue) => change(index, { initialValue })}
            />
          </Field>
          <HStack>
            <Switch
              aria-label={`Allow nil for ${variable.name}`}
              isChecked={variable.nullable === true}
              onChange={(event) => change(index, { nullable: event.target.checked })}
            />
            <Text fontSize="xs">Allow nil</Text>
            {variable.nullable && (
              <Button size="xs" onClick={() => change(index, { initialValue: null })}>
                Initially nil
              </Button>
            )}
          </HStack>
        </VStack>
      ))}
      <Button
        size="xs"
        variant="outline"
        onClick={() => {
          let suffix = 1;
          while (variables.some((variable) => variable.name === `variable${suffix}`)) suffix++;
          onChange([...variables, { name: `variable${suffix}`, type: 'number', initialValue: 0 }]);
        }}
      >
        Add variable
      </Button>
    </InspectorSection>
  );
}
