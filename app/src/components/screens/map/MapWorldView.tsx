import React from 'react';
import { Badge, Box, Button, HStack, Select, Text, VStack } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import type { Map, WorldMapMetadata } from '../../../types/schema';

type ViewFilter = 'all' | 'world' | 'indoor' | 'special';
type CameraState = { x: number; y: number; zoom: number };
type WorldNodeMetrics = { x: number; y: number; width: number; height: number };

const GRID_SPACING_X = 320;
const GRID_SPACING_Y = 220;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.25;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getWorldCategory = (metadata?: WorldMapMetadata): 'world' | 'indoor' | 'special' =>
  metadata?.category || 'world';

const getFallbackPosition = (index: number): { x: number; y: number } => ({
  x: (index % 4) * GRID_SPACING_X,
  y: Math.floor(index / 4) * GRID_SPACING_Y,
});

const getNodeMetrics = (map: Map, index: number): WorldNodeMetrics => {
  const fallback = getFallbackPosition(index);
  const world = map.metadata?.world;
  return {
    x: typeof world?.x === 'number' ? world.x : fallback.x,
    y: typeof world?.y === 'number' ? world.y : fallback.y,
    width: clamp(120 + map.width * 8, 150, 300),
    height: clamp(84 + map.height * 6, 110, 220),
  };
};

const categoryAccent: Record<'world' | 'indoor' | 'special', { border: string; badge: string }> = {
  world: { border: 'blue.300', badge: 'blue' },
  indoor: { border: 'orange.300', badge: 'orange' },
  special: { border: 'pink.300', badge: 'pink' },
};

