import React from 'react';
import { Box, Icon, Image } from '@chakra-ui/react';
import { FiPackage } from 'react-icons/fi';
import { WorkspaceTreeNode } from '../../types/workspace';
import { GameIcon } from '../common/GameIcon';
import { fileSystem } from '../../lib/fileSystem';

export const WorkspaceNodeVisual: React.FC<{
  node: WorkspaceTreeNode;
  icon: React.ComponentType;
  isActive: boolean;
  compact?: boolean;
}> = ({ node, icon, isActive, compact = false }) => {
  const boxSize = compact ? '18px' : '20px';
  const iconSize = compact ? 3 : 3.5;

  if (node.resourceIcon?.type === 'game-icon') {
    return (
      <Box
        boxSize={boxSize}
        borderRadius="md"
        bg={isActive ? 'rgba(96,165,250,0.14)' : 'rgba(255,255,255,0.04)'}
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        <GameIcon
          iconName={node.resourceIcon.value}
          size={12}
          color={isActive ? 'blue.200' : 'inherit'}
        />
      </Box>
    );
  }

  if (node.resourceIcon?.type === 'emoji') {
    return (
      <Box
        boxSize={boxSize}
        display="flex"
        alignItems="center"
        justifyContent="center"
        fontSize="12px"
        flexShrink={0}
        borderRadius="md"
        bg={isActive ? 'rgba(96,165,250,0.16)' : 'rgba(255,255,255,0.04)'}
      >
        {node.resourceIcon.value}
      </Box>
    );
  }

  if (node.resourceIcon?.type === 'asset') {
    return <WorkspaceAssetIcon path={node.resourceIcon.value} />;
  }

  return (
    <Box
      boxSize={boxSize}
      borderRadius="md"
      bg={
        compact
          ? 'rgba(255,255,255,0.04)'
          : isActive
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(255,255,255,0.04)'
      }
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      <Icon as={icon} boxSize={iconSize} color={isActive ? 'blue.200' : 'inherit'} />
    </Box>
  );
};

const WorkspaceAssetIcon: React.FC<{ path: string }> = ({ path }) => {
  const [src, setSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;

    const loadIcon = async () => {
      try {
        const blob = await fileSystem.loadAsset(path);
        objectUrl = URL.createObjectURL(blob);
        if (!disposed) setSrc(objectUrl);
      } catch {
        if (!disposed) setSrc(null);
      }
    };

    void loadIcon();

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (!src) {
    return (
      <Box
        boxSize="20px"
        borderRadius="md"
        bg="rgba(255,255,255,0.04)"
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        <Icon as={FiPackage} boxSize={3} flexShrink={0} />
      </Box>
    );
  }

  return (
    <Box boxSize="20px" borderRadius="md" bg="rgba(255,255,255,0.04)" p="2px" flexShrink={0}>
      <Image src={src} boxSize="full" objectFit="cover" borderRadius="md" />
    </Box>
  );
};
