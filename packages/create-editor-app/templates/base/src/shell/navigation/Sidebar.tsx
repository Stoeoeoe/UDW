import React from 'react';
import { VStack, Spacer } from '@chakra-ui/react';
import { NavIcon } from './NavIcon';
import type { NavItem } from '../types';

export interface SidebarProps<TMode extends string = string> {
  activeMode: TMode;
  onModeChange: (mode: TMode) => void;
  items: NavItem<TMode>[];
  bottomItems?: NavItem<TMode>[];
}

export function Sidebar<TMode extends string = string>({
  activeMode,
  onModeChange,
  items,
  bottomItems,
}: SidebarProps<TMode>) {
  return (
    <VStack
      spacing={0}
      h="full"
      bg="editor.panelBg"
      borderRight="1px"
      borderColor="editor.border"
      w="16"
      flexShrink={0}
    >
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
