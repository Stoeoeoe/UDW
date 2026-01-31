import React from 'react';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
    Select,
    FormControl,
    FormLabel,
    Text,
    VStack,
} from '@chakra-ui/react';
import { LayerKind } from '../../../types/schema';
import { LAYER_ICONS } from './layerConstants';

export interface LayerFormData {
    name: string;
    kind: LayerKind;
    zOrder: number;
    icon: string;
}

export interface LayerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    formData: LayerFormData;
    setFormData: (data: LayerFormData) => void;
    isEditing: boolean;
}

export const LayerModal: React.FC<LayerModalProps> = ({
    isOpen,
    onClose,
    onSave,
    formData,
    setFormData,
    isEditing,
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} size="sm" isCentered>
            <ModalOverlay backdropFilter="blur(4px)" />
            <ModalContent bg="gray.900" border="1px" borderColor="gray.700">
                <ModalHeader fontSize="md" pb={2}>
                    {isEditing ? 'Edit Layer' : 'Add Layer'}
                </ModalHeader>
                <ModalBody>
                    <VStack spacing={4} align="stretch">
                        <FormControl>
                            <FormLabel fontSize="xs" fontWeight="bold" textTransform="uppercase" color="gray.500">
                                Name
                            </FormLabel>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Layer name"
                                size="sm"
                                bg="gray.800"
                                autoFocus
                            />
                        </FormControl>

                        <FormControl>
                            <FormLabel fontSize="xs" fontWeight="bold" textTransform="uppercase" color="gray.500">
                                Type
                            </FormLabel>
                            <Select
                                value={formData.kind}
                                onChange={(e) => setFormData({ ...formData, kind: e.target.value as LayerKind })}
                                size="sm"
                                bg="gray.800"
                            >
                                <option value="visual">Visual (Tiles)</option>
                                <option value="collision">Collision</option>
                                <option value="navigation">Navigation</option>
                                <option value="metadata">Metadata</option>
                            </Select>
                        </FormControl>

                        <FormControl>
                            <FormLabel fontSize="xs" fontWeight="bold" textTransform="uppercase" color="gray.500">
                                Z-Order
                            </FormLabel>
                            <Input
                                type="number"
                                value={formData.zOrder}
                                onChange={(e) => setFormData({ ...formData, zOrder: parseInt(e.target.value, 10) || 0 })}
                                size="sm"
                                bg="gray.800"
                            />
                            <Text fontSize="10px" color="gray.500" mt={1}>
                                Lower values render first (behind higher values)
                            </Text>
                        </FormControl>

                        <FormControl>
                            <FormLabel fontSize="xs" fontWeight="bold" textTransform="uppercase" color="gray.500">
                                Icon
                            </FormLabel>
                            <Select
                                value={formData.icon}
                                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                                size="sm"
                                bg="gray.800"
                            >
                                {LAYER_ICONS.map(icon => (
                                    <option key={icon.value} value={icon.value}>{icon.label}</option>
                                ))}
                            </Select>
                        </FormControl>
                    </VStack>
                </ModalBody>
                <ModalFooter pt={4}>
                    <Button variant="ghost" size="sm" mr={2} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button colorScheme="blue" size="sm" onClick={onSave}>
                        {isEditing ? 'Save Changes' : 'Create Layer'}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default LayerModal;
