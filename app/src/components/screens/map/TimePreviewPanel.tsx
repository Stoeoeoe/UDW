import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  Switch,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Tooltip,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import PanelHeader from '../../../components/common/PanelHeader';

/** Discrete time phases with their normalized time ranges and display info */
const TIME_PHASES = [
  {
    id: 'dawn',
    label: 'Dawn',
    icon: '🌅',
    range: [0.2, 0.25],
    mid: 0.225,
    color: 'orange',
  },
  {
    id: 'morning',
    label: 'Morning',
    icon: '🌤',
    range: [0.25, 0.42],
    mid: 0.335,
    color: 'yellow',
  },
  {
    id: 'day',
    label: 'Day',
    icon: '☀️',
    range: [0.42, 0.67],
    mid: 0.545,
    color: 'yellow',
  },
  {
    id: 'evening',
    label: 'Evening',
    icon: '🌇',
    range: [0.67, 0.79],
    mid: 0.73,
    color: 'orange',
  },
  {
    id: 'dusk',
    label: 'Dusk',
    icon: '🌆',
    range: [0.79, 0.83],
    mid: 0.81,
    color: 'purple',
  },
  {
    id: 'night',
    label: 'Night',
    icon: '🌙',
    range: [0.83, 0.2],
    mid: 0.015,
    color: 'blue',
  },
] as const;

