import React, { useState } from 'react';
import { Button, FormControl, HStack, Input, Text, VStack, useToast } from '@chakra-ui/react';
import { EditorModal } from '../common/EditorModal';
import { Tileset } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import { useEditorStore } from '../../store/useEditorStore';
import { resolveSpriteAsset } from '../../lib/asepriteUtils';
import { useProject } from '../../hooks/useProject';
import { MutedFieldLabel } from '../common/Typography.tsx';
import { EditorCard } from '../common/Surfaces';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tileset: Tileset;
}

export const TilesetMetadataDialog: React.FC<Props> = ({ isOpen, onClose, tileset }) => {
  const { tileSize } = useProject();
  const updateTileset = useEditorStore((s) => s.updateTileset);
  const loadSprite = useEditorStore.getState().loadSprite;
  const [name, setName] = useState(tileset.name);
  const [spritePath, setSpritePath] = useState(tileset.spriteSheet);
  const [columns, setColumns] = useState(tileset.columns);
  const [isProcessing, setProcessing] = useState(false);
  const toast = useToast();

  const handleSelectSprite = async () => {
    try {
      const selected = await fileSystem.selectAsset();
      if (!selected) return;

      // If the selected path looks like an already-relative project asset, use it directly.
      const isRelativeAsset =
        selected.startsWith('assets/') ||
        selected.startsWith('./') ||
        selected.startsWith('assets\\');
      let blob: Blob;
      let finalPath = selected;

      if (isRelativeAsset) {
        // load blob directly
        blob = await fileSystem.loadAsset(selected);
      } else {
        // external absolute path selected from the user's FS — copy into project assets
        blob = await fileSystem.readFileAsBlob(selected);
        const filename = selected.split(/[\\/]/).pop() || `asset-${Date.now()}`;
        try {
          finalPath = await fileSystem.saveAsset(filename, blob);
        } catch (err) {
          // If saving fails, fall back to using the original selected path
          finalPath = selected;
        }
      }

      setSpritePath(finalPath);
      const resolved = await resolveSpriteAsset(finalPath, blob);
      if (tileSize > 0) {
        setColumns(Math.floor(resolved.width / tileSize));
      }
    } catch (e: unknown) {
      toast({
        title: 'Failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        status: 'error',
      });
    }
  };

  const handleSave = async () => {
    setProcessing(true);
    try {
      const finalColumns = Math.max(1, Math.floor(columns));

      // Compute rows based on sprite height when possible, otherwise
      // fall back to previous tileset data (preserving existing counts).
      let rows = Math.max(1, Math.floor(tileset.tileCount / Math.max(1, tileset.columns)));
      try {
        const blob = await fileSystem.loadAsset(spritePath);
        const resolved = await resolveSpriteAsset(spritePath, blob);
        rows = Math.max(1, Math.floor(resolved.height / tileSize));
      } catch (err) {
        // ignore and use fallback rows
      }

      const updated: Partial<Tileset> = {
        name: name || tileset.name,
        spriteSheet: spritePath,
        columns: finalColumns,
        tileCount: Math.max(1, finalColumns * rows),
      };

      await updateTileset(tileset.id, updated);

      // If sprite changed, load it into memory for preview
      if (spritePath !== tileset.spriteSheet) {
        try {
          const blob = await fileSystem.loadAsset(spritePath);
          await loadSprite(spritePath, blob);
        } catch (e) {
          // ignore asset load errors but notify
          toast({ title: 'Sprite load failed', description: String(e), status: 'warning' });
        }
      }

      toast({ title: 'Tileset saved', status: 'success' });
      onClose();
    } catch (e: unknown) {
      toast({
        title: 'Failed to save',
        description: e instanceof Error ? e.message : 'Unknown error',
        status: 'error',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <EditorModal isOpen={isOpen} onClose={onClose}>
      <EditorCard p={6} w="lg">
        <VStack align="stretch" spacing={4}>
          <VStack align="start" spacing={0}>
            <Text color="white" fontSize="lg" fontWeight="bold">
              Tileset Metadata
            </Text>
            <Text color="gray.500" fontSize="sm">
              Edit tileset name, image and tile sizing.
            </Text>
          </VStack>

          <FormControl>
            <MutedFieldLabel>Name</MutedFieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              bg="editorPanelBg"
              borderColor="editorBorderLight"
            />
          </FormControl>

          <FormControl>
            <MutedFieldLabel>Sprite Image</MutedFieldLabel>
            <HStack>
              <Input value={spritePath} bg="editorPanelBg" borderColor="editorBorderLight" />
              <Button size="sm" onClick={handleSelectSprite} isLoading={isProcessing}>
                Choose
              </Button>
            </HStack>
          </FormControl>

          <FormControl>
            <MutedFieldLabel>Columns</MutedFieldLabel>
            <Input
              type="number"
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
              bg="editorPanelBg"
              borderColor="editorBorderLight"
            />
          </FormControl>

          <HStack justify="flex-end">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="blue" isLoading={isProcessing} onClick={handleSave}>
              Save
            </Button>
          </HStack>
        </VStack>
      </EditorCard>
    </EditorModal>
  );
};

export default TilesetMetadataDialog;
