/**
 * Shared type definitions for the editor shell package.
 * These are generic — no domain-specific types.
 */

/** A navigation item for the Sidebar */
export interface NavItem<TMode extends string = string> {
  mode: TMode;
  icon: string;
  label: string;
}

/** Property type for schema-driven forms */
export type PropertyType = 'string' | 'number' | 'boolean' | 'enum' | 'custom';

/** Schema definition for a single property field */
export interface PropertySchema {
  key: string;
  label: string;
  type: PropertyType;
  description?: string;
  constraints?: {
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
  };
  customRenderer?: (value: any, onChange: (v: any) => void) => React.ReactNode;
}

/** An item in a ListPanel */
export interface ListPanelItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

/** A section in an InspectorPanel */
export interface InspectorSection {
  title?: string;
  content: React.ReactNode;
}

/** A tool entry for the Toolbar */
export interface ToolItem {
  id: string;
  icon: import('react-icons').IconType;
  label: string;
  group?: string;
}
