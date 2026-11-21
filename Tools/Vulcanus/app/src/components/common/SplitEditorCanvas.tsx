import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { EditorResizeHandle } from './EditorWorkspaceShell';

/** Keep authoring and preview independently visible; stack them when width is limited. */
export const SplitEditorCanvas: React.FC<{
  primary: React.ReactNode;
  preview: React.ReactNode;
  primaryLabel?: string;
  previewLabel?: string;
}> = ({ primary, preview, primaryLabel = 'Sequence', previewLabel = 'Map preview' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 760));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <Box ref={ref} h="full" minH={0} minW={0}>
      <PanelGroup key={wide ? 'wide' : 'stacked'} direction={wide ? 'horizontal' : 'vertical'}>
        <Panel defaultSize={wide ? 38 : 45} minSize={25}>
          <Box as="section" aria-label={primaryLabel} h="full" minH={0} overflow="auto">
            {primary}
          </Box>
        </Panel>
        <EditorResizeHandle direction={wide ? 'horizontal' : 'vertical'} />
        <Panel defaultSize={wide ? 62 : 55} minSize={30}>
          <Box as="section" aria-label={previewLabel} h="full" minH={0} overflow="hidden">
            {preview}
          </Box>
        </Panel>
      </PanelGroup>
    </Box>
  );
};
