import React, { useState } from 'react';
import clsx from 'clsx';
import { useEditorStore } from '../../store/useEditorStore';
import { ToolType } from '../../types/editor';
import { ProjectSettingsEditor } from '../dialogs/ProjectSettingsEditor';
import { fileSystem } from '../../lib/fileSystem';
import { Project } from '../../types/schema';

// Icons
const CursorIcon = () => <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z" /></svg>;
const PaintBrushIcon = () => <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11 2a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h6z M6.5 7a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3z" /></svg>;
const EraserIcon = () => <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828l6.879-6.879zm2.121.707a1 1 0 0 0-1.414 0L4.16 7.547l5.293 5.293 4.633-4.633a1 1 0 0 0 0-1.414l-3.879-3.879zM8.746 13.547 3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293l.16-.16z" /></svg>;

const TOOL_BUTTONS: { id: ToolType; icon: React.FC; label: string }[] = [
    { id: 'select', icon: CursorIcon, label: 'Select (V)' },
    { id: 'tilePaint', icon: PaintBrushIcon, label: 'Paint (B)' },
    { id: 'tileErase', icon: EraserIcon, label: 'Erase (E)' },
];

export const TopBar: React.FC = () => {
    const activeTool = useEditorStore(state => state.activeTool);
    const setActiveTool = useEditorStore(state => state.setActiveTool);
    const loadProject = useEditorStore(state => state.loadProject);

    const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
    const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);

    // Handlers
    const handleNewProject = () => {
        setIsFileMenuOpen(false);
        setIsProjectDialogOpen(true);
    };

    const handleOpenProject = async () => {
        setIsFileMenuOpen(false);
        try {
            // @ts-ignore - window.showDirectoryPicker is experimental
            if (!window.showDirectoryPicker) {
                alert("Your browser does not support the File System Access API. Please use Chrome or Edge.");
                return;
            }

            const { project, handle } = await fileSystem.openProject();
            await loadProject(handle.name, project);
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error(e);
                alert(e.message || "Failed to open project");
            }
        }
    };

    const handleSaveNewProject = async (project: Project) => {
        try {
            // @ts-ignore
            if (!window.showDirectoryPicker) {
                alert("Your browser does not support the File System Access API.");
                return;
            }

            const handle = await fileSystem.createProject(project);
            await loadProject(handle.name, project);
            setIsProjectDialogOpen(false);
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error(e);
                alert(e.message || "Failed to create project");
            }
        }
    };

    return (
        <>
            <div className="flex items-center justify-between h-full px-4 select-none relative z-50">
                {/* Left: Branding & Menus */}
                <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-primary-600 rounded-md flex items-center justify-center font-bold text-white text-xs shadow-sm">
                            ED
                        </div>
                        <span className="font-semibold text-slate-300 text-sm tracking-tight">PixelEditor</span>
                    </div>

                    <div className="h-6 w-px bg-slate-700" />

                    <div className="flex space-x-4 text-xs font-medium text-slate-400 relative">
                        <button
                            className="hover:text-slate-100 transition-colors focus:outline-none"
                            onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
                        >
                            File
                        </button>

                        {/* File Menu Dropdown */}
                        {isFileMenuOpen && (
                            <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded shadow-xl py-1 z-50 flex flex-col items-start">
                                <button onClick={handleNewProject} className="w-full text-left px-4 py-2 hover:bg-slate-700 text-slate-200">New Project...</button>
                                <button onClick={handleOpenProject} className="w-full text-left px-4 py-2 hover:bg-slate-700 text-slate-200">Open Project...</button>
                                <div className="h-px bg-slate-700 w-full my-1"></div>
                                <button className="w-full text-left px-4 py-2 hover:bg-slate-700 text-slate-200">Exit</button>
                            </div>
                        )}
                        {/* Invisible Overlay to close menu */}
                        {isFileMenuOpen && (
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setIsFileMenuOpen(false)}
                            />
                        )}

                        <button className="hover:text-slate-100 transition-colors">Edit</button>
                        <button className="hover:text-slate-100 transition-colors">View</button>
                        <button className="hover:text-slate-100 transition-colors">Window</button>
                    </div>
                </div>

                {/* Center: Toolbar */}
                <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-lg border border-slate-700/50">
                    {TOOL_BUTTONS.map((tool) => (
                        <button
                            key={tool.id}
                            onClick={() => setActiveTool(tool.id)}
                            title={tool.label}
                            className={clsx(
                                "p-1.5 rounded-md transition-all duration-150",
                                activeTool === tool.id
                                    ? "bg-slate-600 text-white shadow-sm"
                                    : "text-slate-400 hover:bg-slate-700/50 hover:text-slate-300"
                            )}
                        >
                            <tool.icon />
                        </button>
                    ))}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center space-x-3">
                    <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md shadow-sm transition-colors border border-blue-500">
                        Export
                    </button>
                </div>
            </div>

            {/* Dialogs Overlay */}
            {isProjectDialogOpen && (
                <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <ProjectSettingsEditor
                        onSave={handleSaveNewProject}
                        onCancel={() => setIsProjectDialogOpen(false)}
                    />
                </div>
            )}
        </>
    );
};
