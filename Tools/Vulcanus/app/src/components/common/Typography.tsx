import React from 'react';
import {
  Text,
  type TextProps,
  FormLabel as ChakraFormLabel,
  type FormLabelProps,
} from '@chakra-ui/react';

export const SectionLabel: React.FC<TextProps> = ({ textStyle = 'sectionLabel', ...props }) => (
  <Text textStyle={textStyle} {...props} />
);

export const FieldLabel: React.FC<FormLabelProps> = ({ mb = 1, ...props }) => (
  <ChakraFormLabel textStyle="fieldLabel" mb={mb} {...props} />
);

export const MutedFieldLabel: React.FC<FormLabelProps> = ({ mb = 1, ...props }) => (
  <ChakraFormLabel textStyle="mutedFieldLabel" mb={mb} {...props} />
);

export const CaptionText: React.FC<TextProps> = ({
  fontSize = '10px',
  color = 'gray.600',
  ...props
}) => <Text fontSize={fontSize} color={color} {...props} />;
