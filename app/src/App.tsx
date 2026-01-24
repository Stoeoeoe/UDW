import React, { useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { TopBar } from './components/layout/TopBar';
import { LayersPanel } from './components/panels/LayersPanel';
import { TilesetPanel } from './components/panels/TilesetPanel';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { MapViewport } from './components/viewport/MapViewport';
import clsx from 'clsx';

function App() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState<'layers' | 'tilesets'>('layers');

  // Left Panel Content with Tabs
  const LeftPanel = (
    <div className="flex flex-col h-full">
      {/* Tab Headers */}
      <div className="flex border-b border-neutral-800 bg-neutral-900">
        <button
          className={clsx("flex-1 py-2 text-xs font-bold uppercase tracking-wider hover:bg-neutral-800 transition-colors", activeLeftTab === 'layers' ? "text-blue-400 border-b-2 border-blue-500" : "text-neutral-500")}
          onClick={() => setActiveLeftTab('layers')}
        >
          Layers
        </button>
        <button
          className={clsx("flex-1 py-2 text-xs font-bold uppercase tracking-wider hover:bg-neutral-800 transition-colors", activeLeftTab === 'tilesets' ? "text-blue-400 border-b-2 border-blue-500" : "text-neutral-500")}
          onClick={() => setActiveLeftTab('tilesets')}
        >
          Tilesets
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeLeftTab === 'layers' ? <LayersPanel /> : <TilesetPanel />}
      </div>
    </div>
  );

  return (
    <AppLayout
      topBar={<TopBar />}
      leftPanel={LeftPanel}
      rightPanel={<PropertiesPanel />}
      viewport={<MapViewport />}
      leftPanelOpen={leftOpen}
      rightPanelOpen={rightOpen}
    />
  );
}

export default App;
