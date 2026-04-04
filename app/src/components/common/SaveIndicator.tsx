import React from 'react';
import { HStack, Text, Spinner, Box } from '@chakra-ui/react';
import { CheckIcon, WarningIcon } from '@chakra-ui/icons';
import { useSaveStore } from '../../lib/saveManager';

/**
 * SaveIndicator - Shows current save status in the UI
 *
 * States:
 * - idle: Nothing shown (or subtle "All changes saved")
 * - saving: Spinner with "Saving..."
 * - saved: Checkmark with "Saved" (fades after 2s)
 * - error: Warning icon with error message
 */
export const SaveIndicator: React.FC = () => {
  const status = useSaveStore((state) => state.status);
  const error = useSaveStore((state) => state.error);

  // Keep the indicator rendered at a constant size to avoid layout shifts.
  // When idle we hide it visually but still reserve the same space.
  const visible = status !== 'idle';

  const getStatusDisplay = (): { icon: React.ReactNode; text: string; color: string } => {
    switch (status) {
      case 'saving':
        return {
          icon: <Spinner size="xs" color="blue.400" />,
          text: 'Saving...',
          color: 'blue.400',
        };
      case 'saved':
        return {
          icon: <CheckIcon boxSize={3} color="green.400" />,
          text: 'Saved',
          color: 'green.400',
        };
      case 'error':
        return {
          icon: <WarningIcon boxSize={3} color="red.400" />,
          text: error || 'Save failed',
          color: 'red.400',
        };
      default:
        return { icon: null, text: '', color: 'gray.500' };
    }
  };

  const { icon, text, color } = getStatusDisplay();

  return (
    <HStack
      spacing={2}
      px={2}
      py={1}
      rounded="md"
      bg="blackAlpha.300"
      transition="opacity 0.15s"
      minW="86px"
      opacity={visible ? 1 : 0}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {icon}
      <Text fontSize="xs" color={color} fontWeight="medium">
        {text}
      </Text>
    </HStack>
  );
};

/**
 * Compact save indicator for tight spaces (just icon, no text)
 */
export const SaveIndicatorCompact: React.FC = () => {
  const status = useSaveStore((state) => state.status);
  const visible = status !== 'idle';

  return (
    <Box
      w="6"
      h="6"
      display="flex"
      alignItems="center"
      justifyContent="center"
      opacity={visible ? 1 : 0}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {status === 'saving' && <Spinner size="xs" color="blue.400" />}
      {status === 'saved' && <CheckIcon boxSize={3} color="green.400" />}
      {status === 'error' && <WarningIcon boxSize={3} color="red.400" />}
    </Box>
  );
};

export default SaveIndicator;
