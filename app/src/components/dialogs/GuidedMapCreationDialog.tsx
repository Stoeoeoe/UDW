import React from 'react';
import { EditorModal } from '../common/EditorModal';
import { CreateTilesetDialog } from '../screens/tileset/CreateTilesetDialog';
import { MapCreator } from './MapCreator';

interface GuidedMapCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  folderPath?: string;
  onCreatedMapId?: (mapId: string) => void;
}

export const GuidedMapCreationDialog: React.FC<GuidedMapCreationDialogProps> = ({
  isOpen,
  onClose,
  folderPath,
  onCreatedMapId,
}) => {
  const [isCreatingTileset, setIsCreatingTileset] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setIsCreatingTileset(false);
    }
  }, [isOpen]);

  const returnToMapCreation = React.useCallback(() => {
    setIsCreatingTileset(false);
  }, []);

  return (
    <>
      <EditorModal isOpen={isOpen && !isCreatingTileset} onClose={onClose}>
        <MapCreator
          onCreate={onClose}
          onCancel={onClose}
          folderPath={folderPath}
          onCreatedMapId={onCreatedMapId}
          onRequestCreateTileset={() => setIsCreatingTileset(true)}
        />
      </EditorModal>

      <CreateTilesetDialog
        isOpen={isOpen && isCreatingTileset}
        onClose={returnToMapCreation}
        onCreatedTilesetId={returnToMapCreation}
      />
    </>
  );
};
