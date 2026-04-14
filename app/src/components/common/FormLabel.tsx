import React from 'react';
import { FormLabel as ChakraFormLabel, FormLabelProps } from '@chakra-ui/react';

export const FormLabel: React.FC<FormLabelProps> = (props) => (
  <ChakraFormLabel fontSize="xs" color="gray.400" {...props} />
);

export const FormLabelUppercase: React.FC<FormLabelProps> = (props) => (
  <ChakraFormLabel
    fontSize="xs"
    fontWeight="bold"
    textTransform="uppercase"
    color="gray.500"
    {...props}
  />
);
