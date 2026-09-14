import React from 'react';
import { HStack, Text, Spinner, Box } from '@chakra-ui/react';
import { CheckIcon, WarningIcon } from '@chakra-ui/icons';
import { useSaveStore } from '../../lib/saveManager';

interface SaveIndicatorProps {
  saveUnitId?: string | null;
}

export const SaveIndicator: React.FC<SaveIndicatorProps> = ({ saveUnitId }) => {
  const activeSaveUnitId = useSaveStore((state) => state.activeSaveUnitId);
  const trackedSaveUnitId = saveUnitId ?? activeSaveUnitId;
  const saveUnit = useSaveStore((state) =>
    trackedSaveUnitId ? state.saveUnits[trackedSaveUnitId] : undefined,
  );

  const status = saveUnit?.status ?? 'idle';
  const error = saveUnit?.error ?? null;
  const visible = status !== 'idle';

  const getStatusDisplay = (): { icon: React.ReactNode; text: string; color: string } => {
    switch (status) {
      case 'dirty':
        return {
          icon: <Box boxSize="2" borderRadius="full" bg="orange.400" />,
          text: 'Unsaved',
          color: 'orange.300',
        };
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

export const SaveIndicatorCompact: React.FC<SaveIndicatorProps> = ({ saveUnitId }) => {
  const activeSaveUnitId = useSaveStore((state) => state.activeSaveUnitId);
  const trackedSaveUnitId = saveUnitId ?? activeSaveUnitId;
  const status = useSaveStore((state) =>
    trackedSaveUnitId ? (state.saveUnits[trackedSaveUnitId]?.status ?? 'idle') : 'idle',
  );
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
      {status === 'dirty' && <Box boxSize="2" borderRadius="full" bg="orange.400" />}
      {status === 'saving' && <Spinner size="xs" color="blue.400" />}
      {status === 'saved' && <CheckIcon boxSize={3} color="green.400" />}
      {status === 'error' && <WarningIcon boxSize={3} color="red.400" />}
    </Box>
  );
};

export default SaveIndicator;
