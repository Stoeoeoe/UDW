import React from 'react';
import { VStack, Spacer, Icon } from '@chakra-ui/react';
import { IconType } from 'react-icons';
import {
  FcFolder,
  FcGlobe,
  FcGrid,
  FcElectronics,
  FcBusinessman,
  FcComments,
  FcCommandLine,
  FcMindMap,
  FcSettings,
} from 'react-icons/fc';
import { EditorMode } from '../../types/editor';
import { CaptionText } from '../common/Typography.tsx';

interface NavIconProps {
  icon: IconType;
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
    bg={active ? 'editorCanvasBg' : 'transparent'}
    color={active ? 'blue.400' : 'gray.500'}
    borderLeftWidth={active ? '2px' : '0'}
    borderColor="blue.500"
    _hover={{
      bg: active ? 'editorCanvasBg' : 'editorHoverBg',
      color: active ? 'blue.400' : 'gray.300',
    }}
    transition="all 0.2s"
    title={label}
  >
    <Icon as={icon} boxSize={5} />
    <CaptionText
      fontWeight="medium"
      textTransform="uppercase"
      letterSpacing="wider"
      color="inherit"
    >
      {label}
    </CaptionText>
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
      bg="editorPanelBg"
      borderRight="1px"
      borderColor="editorBorderSubtle"
      w="16"
      flexShrink={0}
    >
      <NavIcon
        icon={FcFolder}
        label="Project"
        mode="project"
        active={activeMode === 'project'}
        onClick={onModeChange}
      />
      <NavIcon
        icon={FcGlobe}
        label="Maps"
        mode="maps"
        active={activeMode === 'maps'}
        onClick={onModeChange}
      />
      <NavIcon
        icon={FcGrid}
        label="Tiles"
        mode="tilesets"
        active={activeMode === 'tilesets'}
        onClick={onModeChange}
      />
      <NavIcon
        icon={FcElectronics}
        label="Entities"
        mode="entities"
        active={activeMode === 'entities'}
        onClick={onModeChange}
      />
      <NavIcon
        icon={FcBusinessman}
        label="Actors"
        mode="actors"
        active={activeMode === 'actors'}
        onClick={onModeChange}
      />
      <NavIcon
        icon={FcComments}
        label="Dialog"
        mode="dialogues"
        active={activeMode === 'dialogues'}
        onClick={onModeChange}
      />
      <NavIcon
        icon={FcCommandLine}
        label="Script"
        mode="scripting"
        active={activeMode === 'scripting'}
        onClick={onModeChange}
      />
      <NavIcon
        icon={FcMindMap}
        label="MapCfg"
        mode="mapConfig"
        active={activeMode === 'mapConfig' || activeMode === 'layers' || activeMode === 'terrain'}
        onClick={onModeChange}
      />
      <Spacer />
      <NavIcon
        icon={FcSettings}
        label="Settings"
        mode="settings"
        active={activeMode === 'settings'}
        onClick={onModeChange}
      />
    </VStack>
  );
};
