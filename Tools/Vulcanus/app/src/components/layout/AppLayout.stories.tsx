import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppLayout } from './AppLayout';

const meta: Meta<typeof AppLayout> = {
  title: 'Layout/AppLayout',
  component: AppLayout,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AppLayout>;

// Helper components for slot content
const MockPanel = ({ title, color = 'bg-slate-800' }: { title: string; color?: string }) => (
  <div className={`h-full w-full ${color} p-4`}>
    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">{title}</h2>
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-2 w-full bg-slate-700 rounded opacity-20" />
      ))}
    </div>
  </div>
);

const MockViewport = () => (
  <div className="w-full h-full bg-[radial-gradient(#333_1px,transparent_1px)] bg-size-[16px_16px] flex items-center justify-center text-slate-600">
    Grid Canvas Area
  </div>
);

const MockTopBar = () => (
  <div className="flex items-center justify-between h-full px-4">
    <div className="flex space-x-4">
      <span className="font-bold text-slate-100">Editor</span>
      <span className="text-slate-500">File</span>
      <span className="text-slate-500">Edit</span>
      <span className="text-slate-500">View</span>
    </div>
    <div className="flex space-x-2">
      <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white text-xs">
        P
      </div>
      <div className="w-8 h-8 bg-slate-700 rounded"></div>
    </div>
  </div>
);

export const Default: Story = {
  args: {
    topBar: <MockTopBar />,
    leftPanel: <MockPanel title="Layers" />,
    rightPanel: <MockPanel title="Properties" />,
    viewport: <MockViewport />,
    leftPanelOpen: true,
    rightPanelOpen: true,
  },
};

export const PanelsClosed: Story = {
  args: {
    ...Default.args,
    leftPanelOpen: false,
    rightPanelOpen: false,
  },
};
