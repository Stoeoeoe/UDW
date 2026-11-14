import React, { useState } from 'react';
import { Badge, Input, Select, Text, Textarea } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { saveStoryValueDeclarations as save } from '../../../store/storyValues';
import type { StoryValueDefinition } from '../../../types/schema';
import { TopTabbedEditorLayout } from '../common/TopTabbedEditorLayout';
import { DialogListWorkspace } from '../common/DialogListWorkspace';
import { EntityFormDialog } from '../common/EntityFormDialog';
import { EditorModal } from '../../common/EditorModal';
import { FormLabel } from '../../common/FormLabel';

export const DataEditor: React.FC = () => {
  const project = useEditorStore((s) => s.project);
  const values = project?.storyValues ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<StoryValueDefinition>({ key: '', type: 'boolean' });

  const open = (key: string) => {
    const value = values.find((v) => v.key === key);
    if (!value) throw new Error(`Missing story declaration: ${key}`);
    setDraft({ ...value });
    setEditing(key);
  };
  const add = () => {
    let key = 'new_value';
    for (let index = 2; values.some((v) => v.key === key); index++) key = `new_value_${index}`;
    const value: StoryValueDefinition = { key, type: 'boolean', description: '' };
    save([...values, value]);
    setDraft(value);
    setEditing(key);
  };
  const error = !draft.key.trim()
    ? 'Enter a key.'
    : values.some((v) => v.key === draft.key && v.key !== editing)
      ? 'This key is already declared.'
      : undefined;

  return (
    <>
      <TopTabbedEditorLayout
        title="Data"
        tabs={[{ id: 'story', label: 'Story Values', badge: values.length }]}
        activeTab="story"
        onTabChange={() => {}}
        mainContent={
          <DialogListWorkspace
            title="Story Values"
            description="Declare saved story keys and types for completion and warnings. Undeclared keys remain allowed; declarations do not create runtime values."
            items={values.map((v) => ({
              id: v.key,
              title: v.key,
              subtitle: v.description,
              badge: <Badge>{v.type}</Badge>,
            }))}
            addLabel="Add Story Value"
            onAdd={add}
            onOpenItem={open}
            onDeleteItem={(key) => save(values.filter((v) => v.key !== key))}
            enableSearch
            emptyTitle="No story values declared"
            emptyDescription="Declare keys used by cutscenes, dialogue and game code."
          />
        }
      />
      <EditorModal isOpen={editing !== null} onClose={() => setEditing(null)} size="lg">
        <EntityFormDialog
          title="Edit Story Value"
          onCancel={() => setEditing(null)}
          isSubmitDisabled={!!error}
          onSubmit={() => {
            save(values.map((v) => (v.key === editing ? draft : v)));
            setEditing(null);
          }}
        >
          <FormLabel>Key</FormLabel>
          <Input
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            placeholder="met_blacksmith"
          />
          <FormLabel>Type</FormLabel>
          <Select
            value={draft.type}
            onChange={(e) =>
              setDraft({ ...draft, type: e.target.value as StoryValueDefinition['type'] })
            }
          >
            <option value="boolean">Boolean</option>
            <option value="long">Long (integer)</option>
            <option value="double">Double (number)</option>
            <option value="string">String</option>
            <option value="object">Object / dictionary</option>
          </Select>
          <FormLabel>Description</FormLabel>
          <Textarea
            value={draft.description ?? ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <Text fontSize="xs" color="gray.400">
            Use GameState.Story.Get("{draft.key}") and Set("{draft.key}", value). Object values use
            nested string-keyed Lua tables.
          </Text>
          {error && <Text color="red.300">{error}</Text>}
        </EntityFormDialog>
      </EditorModal>
    </>
  );
};
