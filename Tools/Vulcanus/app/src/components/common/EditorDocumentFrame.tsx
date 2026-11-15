import React, { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Box, Flex, HStack, Icon, Text } from '@chakra-ui/react';
import type { IconType } from 'react-icons';
import { DetailPanel } from './DetailPanel';

export type EditorLayout = 'form' | 'sequence' | 'canvas' | 'utility';
const HeaderActionsHost = createContext<HTMLElement | null | undefined>(undefined);

/** The workspace owns this frame; editor bodies cannot replace its header. */
export function EditorDocumentFrame({
  title,
  resourceId,
  icon,
  layout,
  toolbar,
  children,
}: React.PropsWithChildren<{
  title: string;
  resourceId?: string | null;
  icon: IconType;
  layout: EditorLayout;
  toolbar?: React.ReactNode;
}>) {
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  return (
    <HeaderActionsHost.Provider value={actionsHost}>
      <Flex
        direction="column"
        h="full"
        minH={0}
        minW={0}
        overflow="hidden"
        data-editor-layout={layout}
      >
        <HStack
          as="header"
          aria-label="Document header"
          spacing={3}
          px={4}
          h="56px"
          flexShrink={0}
          bg="editorHeaderBg"
          borderBottomWidth="1px"
          borderColor="editorShellBorder"
        >
          <Icon as={icon} color="editorMutedText" boxSize={5} />
          <Box flex={1} minW={0}>
            <Text as="h1" fontSize="sm" fontWeight="semibold" noOfLines={1}>
              {title}
            </Text>
            {resourceId && (
              <Text fontSize="xs" fontFamily="mono" color="editorMutedText" noOfLines={1}>
                {resourceId}
              </Text>
            )}
          </Box>
          <HStack ref={setActionsHost} spacing={2} />
        </HStack>
        {toolbar && <EditorDocumentToolbar>{toolbar}</EditorDocumentToolbar>}
        <Box flex={1} minH={0} minW={0} overflow="hidden">
          {layout === 'form' ? <DetailPanel>{children}</DetailPanel> : children}
        </Box>
      </Flex>
    </HeaderActionsHost.Provider>
  );
}

/** Settings and validation have one header location, including in editors with their own canvases. */
export function EditorHeaderActions({ children }: React.PropsWithChildren) {
  const host = useContext(HeaderActionsHost);
  if (host === undefined)
    throw new Error('EditorHeaderActions requires the workspace EditorDocumentFrame.');
  return host ? createPortal(children, host) : null;
}

export function EditorDocumentToolbar({ children }: React.PropsWithChildren) {
  return (
    <HStack
      role="toolbar"
      aria-label="Document tools"
      px={4}
      py={2}
      minH="40px"
      spacing={3}
      flexShrink={0}
      bg="editorSectionBg"
      borderBottomWidth="1px"
      borderColor="editorShellBorder"
    >
      {children}
    </HStack>
  );
}

export function EditorValidationStatus({
  errors,
  onClick,
}: {
  errors: readonly string[];
  onClick: () => void;
}) {
  return (
    <Badge
      as="button"
      type="button"
      colorScheme={errors.length ? 'red' : 'green'}
      onClick={onClick}
      aria-label={errors.length ? `${errors.length} issues` : 'No issues'}
    >
      {errors.length ? `${errors.length} issues` : 'Valid'}
    </Badge>
  );
}
