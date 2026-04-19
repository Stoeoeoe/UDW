import React from 'react';
import { Modal, ModalOverlay, ModalContent } from '@chakra-ui/react';

export interface EditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  title?: string;
}

/**
 * EditorModal - A unified modal wrapper with consistent styling across the app.
 */
export const EditorModal: React.FC<EditorModalProps> = ({
  isOpen,
  onClose,
  children,
  size = 'xl',
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size={size} isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg="transparent" border="none" boxShadow="none">
        {children}
      </ModalContent>
    </Modal>
  );
};

export default EditorModal;
