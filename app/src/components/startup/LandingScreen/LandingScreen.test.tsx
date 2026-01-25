import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LandingScreen } from './index';
import { ChakraProvider } from '@chakra-ui/react';
import React from 'react';
import { useEditorStore } from '../../../store/useEditorStore';
import { fileSystem } from '../../../lib/fileSystem';

// Mock the store
vi.mock('../../../store/useEditorStore', () => ({
    useEditorStore: vi.fn(),
}));

// Mock the fileSystem
vi.mock('../../../lib/fileSystem', () => ({
    fileSystem: {
        openProject: vi.fn(),
        createProject: vi.fn(),
    }
}));

// Mock recentProjects
vi.mock('../../../lib/recentProjects', () => ({
    recentProjects: {
        get: vi.fn(() => []),
    }
}));

const renderWithChakra = (ui: React.ReactElement) => {
    return render(<ChakraProvider>{ui}</ChakraProvider>);
};

describe('LandingScreen', () => {
    const mockLoadProject = vi.fn();
    const mockLoadProjectResources = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (useEditorStore as any).mockImplementation((selector: any) => {
            const state = {
                loadProject: mockLoadProject,
                loadProjectResources: mockLoadProjectResources,
            };
            return selector(state);
        });
    });

    it('should render branding and action cards', () => {
        renderWithChakra(<LandingScreen />);

        expect(screen.getByRole('heading', { name: /Map Editor/i })).toBeInTheDocument();
        expect(screen.getAllByText(/Open Project/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/New Project/i)[0]).toBeInTheDocument();
    });

    it('should call fileSystem.openProject when Open Project is clicked', async () => {
        const mockProject = { name: 'Test Project' };
        const mockPath = '/test/path';
        (fileSystem.openProject as any).mockResolvedValue({ project: mockProject, path: mockPath });

        renderWithChakra(<LandingScreen />);

        const openCard = screen.getAllByText(/Open Project/i)[0];
        fireEvent.click(openCard);

        await waitFor(() => {
            expect(fileSystem.openProject).toHaveBeenCalled();
            expect(mockLoadProject).toHaveBeenCalledWith(mockPath, mockProject);
            expect(mockLoadProjectResources).toHaveBeenCalled();
        });
    });

    it('should open the new project modal when New Project is clicked', async () => {
        renderWithChakra(<LandingScreen />);

        const newCard = screen.getAllByText(/New Project/i)[0];
        fireEvent.click(newCard);

        expect(await screen.findByLabelText(/Project Name/i)).toBeInTheDocument();
    });
});
