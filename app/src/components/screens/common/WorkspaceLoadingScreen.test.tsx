import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../../../theme';
import { WorkspaceLoadingScreen } from './WorkspaceLoadingScreen';

describe('WorkspaceLoadingScreen', () => {
  it('renders the active project and loading phase', () => {
    render(
      <ChakraProvider theme={theme}>
        <WorkspaceLoadingScreen
          projectName="Loading Test Project"
          label="Loading locations"
          progress={0.9}
        />
      </ChakraProvider>,
    );

    expect(screen.getByText('Loading Test Project')).toBeInTheDocument();
    expect(screen.getByText('Loading locations')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });
});
