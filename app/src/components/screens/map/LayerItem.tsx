import React from 'react';
import { Box, HStack, Text, IconButton, Tooltip } from '@chakra-ui/react';
import { DeleteIcon, EditIcon, DragHandleIcon } from '@chakra-ui/icons';
import { Layer, LayerKind, LayerDefinition } from '../../../types/schema';
import {
  BsImage,
  BsShieldExclamation,
  BsCompass,
  BsInfoCircle,
  BsTree,
  BsBuilding,
  BsWater,
  BsLayersHalf,
  BsStack,
  BsEye,
  BsEyeSlash,
  BsLock,
  BsLink45Deg,
  BsPeople,
} from 'react-icons/bs';

/** Layer type icon component */
export const LayerTypeIcon: React.FC<{ kind: LayerKind }> = ({ kind }) => {
  const iconProps = { size: 12 };
  switch (kind) {
    case 'visual':
      return <BsImage {...iconProps} />;
    case 'collision':
      return <BsShieldExclamation {...iconProps} />;
    case 'navigation':
      return <BsCompass {...iconProps} />;
    case 'metadata':
      return <BsInfoCircle {...iconProps} />;
    case 'entity':
      return <BsPeople {...iconProps} />;
    default:
      return <BsImage {...iconProps} />;
  }
};

/** Map of available layer icons */
const layerIconComponents: Record<string, React.FC<{ size?: number }>> = {
  tree: BsTree,
  building: BsBuilding,
  water: BsWater,
  ground: BsLayersHalf,
  overlay: BsStack,
};

export const LayerIcon: React.FC<{ icon?: string; color?: string }> = ({ icon, color }) => {
  if (!icon) return null;
  const IconComponent = layerIconComponents[icon];
  if (!IconComponent) return null;
  return (
    <Box color={color || 'gray.400'}>
      <IconComponent size={12} />
    </Box>
  );
};

export interface LayerItemProps {
  layer: Layer;
  isSelected: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  isFromDefinition: boolean;
  definition?: LayerDefinition | null;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onEdit: (layer: Layer) => void;
  onDelete: (id: string, name: string) => void;
  onGoToDefinition: (definitionId: string) => void;
  // Drag handlers
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragOver?: (e: React.DragEvent, id: string) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
  onDragEnd?: () => void;
  dragNodeRef?: React.RefObject<HTMLDivElement>;
}

export const LayerItem: React.FC<LayerItemProps> = ({
  layer,
  isSelected,
  isDragging,
  isDropTarget,
  isFromDefinition,
  definition,
  onSelect,
  onToggleVisibility,
  onEdit,
  onDelete,
  onGoToDefinition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  dragNodeRef,
}) => {
  const isSystemLayer = layer.kind === 'navigation';
  const layerIcon = layer.icon || definition?.icon;
  const iconColor = definition?.color;

  return (
    <Box
      ref={isDragging ? dragNodeRef : undefined}
      draggable={!isFromDefinition && !isSystemLayer}
      onDragStart={
        !isFromDefinition && !isSystemLayer && onDragStart
          ? (e) => onDragStart(e, layer.id)
          : undefined
      }
      onDragOver={onDragOver ? (e) => onDragOver(e, layer.id) : undefined}
      onDragLeave={onDragLeave}
      onDrop={onDrop ? (e) => onDrop(e, layer.id) : undefined}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(layer.id)}
      px="2"
      py="2"
      rounded="md"
      cursor={isFromDefinition || isSystemLayer ? 'pointer' : 'grab'}
      bg={isSelected ? 'blue.900' : 'transparent'}
      border="2px"
      borderColor={isDropTarget ? 'blue.400' : isSelected ? 'blue.500' : 'transparent'}
      borderStyle={isDropTarget ? 'dashed' : 'solid'}
      _hover={{ bg: isSelected ? 'blue.900' : 'whiteAlpha.50' }}
      transition="all 0.1s"
      opacity={isDragging ? 0.5 : 1}
    >
      <HStack spacing={2}>
        {/* Drag Handle */}
        <Box
          color={isFromDefinition || isSystemLayer ? 'gray.800' : 'gray.600'}
          cursor={isFromDefinition || isSystemLayer ? 'default' : 'grab'}
          _hover={isFromDefinition || isSystemLayer ? {} : { color: 'gray.400' }}
          w="14px"
        >
          {!isFromDefinition && !isSystemLayer && <DragHandleIcon fontSize="10px" />}
        </Box>

        {/* Layer Icon */}
        <Box
          w="16px"
          h="16px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          {layerIcon ? (
            <Tooltip
              label={isFromDefinition ? `From: ${definition!.name}` : undefined}
              fontSize="xs"
              isDisabled={!isFromDefinition}
            >
              <Box>
                <LayerIcon icon={layerIcon} color={iconColor} />
              </Box>
            </Tooltip>
          ) : null}
        </Box>

        {/* Visibility Toggle */}
        <IconButton
          aria-label="Toggle Visibility"
          icon={layer.visible ? <BsEye size={12} /> : <BsEyeSlash size={12} />}
          size="xs"
          variant="ghost"
          color={layer.visible ? 'blue.400' : 'gray.600'}
          _hover={{ bg: 'transparent', color: 'blue.300' }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(layer.id);
          }}
        />

        {/* Name + z-index */}
        <HStack flex={1} spacing={2} alignItems="center">
          <Text
            flex={1}
            fontSize="xs"
            fontWeight={isSelected ? 'bold' : 'normal'}
            color={!layer.visible ? 'gray.600' : 'inherit'}
          >
            {layer.name}
          </Text>
          <Text
            fontSize="10px"
            color="gray.400"
            opacity={0.9}
            userSelect="none"
            title={`z-order: ${layer.zOrder}`}
          >
            {`${layer.zOrder}`}
          </Text>
        </HStack>

        {/* Action Icons */}
        <HStack spacing="1">
          {layer.locked && <BsLock size={12} />}

          {/* Link button for definition layers, edit button for custom layers, nothing for system layers */}
          {isSystemLayer ? null : isFromDefinition ? (
            <Tooltip label="Go to layer definition" fontSize="xs">
              <IconButton
                aria-label="Go to definition"
                icon={<BsLink45Deg size={14} />}
                size="xs"
                variant="ghost"
                color="gray.500"
                _hover={{ color: 'blue.400' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onGoToDefinition(definition!.id);
                }}
              />
            </Tooltip>
          ) : (
            <Tooltip label="Edit layer" fontSize="xs">
              <IconButton
                aria-label="Edit layer"
                icon={<EditIcon fontSize="10px" />}
                size="xs"
                variant="ghost"
                color="gray.500"
                _hover={{ color: 'blue.400' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(layer);
                }}
              />
            </Tooltip>
          )}

          {/* Only allow deleting non-system, non-definition layers */}
          {!isFromDefinition && !isSystemLayer && (
            <IconButton
              aria-label="Delete"
              icon={<DeleteIcon fontSize="10px" />}
              size="xs"
              variant="ghost"
              colorScheme="red"
              opacity={0.3}
              _hover={{ opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(layer.id, layer.name);
              }}
            />
          )}
        </HStack>
      </HStack>
    </Box>
  );
};

export default LayerItem;