/** Convert normalized time (0-1) to a 24h clock string */
function timeToString(t: number): string {
  const totalMinutes = Math.round(t * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/** Get the current phase name based on normalized time */
function getCurrentPhase(t: number): string {
  // Night wraps around midnight
  if (t >= 0.83 || t < 0.2) return 'night';
  if (t < 0.25) return 'dawn';
  if (t < 0.42) return 'morning';
  if (t < 0.67) return 'day';
  if (t < 0.79) return 'evening';
  return 'dusk';
}

/**
 * TimePreviewPanel — Editor-only temporal preview controls.
 *
 * This is NOT a simulation. It's a preview context that allows designers
 * to visualize time-dependent content (entities with TimeScope) without
 * running game time.
 *
 * Controls:
 * - Toggle: enable/disable time preview
 * - Slider: continuous time selection (0-1 mapped to 24h)
 * - Phase buttons: jump to predefined time phases
 */
export const TimePreviewPanel: React.FC = () => {
  const timePreviewEnabled = useEditorStore((state) => state.timePreviewEnabled);
  const timeOfDay = useEditorStore((state) => state.timeOfDay);
  const setTimePreviewEnabled = useEditorStore((state) => state.setTimePreviewEnabled);
  const setTimeOfDay = useEditorStore((state) => state.setTimeOfDay);

  const currentPhase = useMemo(() => getCurrentPhase(timeOfDay), [timeOfDay]);
  const timeString = useMemo(() => timeToString(timeOfDay), [timeOfDay]);

  const handlePhaseClick = useCallback(
    (phaseId: string) => {
      const phase = TIME_PHASES.find((p) => p.id === phaseId);
      if (phase) {
        if (!timePreviewEnabled) {
          setTimePreviewEnabled(true);
        }
        setTimeOfDay(phase.mid);
      }
    },
    [timePreviewEnabled, setTimePreviewEnabled, setTimeOfDay],
  );

  // Gradient representing day/night cycle for the slider track
  const trackGradient =
    'linear-gradient(to right, ' +
    '#1a1a3e 0%, ' + // midnight
    '#1a1a3e 18%, ' + // pre-dawn
    '#ff8c42 22%, ' + // dawn
    '#ffd700 30%, ' + // morning
    '#87ceeb 45%, ' + // day
    '#87ceeb 60%, ' + // day
    '#ffa500 72%, ' + // evening
    '#9b59b6 80%, ' + // dusk
    '#1a1a3e 88%, ' + // night
    '#1a1a3e 100%)'; // midnight

  return (
    <Flex direction="column">
      {/* Header with toggle */}
      <PanelHeader
        title="Time Preview"
        actions={
          <HStack spacing={2}>
            {timePreviewEnabled && (
              <Text fontSize="xs" color="gray.400" fontFamily="mono">
                {timeString}
              </Text>
            )}
            <Tooltip
              label={timePreviewEnabled ? 'Disable time preview' : 'Enable time preview'}
              placement="left"
              hasArrow
            >
              <Box>
                <Switch
                  size="sm"
                  colorScheme="blue"
                  isChecked={timePreviewEnabled}
                  onChange={(e) => setTimePreviewEnabled(e.target.checked)}
                />
              </Box>
            </Tooltip>
          </HStack>
        }
      />

      {/* Controls body */}
      <Box px={3} py={2}>
        {/* Time slider */}
        <Box
          opacity={timePreviewEnabled ? 1 : 0.35}
          transition="opacity 0.2s"
          pointerEvents={timePreviewEnabled ? 'auto' : 'none'}
        >
          <Box position="relative" mb={2}>
            <Slider
              aria-label="Time of day"
              min={0}
              max={1}
              step={0.002}
              value={timeOfDay}
              onChange={setTimeOfDay}
            >
              <SliderTrack h="8px" borderRadius="full" bg="gray.800" overflow="hidden">
                <Box
                  position="absolute"
                  inset={0}
                  bgGradient={trackGradient}
                  opacity={0.7}
                  borderRadius="full"
                />
                <SliderFilledTrack bg="transparent" />
              </SliderTrack>
              <SliderThumb
                boxSize="14px"
                bg="white"
                borderWidth="2px"
                borderColor="blue.400"
                _focus={{ boxShadow: '0 0 0 2px rgba(66, 153, 225, 0.6)' }}
              />
            </Slider>

            {/* Start/End labels */}
            <Flex justify="space-between" mt={0}>
              <Text fontSize="8px" color="gray.600">
                00:00
              </Text>
              <Text fontSize="8px" color="gray.600">
                12:00
              </Text>
              <Text fontSize="8px" color="gray.600">
                24:00
              </Text>
            </Flex>
          </Box>

          {/* Phase buttons */}
          <HStack spacing={0.5} justify="center">
            {TIME_PHASES.map((phase) => {
              const isActive = currentPhase === phase.id && timePreviewEnabled;

              return (
                <Tooltip
                  key={phase.id}
                  label={`${phase.label} (${timeToString(phase.range[0])} - ${timeToString(phase.range[1] >= phase.range[0] ? phase.range[1] : 1)})`}
                  hasArrow
                  placement="bottom"
                >
                  <Box
                    flex={1}
                    textAlign="center"
                    py={1}
                    px={0.5}
                    borderRadius="md"
                    cursor="pointer"
                    bg={isActive ? `${phase.color}.900` : 'transparent'}
                    borderWidth="1px"
                    borderColor={isActive ? `${phase.color}.600` : 'transparent'}
                    _hover={{
                      bg: isActive ? `${phase.color}.900` : 'whiteAlpha.50',
                      borderColor: `${phase.color}.600`,
                    }}
                    transition="all 0.15s"
                    onClick={() => handlePhaseClick(phase.id)}
                  >
                    <Text fontSize="xs" lineHeight={1}>
                      {phase.icon}
                    </Text>
                    <Text
                      fontSize="7px"
                      fontWeight="bold"
                      color={isActive ? `${phase.color}.200` : 'gray.600'}
                      mt={0.5}
                      noOfLines={1}
                    >
                      {phase.label.slice(0, 3).toUpperCase()}
                    </Text>
                  </Box>
                </Tooltip>
              );
            })}
          </HStack>
        </Box>

        {/* Info when disabled */}
        {!timePreviewEnabled && (
          <Text fontSize="9px" color="gray.600" textAlign="center" mt={1} fontStyle="italic">
            Enable to preview time-scoped entities
          </Text>
        )}
      </Box>
    </Flex>
  );
};
