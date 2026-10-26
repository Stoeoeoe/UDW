import React, { useEffect, useState } from 'react';
import { Badge, Button, HStack, Input, Text, VStack, useToast } from '@chakra-ui/react';
import { DetailPanel } from '../../common/DetailPanel';
import { Field, InspectorSection } from '../../common/Fields';
import { SectionLabel } from '../../common/Typography';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';

export const ScriptingManifestSettings: React.FC = () => {
  const filename = useScriptingManifestStore((s) => s.path);
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const status = useScriptingManifestStore((s) => s.status);
  const error = useScriptingManifestStore((s) => s.error);
  const lastReadAt = useScriptingManifestStore((s) => s.lastReadAt);
  const [draftPath, setDraftPath] = useState(filename);
  const toast = useToast();
  useEffect(() => setDraftPath(filename), [filename]);
  const native = 'ipcRenderer' in window;
  useEffect(() => {
    if (!native || draftPath.trim() === filename) return;
    const timer = window.setTimeout(() => {
      void useScriptingManifestStore.getState().setPath(draftPath);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftPath, filename, native]);
  const chooseFile = async () => {
    try {
      const selected = (await window.ipcRenderer.invoke('app:scripting-manifest-select')) as
        | string
        | null;
      if (selected) await useScriptingManifestStore.getState().setPath(selected);
    } catch (e) {
      toast({
        title: 'Could not choose Lua manifest',
        description: (e as Error).message,
        status: 'error',
        isClosable: true,
      });
    }
  };

  return (
    <DetailPanel>
      <VStack align="stretch" spacing={6}>
        <InspectorSection title="Lua manifest">
          <Text textStyle="helperText">
            Unity's exported Lua bindings are shared by the entire editor. Choose their filesystem
            location once; changes to that file are read automatically while any screen is open.
          </Text>
          <Field
            label="Manifest filesystem location"
            helperText="Use the absolute path to Unity's Generated/Scripting/bindings.json. Watching starts automatically and resumes when the editor opens."
          >
            <Input
              fontFamily="mono"
              value={draftPath}
              placeholder="C:\GameDev\MyGame\Generated\Scripting\bindings.json"
              onChange={(e) => setDraftPath(e.target.value)}
              onBlur={() => {
                if (native && draftPath.trim() !== useScriptingManifestStore.getState().path)
                  void useScriptingManifestStore.getState().setPath(draftPath);
              }}
            />
          </Field>
          <HStack>
            <Button isDisabled={!native} onClick={() => void chooseFile()}>
              Browse…
            </Button>
            <Button
              variant="ghost"
              isDisabled={!filename && !draftPath}
              onClick={() => {
                setDraftPath('');
                void useScriptingManifestStore.getState().setPath('');
              }}
            >
              Clear location
            </Button>
          </HStack>
          <HStack>
            <Badge colorScheme={status === 'ready' ? 'green' : status === 'error' ? 'red' : 'gray'}>
              {status === 'ready' ? 'Watching' : status}
            </Badge>
            {lastReadAt && (
              <Text textStyle="helperText">
                Last read {new Date(lastReadAt).toLocaleTimeString()}
              </Text>
            )}
          </HStack>
          {error && (
            <Text role="alert" color="red.300">
              {error}
            </Text>
          )}
        </InspectorSection>
        {manifest && (
          <InspectorSection title="Available Lua API">
            <Text textStyle="helperText">
              Manifest v{manifest.schemaVersion} · {manifest.modules.length} modules ·{' '}
              {manifest.modules.reduce((count, module) => count + module.methods.length, 0)} methods
            </Text>
            {manifest.modules.map((module) => (
              <VStack key={module.path} align="stretch" spacing={2}>
                <SectionLabel>{module.path}</SectionLabel>
                {module.methods.map((method) => (
                  <VStack key={method.name} align="stretch" spacing={1}>
                    <Text fontFamily="mono" fontSize="sm">
                      {module.path}.{method.name}(
                      {method.parameters.map((p) => `${p.name}: ${p.type}`).join(', ')}) →{' '}
                      {method.returnType ?? 'nil'}
                    </Text>
                    {method.action && (
                      <HStack>
                        <Badge>{method.action.execution}</Badge>
                        <Text textStyle="helperText">
                          {method.action.contexts.join(', ')} · {method.action.description}
                        </Text>
                      </HStack>
                    )}
                  </VStack>
                ))}
              </VStack>
            ))}
          </InspectorSection>
        )}
      </VStack>
    </DetailPanel>
  );
};
