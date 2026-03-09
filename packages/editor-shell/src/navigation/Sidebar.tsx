import React from 'react';
import { VStack, Spacer } from '@chakra-ui/react';
import { NavIcon } from './NavIcon';
import type { NavItem } from '../types';

export interface SidebarProps<TMode extends string = string> {
  /** Currently active navigation mode */
  activeMode: TMode;
  /** Called when a nav item is clicked */
  onModeChange: (mode: TMode) => void;
  /** Navigation items to display at the top */
  items: NavItem<TMode>[];
  /** Optional items pinned to the bottom (e.g., Settings) */
  bottomItems?: NavItem<TMode>[];
}

/**
 * Sidebar - A vertical icon navigation rail.
 * Generic over the mode type, so it works with any string union.
 *
 * @example
 * ```tsx
 * type MyMode = 'dashboard' | 'editor' | 'settings';
 *
 * const NAV_ITEMS: NavItem<MyMode>[] = [
 *   { mode: 'dashboard', icon: '📊', label: 'Dashboard' },
 *   { mode: 'editor',    icon: '✏️', label: 'Editor' },
 * ];
 *
 * <Sidebar<MyMode>
 *   activeMode={mode}
 *   onModeChange={setMode}
 *   items={NAV_ITEMS}
 *   bottomItems={[{ mode: 'settings', icon: '⚙️', label: 'Settings' }]}
 * />
 * ```
 */
export function Sidebar<TMode extends string = string>({
  activeMode,
  onModeChange,
  items,
  bottomItems,
}: SidebarProps<TMode>) {
  return (
    <VStack spacing={0} h="full" bg="editor.panelBg" borderRight="1px" borderColor="editor.border" w="16" flexShrink={0}>
      {items.map((item) => (
        <NavIcon<TMode>
          key={item.mode}
          icon={item.icon}
          label={item.label}
          mode={item.mode}
          active={activeMode === item.mode}
          onClick={onModeChange}
        />
      ))}
      {bottomItems && bottomItems.length > 0 && (
        <>
          <Spacer />
          {bottomItems.map((item) => (
            <NavIcon<TMode>
              key={item.mode}
              icon={item.icon}
              label={item.label}
              mode={item.mode}
              active={activeMode === item.mode}
              onClick={onModeChange}
            />
          ))}
        </>
      )}
    </VStack>
  );
}
