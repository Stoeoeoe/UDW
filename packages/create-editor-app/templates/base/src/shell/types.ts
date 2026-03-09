export interface NavItem<TMode extends string = string> {
  mode: TMode;
  icon: string;
  label: string;
}

export type PropertyType = 'string' | 'number' | 'boolean' | 'enum' | 'custom';

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

export interface ListPanelItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface InspectorSection {
  title?: string;
  content: React.ReactNode;
}

export interface ToolItem {
  id: string;
  icon: import('react-icons').IconType;
  label: string;
  group?: string;
}
