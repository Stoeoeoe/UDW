import React from 'react';
import { VStack, Text, Spacer } from '@chakra-ui/react';
import { EditorMode } from '../../types/editor';

interface NavIconProps {
  icon: string;
  label: string;
  mode: EditorMode;
  active: boolean;
  onClick: (mode: EditorMode) => void;
}

const NavIcon: React.FC<NavIconProps> = ({ icon, label, mode, active, onClick }) => (
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
    _hover={{ bg: active ? 'gray.800' : 'blackAlpha.400', color: active ? 'blue.400' : 'gray.300' }}
    transition="all 0.2s"
    title={label}
  >
    <Text fontSize="2xl">{icon}</Text>
    <Text fontSize="10px" fontWeight="medium" textTransform="uppercase" letterSpacing="wider">
      {label}
    </Text>
  </VStack>
);

interface SidebarProps {
  activeMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeMode, onModeChange }) => {
  return (
    <VStack
      spacing={0}
      h="full"
      bg="#03040a"
      borderRight="1px"
      borderColor="#071018"
      w="16"
      flexShrink={0}
    >
      <NavIcon
        icon="📋"
        label="Project"
        mode="project"
        active={activeMode === 'project'}
        onClick={onModeChange}
      />
      <NavIcon
        icon="🗺️"
        label="Maps"
        mode="maps"
        active={activeMode === 'maps'}
        onClick={onModeChange}
      />
      <NavIcon
        icon="🎨"
        label="Tiles"
        mode="tilesets"
        active={activeMode === 'tilesets'}
        onClick={onModeChange}
      />
      <NavIcon
        icon="👾"
        label="Entities"
        mode="entities"
        active={activeMode === 'entities'}
        onClick={onModeChange}
      />
      <NavIcon
        icon="👤"
        label="Actors"
        mode="actors"
        active={activeMode === 'actors'}
        onClick={onModeChange}
      />
      <NavIcon
        icon="💬"
        label="Dialog"
        mode="dialogues"
        active={activeMode === 'dialogues'}
        onClick={onModeChange}
      />
      <NavIcon
        icon="📜"
        label="Script"
        mode="scripting"
        active={activeMode === 'scripting'}
        onClick={onModeChange}
      />
      <NavIcon
        icon="🗂️"
        label="MapCfg"
        mode="mapConfig"
        active={activeMode === 'mapConfig' || activeMode === 'layers' || activeMode === 'terrain'}
        onClick={onModeChange}
      />
      <Spacer />
      <NavIcon
        icon="⚙️"
        label="Settings"
        mode="settings"
        active={activeMode === 'settings'}
        onClick={onModeChange}
      />
    </VStack>
  );
};
