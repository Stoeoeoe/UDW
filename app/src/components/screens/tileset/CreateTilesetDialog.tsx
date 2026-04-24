import React, { useState } from 'react';
import { Box, Button, FormControl, HStack, Image, Input, useToast } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { fileSystem } from '../../../lib/fileSystem';
import { resolveSpriteAsset } from '../../../lib/asepriteUtils';
import type { TileDefinition } from '../../../types/schema';
import { useProject } from '../../../hooks/useProject';
import { EditorModal } from '../../common/EditorModal';
import { EntityFormDialog } from '../common';
import { MutedFieldLabel } from '../../common/Typography.tsx';

interface CreateTilesetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  folderPath?: string;
  onCreatedTilesetId?: (tilesetId: string) => void;
}

export const CreateTilesetDialog: React.FC<CreateTilesetDialogProps> = ({
  isOpen,
  onClose,
  folderPath,
  onCreatedTilesetId,
}) => {
  const addTileset = useEditorStore((s) => s.addTileset);
  const { tileSize } = useProject();
  const toast = useToast();

  const [name, setName] = useState('New Tileset');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);
  const [isProcessing, setProcessing] = useState(false);

  React.useEffect(() => {
    return () => {
      if (!previewUrl) return;
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleSelectFile = async () => {
    try {
      const path = await fileSystem.selectAsset();
      if (!path) return;
      const b = await fileSystem.readFileAsBlob(path);
      const resolved = await resolveSpriteAsset(path, b);
      const url = URL.createObjectURL(resolved.imageBlob);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setFilePath(path);
      setBlob(b);
      setPreviewUrl(url);
      setImageDimensions({ w: resolved.width, h: resolved.height });
      setName((n) =>
        n === 'New Tileset'
          ? path
              .split(/[\\/]/)
              .pop()
              ?.replace(/\.[^/.]+$/, '') || n
          : n,
      );
    } catch (e: unknown) {
      toast({
        title: 'File error',
        description: e instanceof Error ? e.message : 'Unknown error',
        status: 'error',
      });
    }
  };

  const handleCreate = async () => {
    if (!blob) {
      toast({ title: 'No image selected', status: 'warning' });
      return;
    }
    setProcessing(true);
    try {
      const filename = filePath?.split(/[\\/]/).pop() || name.replace(/\s+/g, '-');
      const internalPath = await fileSystem.saveAsset(filename, blob);

      const dimensions =
        imageDimensions ??
        (() => {
          throw new Error('Image dimensions are unavailable. Re-select the sprite image.');
        })();

      const columns = Math.floor(dimensions.w / tileSize) || 1;
      const rows = Math.floor(dimensions.h / tileSize) || 1;
      const tileCount = columns * rows;

      const tiles: Record<number, TileDefinition> = {};
      for (let i = 0; i < tileCount; i++) {
        const col = i % columns;
        const row = Math.floor(i / columns);
        tiles[i] = { id: `tile_${col}_${row}`, spriteIndex: i, collision: { type: 'none' } };
      }

      const newTileset = {
        version: 1,
        id: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name,
        spriteSheet: internalPath,
        columns,
        tileCount,
        tiles,
        wangSets: [],
        folderPath: folderPath?.trim() || undefined,
      };

      await addTileset(newTileset);
      onCreatedTilesetId?.(newTileset.id);
      toast({ title: 'Tileset created', status: 'success' });
      onClose();
    } catch (e: unknown) {
      toast({
        title: 'Create failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        status: 'error',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <EditorModal isOpen={isOpen} onClose={onClose}>
      <EntityFormDialog
        title="Create Tileset"
        onCancel={onClose}
        onSubmit={handleCreate}
        submitLabel={isProcessing ? 'Creating...' : 'Create Tileset'}
        isSubmitDisabled={!blob || isProcessing}
      >
        <FormControl>
          <MutedFieldLabel>Name</MutedFieldLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            bg="gray.950"
            borderColor="gray.700"
          />
        </FormControl>

        <FormControl>
          <MutedFieldLabel>Sprite Image</MutedFieldLabel>
          <HStack>
            <Input value={filePath || ''} readOnly bg="gray.950" borderColor="gray.700" />
            <Button size="sm" onClick={handleSelectFile}>
              Choose
            </Button>
          </HStack>
        </FormControl>

        {previewUrl && (
          <Box bg="blackAlpha.400" p={2} rounded="md" maxH={200} overflow="hidden">
            <Image
              src={previewUrl}
              maxH={160}
              objectFit="contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </Box>
        )}
      </EntityFormDialog>
    </EditorModal>
  );
};
