import { FieldLabel } from '../../common/Typography';
import React, { useState } from 'react';
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { qualifyResourceId } from '../../../lib/resourceIds';
import { newQuestGraph } from '../../../lib/questGraph';

export function CreateQuestDialog({
  folderPath,
  onClose,
  onCreated,
}: {
  folderPath: string;
  onClose: () => void;
  onCreated: (id: string, title: string) => void;
}) {
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const store = useEditorStore.getState();
      const qualified = qualifyResourceId(id, store.project?.idPrefix);
      await store.addQuest({
        formatVersion: 1,
        id: qualified,
        title,
        description: title,
        folderPath,
        editorGraph: newQuestGraph('step-1'),
        steps: [
          {
            id: 'step-1',
            journal: 'Complete the first objective.',
            objectives: [
              {
                id: 'objective-1',
                kind: 'condition',
                text: 'New objective',
                condition: 'false',
              },
            ],
          },
        ],
      });
      onCreated(qualified, title);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create quest</ModalHeader>
        <ModalBody>
          <FormControl>
            <FieldLabel>Stable quest ID</FieldLabel>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="festival_wine" />
          </FormControl>
          <FormControl mt={3}>
            <FieldLabel>Title</FieldLabel>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormControl>
          {error && (
            <Text role="alert" color="red.300">
              {error}
            </Text>
          )}
        </ModalBody>
        <ModalFooter gap={2}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            colorScheme="orange"
            isDisabled={!id.trim() || !title.trim()}
            isLoading={busy}
            onClick={() => void create()}
          >
            Create quest
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
