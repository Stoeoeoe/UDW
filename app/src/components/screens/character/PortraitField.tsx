import React from 'react';
import { Box, Button, HStack, Text, VStack } from '@chakra-ui/react';
import { fileSystem } from '../../../lib/fileSystem';
import { useEditorStore } from '../../../store/useEditorStore';

interface PortraitFieldProps {
  /** Project-relative path of the portrait image, if one is set. */
  path: string | undefined;
  onChange: (path: string | undefined) => void;
  /** Shown above the image, for example the emotion's name. */
  title: React.ReactNode;
  /** Removes the whole row; omit for the default portrait, which can only be cleared. */
  onRemove?: () => void;
}

/** Picks one portrait image and previews it. */
export const PortraitField: React.FC<PortraitFieldProps> = ({ path, onChange, title, onRemove }) => {
  const loadSprite = useEditorStore((state) => state.loadSprite);
  const image = useEditorStore((state) => (path ? state.loadedSprites.get(path) : undefined));

  React.useEffect(() => {
    if (!path || image) return;
    void fileSystem.loadAsset(path).then((blob) => loadSprite(path, blob));
  }, [path, image, loadSprite]);

  const pick = async () => {
    const absolutePath = await fileSystem.selectAsset();
    if (!absolutePath) return;
    const blob = await fileSystem.readFileAsBlob(absolutePath);
    const filename = absolutePath.replace(/\\/g, '/').split('/').pop() || 'portrait.png';
    const relativePath = await fileSystem.saveAsset(filename, blob);
    await loadSprite(relativePath, blob);
    onChange(relativePath);
  };

  return (
    <HStack align="start" spacing={3}>
      <Box
        boxSize="72px"
        flexShrink={0}
        bg="editorInlineBg"
        border="1px"
        borderColor="editorInlineBorder"
        borderRadius="md"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        {image && (
          <img
            src={image.src}
            alt="Portrait preview"
            style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
          />
        )}
      </Box>
      <VStack align="start" spacing={1} minW={0}>
        {typeof title === 'string' ? (
          <Text fontSize="sm" color="editorText">
            {title}
          </Text>
        ) : (
          title
        )}
        <Text fontSize="xs" color="gray.500" fontFamily="mono" noOfLines={1} wordBreak="break-all">
          {path ?? 'No image'}
        </Text>
        <HStack spacing={2}>
          <Button size="xs" variant="outline" onClick={pick}>
            {path ? 'Change' : 'Pick Image...'}
          </Button>
          {path && !onRemove && (
            <Button size="xs" variant="ghost" color="red.400" onClick={() => onChange(undefined)}>
              Clear
            </Button>
          )}
          {onRemove && (
            <Button size="xs" variant="ghost" color="red.400" onClick={onRemove}>
              Remove
            </Button>
          )}
        </HStack>
      </VStack>
    </HStack>
  );
};
