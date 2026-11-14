import React from 'react';
import { FormLabel as ChakraFormLabel, FormLabelProps } from '@chakra-ui/react';
import { FieldLabel, MutedFieldLabel } from './Typography.tsx';

export const FormLabel: React.FC<FormLabelProps> = (props) => (
  <ChakraFormLabel fontSize="xs" color="gray.400" {...props} />
);

export const FormLabelUppercase: React.FC<FormLabelProps> = (props) => <FieldLabel {...props} />;

export const FormLabelMuted: React.FC<FormLabelProps> = (props) => <MutedFieldLabel {...props} />;
