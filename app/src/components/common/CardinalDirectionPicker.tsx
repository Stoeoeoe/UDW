import React from 'react';
import { Box, Button, HStack, Text, VStack } from '@chakra-ui/react';
import { FiArrowDown, FiArrowLeft, FiArrowRight, FiArrowUp } from 'react-icons/fi';

type CardinalVector = [number, number];

const OPTIONS: Array<{
  id: string;
  label: string;
  value: CardinalVector;
  icon: React.ComponentType;
}> = [
  { id: 'up', label: 'Up', value: [0, -1], icon: FiArrowUp },
  { id: 'left', label: 'Left', value: [-1, 0], icon: FiArrowLeft },
  { id: 'right', label: 'Right', value: [1, 0], icon: FiArrowRight },
  { id: 'down', label: 'Down', value: [0, 1], icon: FiArrowDown },
];

const sameVector = (left: CardinalVector, right: CardinalVector) =>
  left[0] === right[0] && left[1] === right[1];

const getActiveOption = (value: CardinalVector) =>
  OPTIONS.find((option) => sameVector(option.value, value)) ?? OPTIONS[0];

interface CardinalDirectionPickerProps {
  value: CardinalVector;
  onChange: (value: CardinalVector) => void;
  size?: 'xs' | 'sm';
}

export const CardinalDirectionPicker: React.FC<CardinalDirectionPickerProps> = ({
  value,
  onChange,
  size = 'xs',
}) => {
  const active = getActiveOption(value);
  const ActiveIcon = active.icon;
  const slotSize = size === 'sm' ? '34px' : '30px';

  const renderButton = (optionId: string) => {
    const option = OPTIONS.find((entry) => entry.id === optionId);
    if (!option) return <Box w={slotSize} h={slotSize} />;

    const Icon = option.icon;
    const isActive = sameVector(option.value, value);

    return (
      <Button
        key={option.id}
        size={size}
        minW={slotSize}
        h={slotSize}
        px={0}
        variant={isActive ? 'solid' : 'outline'}
        colorScheme={isActive ? 'cyan' : 'gray'}
        onClick={() => onChange(option.value)}
        aria-label={option.label}
        title={option.label}
      >
        <Icon />
      </Button>
    );
  };

  return (
    <VStack align="stretch" spacing={2}>
      <VStack spacing={1} align="center">
        <HStack spacing={1} justify="center">
          <Box w={slotSize} h={slotSize} />
          {renderButton('up')}
          <Box w={slotSize} h={slotSize} />
        </HStack>
        <HStack spacing={1} justify="center">
          {renderButton('left')}
          <VStack
            spacing={0}
            justify="center"
            align="center"
            w={slotSize}
            h={slotSize}
            border="1px solid"
            borderColor="whiteAlpha.200"
            borderRadius="md"
            bg="whiteAlpha.100"
            color="cyan.300"
          >
            <ActiveIcon />
          </VStack>
          {renderButton('right')}
        </HStack>
        <HStack spacing={1} justify="center">
          <Box w={slotSize} h={slotSize} />
          {renderButton('down')}
          <Box w={slotSize} h={slotSize} />
        </HStack>
      </VStack>
      <Text fontSize="10px" color="gray.500" textAlign="center">
        Facing: {active.label}
      </Text>
    </VStack>
  );
};

export default CardinalDirectionPicker;
