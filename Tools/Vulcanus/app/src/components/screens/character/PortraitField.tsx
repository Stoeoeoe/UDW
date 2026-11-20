import React from 'react';
import { Box, Button, HStack, Text, VStack } from '@chakra-ui/react';
import { fileSystem } from '../../../lib/fileSystem';
import { useEditorStore } from '../../../store/useEditorStore';

/** Each character's portraits live in their own folder, such as assets/portraits/fabia. */
export const portraitFolder = (characterId: string) => `portraits/${characterId.split(':')[1]}`;

/** Lets the user pick an image file, copies it into the project folder and returns its project-relative path. */
export function usePickPortrait(folder: string): () => Promise<string | undefined> {
  const loadSprite = useEditorStore((state) => state.loadSprite);
  return async () => {
    const absolutePath = await fileSystem.selectAsset();
    if (!absolutePath) return undefined;
    const blob = await fileSystem.readFileAsBlob(absolutePath);
    const filename = absolutePath.replace(/\\/g, '/').split('/').pop() || 'portrait.png';
    const relativePath = await fileSystem.saveAsset(filename, blob, folder);
    await loadSprite(relativePath, blob);
    return relativePath;
  };
}

/** The loaded image for a project-relative portrait path, loading it into the editor on first use. */
export function usePortraitImage(path: string | undefined): HTMLImageElement | undefined {
  const loadSprite = useEditorStore((state) => state.loadSprite);
  const image = useEditorStore((state) => (path ? state.loadedSprites.get(path) : undefined));
  React.useEffect(() => {
    if (!path || image) return;
    void fileSystem.loadAsset(path).then((blob) => loadSprite(path, blob));
  }, [path, image, loadSprite]);
  return image;
}

interface PortraitFieldProps {
  /** Project-relative path of the portrait image, if one is set. */
  path: string | undefined;
  /** Folder under assets/ that a newly picked image is copied into. */
  folder: string;
  onChange: (path: string | undefined) => void;
  /** Shown above the image, for example the emotion's name. */
  title: React.ReactNode;
  /** Removes the whole row; omit for the default portrait, which can only be cleared. */
  onRemove?: () => void;
}

/** Picks one portrait image and previews it. */
export const PortraitField: React.FC<PortraitFieldProps> = ({
  path,
  folder,
  onChange,
  title,
  onRemove,
}) => {
  const image = usePortraitImage(path);
  const pickPortrait = usePickPortrait(folder);

  const pick = async () => {
    const picked = await pickPortrait();
    if (picked) onChange(picked);
  };

  return (
    <VStack
      align="stretch"
      spacing={2}
      p={2}
      borderWidth="1px"
      borderColor="editorShellBorder"
      borderRadius="md"
      title={path}
    >
      <Box
        boxSize="72px"
        alignSelf="center"
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
      {typeof title === 'string' ? (
        <Text fontSize="xs" fontWeight="semibold" color="editorText" noOfLines={1}>
          {title}
        </Text>
      ) : (
        title
      )}
      <HStack spacing={1} wrap="wrap">
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
  );
};
