import React from 'react';
import { Tabs, TabList, Tab, TabPanels, TabPanel, Flex } from '@chakra-ui/react';
import { LinkBottomPanel } from './LinkBottomPanel';
import { AnchorBottomPanel } from './AnchorBottomPanel';
import { TriggerBottomPanel } from './TriggerBottomPanel';

export const NavigationBottomPanel: React.FC = () => {
  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editor.panelBg">
      <Tabs
        size="sm"
        variant="line"
        colorScheme="cyan"
        isLazy
        h="full"
        display="flex"
        flexDirection="column"
      >
        <TabList bg="editor.headerBg" borderBottom="1px" borderColor="editor.border">
          <Tab fontSize="xs">Links</Tab>
          <Tab fontSize="xs">Anchors</Tab>
          <Tab fontSize="xs">Triggers</Tab>
        </TabList>
        <TabPanels flex={1} overflow="hidden">
          <TabPanel p={0} h="full">
            <LinkBottomPanel />
          </TabPanel>
          <TabPanel p={0} h="full">
            <AnchorBottomPanel />
          </TabPanel>
          <TabPanel p={0} h="full">
            <TriggerBottomPanel />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Flex>
  );
};

export default NavigationBottomPanel;