export const MapWorldView: React.FC = () => {
  const maps = useEditorStore((state) => state.maps);
  const currentMapId = useEditorStore((state) => state.currentMap?.id ?? null);
  const loadMap = useEditorStore((state) => state.loadMap);
  const updateCurrentMap = useEditorStore((state) => state.updateCurrentMap);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = React.useState<ViewFilter>('all');
  const [camera, setCamera] = React.useState<CameraState>({ x: 120, y: 80, zoom: 0.7 });
  const [viewportSize, setViewportSize] = React.useState({ width: 1, height: 1 });
  const [dragState, setDragState] = React.useState<
    | {
        kind: 'pan';
        pointerId: number;
        originClientX: number;
        originClientY: number;
        originCamera: CameraState;
      }
    | {
        kind: 'node';
        pointerId: number;
        mapId: string;
        originClientX: number;
        originClientY: number;
        originX: number;
        originY: number;
      }
    | null
  >(null);
  const [draftPositions, setDraftPositions] = React.useState<
    Record<string, { x: number; y: number }>
  >({});

  React.useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateViewportSize = () => {
      setViewportSize({ width: element.clientWidth || 1, height: element.clientHeight || 1 });
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      if (dragState.kind === 'pan') {
        const dx = (event.clientX - dragState.originClientX) / dragState.originCamera.zoom;
        const dy = (event.clientY - dragState.originClientY) / dragState.originCamera.zoom;
        setCamera({
          ...dragState.originCamera,
          x: dragState.originCamera.x - dx,
          y: dragState.originCamera.y - dy,
        });
        return;
      }

      const dx = (event.clientX - dragState.originClientX) / camera.zoom;
      const dy = (event.clientY - dragState.originClientY) / camera.zoom;
      setDraftPositions((prev) => ({
        ...prev,
        [dragState.mapId]: {
          x: Math.round(dragState.originX + dx),
          y: Math.round(dragState.originY + dy),
        },
      }));
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      if (dragState.kind === 'node') {
        const nextPosition = draftPositions[dragState.mapId];
        if (nextPosition) {
          loadMap(dragState.mapId);
          updateCurrentMap({
            metadata: {
              ...(useEditorStore.getState().currentMap?.metadata || {}),
              world: {
                ...(useEditorStore.getState().currentMap?.metadata?.world || {}),
                included: true,
                category: getWorldCategory(useEditorStore.getState().currentMap?.metadata?.world),
                x: nextPosition.x,
                y: nextPosition.y,
              },
            },
          });
        }
      }

      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [camera.zoom, draftPositions, dragState, loadMap, updateCurrentMap]);

  const includedMaps = React.useMemo(
    () => maps.filter((map) => map.metadata?.world?.included),
    [maps],
  );

  const filteredMaps = React.useMemo(() => {
    if (filter === 'all') return includedMaps;
    return includedMaps.filter((map) => getWorldCategory(map.metadata?.world) === filter);
  }, [filter, includedMaps]);

  const metricsById = React.useMemo(() => {
    const next = new Map<string, WorldNodeMetrics>();
    includedMaps.forEach((map, index) => {
      const metrics = getNodeMetrics(map, index);
      const draft = draftPositions[map.id];
      next.set(map.id, {
        ...metrics,
        x: draft?.x ?? metrics.x,
        y: draft?.y ?? metrics.y,
      });
    });
    return next;
  }, [draftPositions, includedMaps]);

  const visibleIds = new Set(filteredMaps.map((map) => map.id));

  const externalLinkCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    includedMaps.forEach((map) => {
      counts[map.id] = (map.locationLinks || []).filter(
        (link) => !visibleIds.has(link.targetMapId),
      ).length;
    });
    return counts;
  }, [includedMaps, visibleIds]);

  const connections = React.useMemo(() => {
    const seen = new Map<string, { sourceId: string; targetId: string; count: number }>();
    includedMaps.forEach((map) => {
      (map.locationLinks || []).forEach((link) => {
        if (!visibleIds.has(map.id) || !visibleIds.has(link.targetMapId)) {
          return;
        }
        const key = [map.id, link.targetMapId].sort().join('::');
        const existing = seen.get(key);
        if (existing) {
          existing.count += 1;
          return;
        }
        seen.set(key, {
          sourceId: map.id,
          targetId: link.targetMapId,
          count: 1,
        });
      });
    });
    return Array.from(seen.values());
  }, [includedMaps, visibleIds]);

  const screenForWorldPoint = React.useCallback(
    (x: number, y: number) => ({
      x: viewportSize.width / 2 + (x - camera.x) * camera.zoom,
      y: viewportSize.height / 2 + (y - camera.y) * camera.zoom,
    }),
    [camera.x, camera.y, camera.zoom, viewportSize.height, viewportSize.width],
  );

  const handleWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const worldX = (mouseX - viewportSize.width / 2) / camera.zoom + camera.x;
      const worldY = (mouseY - viewportSize.height / 2) / camera.zoom + camera.y;
      const nextZoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
      setCamera({
        zoom: nextZoom,
        x: worldX - (mouseX - viewportSize.width / 2) / nextZoom,
        y: worldY - (mouseY - viewportSize.height / 2) / nextZoom,
      });
    },
    [camera.x, camera.y, camera.zoom, viewportSize.height, viewportSize.width],
  );

  const currentMap = maps.find((map) => map.id === currentMapId) || null;
  const includedCount = includedMaps.length;
  const excludedCount = maps.length - includedCount;

  return (
    <Box h="full" w="full" position="relative" bg="editorCanvasBg" overflow="hidden">
      <Box
        position="absolute"
        inset={0}
        bgGradient="linear(to-br, rgba(10,14,24,0.95), rgba(5,7,12,0.98))"
      />
      <Box
        ref={viewportRef}
        position="absolute"
        inset={0}
        onWheel={handleWheel}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          setDragState({
            kind: 'pan',
            pointerId: event.pointerId,
            originClientX: event.clientX,
            originClientY: event.clientY,
            originCamera: camera,
          });
        }}
      >
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <pattern id="world-grid" width="64" height="64" patternUnits="userSpaceOnUse">
              <path
                d="M 64 0 L 0 0 0 64"
                fill="none"
                stroke="rgba(99, 179, 237, 0.08)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#world-grid)" />
          {connections.map((connection) => {
            const source = metricsById.get(connection.sourceId);
            const target = metricsById.get(connection.targetId);
            if (!source || !target) {
              return null;
            }
            const sourceCenter = screenForWorldPoint(
              source.x + source.width / 2,
              source.y + source.height / 2,
            );
            const targetCenter = screenForWorldPoint(
              target.x + target.width / 2,
              target.y + target.height / 2,
            );
            const labelX = (sourceCenter.x + targetCenter.x) / 2;
            const labelY = (sourceCenter.y + targetCenter.y) / 2;

            return (
              <g key={`${connection.sourceId}-${connection.targetId}`}>
                <line
                  x1={sourceCenter.x}
                  y1={sourceCenter.y}
                  x2={targetCenter.x}
                  y2={targetCenter.y}
                  stroke="rgba(144, 205, 244, 0.5)"
                  strokeWidth={Math.max(2, camera.zoom * 2.5)}
                />
                {connection.count > 1 && (
                  <g>
                    <circle cx={labelX} cy={labelY} r="11" fill="rgba(19, 28, 44, 0.95)" />
                    <text
                      x={labelX}
                      y={labelY + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#bee3f8"
                      fontWeight="700"
                    >
                      {connection.count}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {filteredMaps.map((map) => {
          const metrics = metricsById.get(map.id);
          if (!metrics) {
            return null;
          }
          const screen = screenForWorldPoint(metrics.x, metrics.y);
          const world = map.metadata?.world;
          const category = getWorldCategory(world);
          const accent = categoryAccent[category];
          const isActive = map.id === currentMapId;
          const isDragging = dragState?.kind === 'node' && dragState.mapId === map.id;
          const styleWidth = metrics.width * camera.zoom;
          const styleHeight = metrics.height * camera.zoom;
          const externalLinks = externalLinkCounts[map.id] || 0;

          return (
            <Box
              key={map.id}
              position="absolute"
              left={`${screen.x}px`}
              top={`${screen.y}px`}
              transform="translate(-50%, -50%)"
              w={`${styleWidth}px`}
              h={`${styleHeight}px`}
              borderWidth={isActive ? '2px' : '1px'}
              borderColor={isActive ? 'white' : accent.border}
              bg={isActive ? 'rgba(17, 24, 39, 0.94)' : 'rgba(11, 17, 28, 0.92)'}
              boxShadow={
                isActive
                  ? '0 0 0 1px rgba(99, 179, 237, 0.6), 0 12px 24px rgba(0, 0, 0, 0.35)'
                  : '0 12px 24px rgba(0, 0, 0, 0.28)'
              }
              borderRadius="xl"
              overflow="hidden"
              cursor={isDragging ? 'grabbing' : 'grab'}
              onPointerDown={(event) => {
                event.stopPropagation();
                loadMap(map.id);
                setDragState({
                  kind: 'node',
                  pointerId: event.pointerId,
                  mapId: map.id,
                  originClientX: event.clientX,
                  originClientY: event.clientY,
                  originX: metrics.x,
                  originY: metrics.y,
                });
              }}
            >
              <VStack align="stretch" spacing={0} h="full">
                <HStack justify="space-between" align="start" px={3} pt={2.5} spacing={2}>
                  <Badge colorScheme={accent.badge} variant="subtle" fontSize="9px">
                    {category}
                  </Badge>
                  {externalLinks > 0 && (
                    <Badge colorScheme="gray" variant="outline" fontSize="9px">
                      {externalLinks} off-world
                    </Badge>
                  )}
                </HStack>
                <VStack align="start" spacing={1} px={3} pb={3} flex={1} justify="center">
                  <Text
                    color="white"
                    fontWeight="bold"
                    fontSize={`${Math.max(11, camera.zoom * 16)}px`}
                    noOfLines={2}
                  >
                    {map.name}
                  </Text>
                  <Text color="gray.400" fontSize={`${Math.max(10, camera.zoom * 13)}px`}>
                    {map.width}×{map.height} tiles
                  </Text>
                  <Text color="gray.500" fontSize={`${Math.max(9, camera.zoom * 11)}px`}>
                    {map.locationLinks?.length || 0} link
                    {(map.locationLinks?.length || 0) === 1 ? '' : 's'}
                  </Text>
                </VStack>
              </VStack>
            </Box>
          );
        })}

        {filteredMaps.length === 0 && (
          <VStack position="absolute" inset={0} justify="center" spacing={3} pointerEvents="none">
            <Text color="white" fontSize="lg" fontWeight="bold">
              No maps match this world filter.
            </Text>
            <Text color="gray.400" maxW="md" textAlign="center">
              Mark maps as included in the World section of map metadata, or switch the filter to
              see other categories.
            </Text>
          </VStack>
        )}
      </Box>

      <HStack
        position="absolute"
        top={4}
        left={4}
        right={4}
        justify="space-between"
        align="start"
        spacing={4}
        pointerEvents="none"
      >
        <VStack
          align="start"
          spacing={1}
          bg="rgba(6, 10, 18, 0.85)"
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          borderRadius="lg"
          px={4}
          py={3}
          pointerEvents="auto"
        >
          <Text fontSize="sm" color="white" fontWeight="bold">
            World Overview
          </Text>
          <Text fontSize="xs" color="gray.400">
            Drag maps to place them. Scroll to zoom. Drag empty space to pan.
          </Text>
          <HStack spacing={2} pt={1}>
            <Badge colorScheme="blue">{includedCount} in world</Badge>
            <Badge colorScheme="gray">{excludedCount} excluded</Badge>
          </HStack>
        </VStack>

        <HStack
          bg="rgba(6, 10, 18, 0.88)"
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          borderRadius="lg"
          px={3}
          py={2}
          spacing={2}
          pointerEvents="auto"
        >
          <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="widest">
            Filter
          </Text>
          <Select
            size="sm"
            value={filter}
            onChange={(event) => setFilter(event.target.value as ViewFilter)}
            bg="blackAlpha.400"
            borderColor="whiteAlpha.300"
            w="140px"
          >
            <option value="all">All world maps</option>
            <option value="world">World</option>
            <option value="indoor">Indoor</option>
            <option value="special">Special</option>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            color="gray.300"
            onClick={() => {
              if (!currentMapId) {
                return;
              }
              const metrics = metricsById.get(currentMapId);
              if (!metrics) {
                return;
              }
              setCamera((prev) => ({ ...prev, x: metrics.x, y: metrics.y }));
            }}
          >
            Focus Current
          </Button>
        </HStack>
      </HStack>

      {currentMap && !currentMap.metadata?.world?.included && (
        <Box
          position="absolute"
          bottom={4}
          right={4}
          bg="rgba(6, 10, 18, 0.88)"
          borderWidth="1px"
          borderColor="orange.300"
          borderRadius="lg"
          px={4}
          py={3}
          maxW="sm"
        >
          <Text fontSize="sm" color="orange.200" fontWeight="bold">
            {currentMap.name} is currently excluded from the world view.
          </Text>
          <Text fontSize="xs" color="gray.400" mt={1}>
            Open map metadata from the browser to include it and assign a saved position.
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default MapWorldView;
