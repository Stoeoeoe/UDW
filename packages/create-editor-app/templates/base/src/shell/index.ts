/**
 * Shell barrel export.
 *
 * This file re-exports all the editor shell components.
 * In a published workflow you would replace this with:
 *   export * from '@editor-shell/react';
 *
 * For now, the components live inline so the template
 * works standalone with zero extra setup.
 */

// Layouts
export { AppShell } from './layouts/AppShell';
export type { AppShellProps } from './layouts/AppShell';
export { EditorLayout } from './layouts/EditorLayout';
export type { EditorLayoutProps } from './layouts/EditorLayout';
export { ResizableEditorLayout } from './layouts/ResizableEditorLayout';
export type { ResizableEditorLayoutProps } from './layouts/ResizableEditorLayout';

// Navigation
export { Sidebar } from './navigation/Sidebar';
export type { SidebarProps } from './navigation/Sidebar';
export { NavIcon } from './navigation/NavIcon';
export type { NavIconProps } from './navigation/NavIcon';

// Panels
export { PanelShell } from './panels/PanelShell';
export type { PanelShellProps } from './panels/PanelShell';
export { ListPanel } from './panels/ListPanel';
export type { ListPanelProps } from './panels/ListPanel';
export { InspectorPanel, InspectorEmptyState } from './panels/InspectorPanel';
export type { InspectorPanelProps } from './panels/InspectorPanel';

// Common
export { ViewportShell } from './common/ViewportShell';
export type { ViewportShellProps } from './common/ViewportShell';
export { ZoomControls } from './common/ZoomControls';
export type { ZoomControlsProps } from './common/ZoomControls';
export { Toolbar } from './common/Toolbar';
export type { ToolbarProps } from './common/Toolbar';
export { EditorModal } from './common/EditorModal';
export type { EditorModalProps } from './common/EditorModal';
export { EmptyScreen } from './common/EmptyScreen';
export type { EmptyScreenProps } from './common/EmptyScreen';
export { PropertyForm } from './common/PropertyForm';
export type { PropertyFormProps } from './common/PropertyForm';

// Theme
export {
  editorTheme,
  editorColors,
  createEditorTheme,
} from './theme/editorTheme';

// Types
export type {
  NavItem,
  PropertyType,
  PropertySchema,
  ListPanelItem,
  InspectorSection,
  ToolItem,
} from './types';
