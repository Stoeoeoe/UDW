import React from 'react';
import { ChakraProvider, Button } from '@chakra-ui/react';
import { render, screen } from '@testing-library/react';
import { FiStar } from 'react-icons/fi';
import { describe, expect, it } from 'vitest';
import { EditorDocumentFrame, EditorHeaderActions } from './EditorDocumentFrame';
import { InspectorShell, InspectorEmptyState } from './InspectorShell';

describe('editor document structure', () => {
  it('places nested editor Settings in the document header without a duplicate heading', () => {
    render(
      <ChakraProvider>
        <EditorDocumentFrame
          title="Wine festival"
          resourceId="base:festival"
          icon={FiStar}
          layout="sequence"
        >
          <EditorHeaderActions>
            <Button>Settings</Button>
          </EditorHeaderActions>
          <div>Step cards</div>
        </EditorDocumentFrame>
      </ChakraProvider>,
    );
    expect(screen.getAllByRole('heading', { name: 'Wine festival' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Settings' }).closest('header')).toBeTruthy();
  });
  it('shows an inspector empty state when every conditional child is absent', () => {
    render(
      <ChakraProvider>
        <InspectorShell
          title="Properties"
          emptyState={<InspectorEmptyState message="Select a card" />}
        >
          {false && <div>Fields</div>}
          {null}
        </InspectorShell>
      </ChakraProvider>,
    );
    expect(screen.getByText('Select a card')).toBeTruthy();
  });
});
