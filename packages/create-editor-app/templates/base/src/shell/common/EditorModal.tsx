import React from 'react';
import { Modal, ModalOverlay, ModalContent } from '@chakra-ui/react';

export interface EditorModalProps { isOpen: boolean; onClose: () => void; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'; }

export const EditorModal: React.FC<EditorModalProps> = ({ isOpen, onClose, children, size = 'xl' }) => (
  <Modal isOpen={isOpen} onClose={onClose} size={size} isCentered>
    <ModalOverlay backdropFilter="blur(4px)" />
    <ModalContent bg="transparent" border="none" boxShadow="none">{children}</ModalContent>
  </Modal>
);
