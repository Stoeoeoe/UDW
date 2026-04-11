import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Box,
  HStack,
  Input,
  Button,
  Circle,
  Text,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Select,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
  Portal,
  useDisclosure,
} from '@chakra-ui/react';
import * as GiIcons from 'react-icons/gi';
import type { IconType } from 'react-icons';
import { FixedSizeGrid as Grid } from 'react-window';
import gameIconsJson from '../../../assets/game_icons.json';

type IconPickerProps = {
  value?: string;
  onChange: (value?: string) => void;
  icons?: string[]; // optional whitelist of icon names (e.g. ['GiTree', ...])
  size?: number;
  width?: number;
  height?: number;
};

const ALL_GI_ICONS = Object.keys(GiIcons).map((k) => k);
export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  icons,
  size = 48,
  width = 500,
  height = 360,
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const categories: { name: string; icons: string[] }[] = (gameIconsJson as any)?.categories ?? [];
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const source = useMemo(() => {
    if (icons && icons.length > 0) return icons;
    if (activeCategory && activeCategory !== 'All') {
      const cat = categories.find((c) => c.name === activeCategory);
      if (cat) return cat.icons;
    }
    // default: all icons from GI set
    return ALL_GI_ICONS;
  }, [icons, activeCategory, categories]);

  useEffect(() => {
    if (isOpen) {
      // focus the search input when popover opens
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter((n) => n.toLowerCase().includes(q));
  }, [query, source]);

  const colWidth = Math.max(56, size + 20);
  const columns = Math.max(4, Math.floor(width / colWidth));
  const rowCount = Math.ceil(filtered.length / columns);

  const renderPreview = (val?: string) => {
    if (!val) return <Text fontSize="lg">?</Text>;
    const Comp: IconType | undefined = (GiIcons as any)[val];
    if (Comp) return <Comp size={size} />;
    return <Text fontSize={Math.max(14, size - 4)}>{val}</Text>;
  };

  const Cell = ({ columnIndex, rowIndex, style }: any) => {
    const idx = rowIndex * columns + columnIndex;
    if (idx >= filtered.length) return null;
    const name = filtered[idx];
    const IconComp: IconType | undefined = (GiIcons as any)[name];
    // Ensure the interactive button fills the entire cell so hover/selection align correctly
    const cellStyle = { ...style, boxSizing: 'border-box', padding: 6 } as React.CSSProperties;
    return (
      <Box style={cellStyle}>
        <Button
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => {
            onChange(name);
            onClose();
          }}
          variant={value === name ? 'solid' : 'ghost'}
          title={name}
        >
          {IconComp ? <IconComp size={size} /> : <Text fontSize="sm">?</Text>}
        </Button>
      </Box>
    );
  };

  return (
    <Popover isOpen={isOpen} onOpen={onOpen} onClose={onClose} placement="bottom-start">
      <PopoverTrigger>
        <Button
          onClick={onOpen}
          p={2}
          minW={`${size + 16}px`}
          minH={`${size + 16}px`}
          display="flex"
          alignItems="center"
          justifyContent="center"
          aria-label="Select icon"
          variant="ghost"
        >
          {renderPreview(value)}
        </Button>
      </PopoverTrigger>
      <Portal>
        <PopoverContent w={`${width + 48}px`} maxW="90vw">
          <PopoverArrow />
          <PopoverCloseButton />
          <PopoverBody>
            {categories.length > 0 && (
              <Select
                size="sm"
                mb={2}
                value={activeCategory}
                onChange={(e) => {
                  setActiveCategory(e.target.value);
                  setQuery('');
                }}
              >
                <option value="All">All</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
            <HStack spacing={2} mb={2}>
              <Input
                size="sm"
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search icons... (try 'Tree', 'Sword')"
                bg="#0a0a0b"
              />
            </HStack>

            <Box borderRadius="md" overflow="hidden">
              <Grid
                columnCount={columns}
                columnWidth={colWidth}
                height={height}
                rowCount={rowCount}
                rowHeight={colWidth}
                width={width}
              >
                {Cell}
              </Grid>
            </Box>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

type ColorPickerProps = {
  value?: string;
  onChange: (value: string) => void;
};

export const ColorPicker: React.FC<ColorPickerProps> = ({ value = '#3182ce', onChange }) => {
  return (
    <HStack spacing={3} align="center">
      <Input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        w="40px"
        h="38px"
        p={0}
        border="none"
        cursor="pointer"
      />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size="sm"
        w="80px"
      />
    </HStack>
  );
};

export default { IconPicker, ColorPicker };
