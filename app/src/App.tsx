import React, { useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { TopBar } from './components/layout/TopBar';
import { LayersPanel } from './components/panels/LayersPanel';
import { TilesetPanel } from './components/panels/TilesetPanel';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { MapViewport } from './components/viewport/MapViewport';
import clsx from 'clsx';

type EditorMode = 'project' | 'maps' | 'tilesets' | 'entities';

function App() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [editorMode, setEditorMode] = useState<EditorMode>('maps');

  // Navigation Icons
  const NavIcon = ({ icon, label, mode, active }: { icon: string, label: string, mode: EditorMode, active: boolean }) => (
    <button
      onClick={() => setEditorMode(mode)}
      className={clsx(
        "flex flex-col items-center justify-center w-16 h-16 transition-colors relative group",
        active
          ? "bg-slate-800 text-primary-400 border-l-2 border-primary-500"
          : "text-slate-500 hover:bg-slate-800/50 hover:text-slate-300"
      )}
      title={label}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-[9px] mt-0.5 font-medium uppercase tracking-wider">{label}</span>
    </button>
  );

  // Left Panel Content based on mode
  const getLeftPanelContent = () => {
    switch (editorMode) {
      case 'project':
        return (
          <div className="p-4 text-slate-400 text-sm">
            <h3 className="font-bold text-slate-300 mb-2">Project Settings</h3>
            <p>Project editor coming soon...</p>
          </div>
        );
      case 'maps':
        return (
          <div className="flex flex-col h-full">
            {/* Map List */}
            <div className="p-3 border-b border-slate-800">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Maps</h3>
                <button className="text-slate-500 hover:text-white">+</button>
              </div>
              <div className="text-xs text-slate-600">No maps yet</div>
            </div>
            {/* Layers for active map */}
            <div className="flex-1 overflow-hidden">
              <LayersPanel />
            </div>
          </div>
        );
      case 'tilesets':
        return <TilesetPanel />;
      case 'entities':
        return (
          <div className="p-4 text-slate-400 text-sm">
            <h3 className="font-bold text-slate-300 mb-2">Entity Types</h3>
            <p>Entity editor coming soon...</p>
          </div>
        );
      default:
        return null;
    }
  };

  // Main content area based on mode
  const getMainContent = () => {
    switch (editorMode) {
      case 'maps':
        return <MapViewport />;
      case 'tilesets':
        return (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <div className="text-center">
              <div className="text-4xl mb-2">🎨</div>
              <div>Select a tileset to preview</div>
            </div>
          </div>
        );
      case 'project':
      case 'entities':
        return (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <div className="text-center">
              <div className="text-4xl mb-2">⚙️</div>
              <div>Editor view coming soon</div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Left side navigation bar
  const LeftNav = (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-900 w-16 flex-shrink-0">
      <NavIcon icon="📋" label="Project" mode="project" active={editorMode === 'project'} />
      <NavIcon icon="🗺️" label="Maps" mode="maps" active={editorMode === 'maps'} />
      <NavIcon icon="🎨" label="Tiles" mode="tilesets" active={editorMode === 'tilesets'} />
      <NavIcon icon="👾" label="Entities" mode="entities" active={editorMode === 'entities'} />
    </div>
  );

  // Combined left panel (nav + content)
  const LeftPanel = (
    <div className="flex h-full">
      {LeftNav}
      <div className="flex-1 overflow-hidden">
        {getLeftPanelContent()}
      </div>
    </div>
  );

  return (
    <AppLayout
      topBar={<TopBar />}
      leftPanel={LeftPanel}
      rightPanel={<PropertiesPanel />}
      viewport={getMainContent()}
      leftPanelOpen={leftOpen}
      rightPanelOpen={rightOpen}
    />
  );
}

export default App;
