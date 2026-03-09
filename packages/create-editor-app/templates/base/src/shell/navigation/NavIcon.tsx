import React from 'react';
import { VStack, Text } from '@chakra-ui/react';

export interface NavIconProps<TMode extends string = string> {
  icon: string;
  label: string;
  mode: TMode;
  active: boolean;
  onClick: (mode: TMode) => void;
}

export function NavIcon<TMode extends string = string>({
  icon,
  label,
  mode,
  active,
  onClick,
}: NavIconProps<TMode>) {
  return (
    <VStack
      as="button"
      onClick={() => onClick(mode)}
      spacing={0.5}
      justify="center"
      w="16"
      h="16"
      bg={active ? 'gray.800' : 'transparent'}
      color={active ? 'blue.400' : 'gray.500'}
      borderLeftWidth={active ? '2px' : '0'}
      borderColor="blue.500"
      _hover={{
        bg: active ? 'gray.800' : 'blackAlpha.400',
        color: active ? 'blue.400' : 'gray.300',
      }}
      transition="all 0.2s"
      title={label}
    >
      <Text fontSize="2xl">{icon}</Text>
      <Text
        fontSize="10px"
        fontWeight="medium"
        textTransform="uppercase"
        letterSpacing="wider"
      >
        {label}
      </Text>
    </VStack>
  );
}
