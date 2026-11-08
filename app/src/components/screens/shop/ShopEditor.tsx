import React, { useMemo } from 'react';
import {
  Badge,
  Box,
  Button,
  FormControl,
  HStack,
  IconButton,
  Input,
  Switch,
  Text,
  VStack,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { GiShop } from 'react-icons/gi';
import { MdRedo, MdUndo } from 'react-icons/md';
import { useEditorStore } from '../../../store/useEditorStore';
import { validateShop } from '../../../store/slices/shopSlice';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { DetailPanel } from '../../common/DetailPanel';
import { EmptyScreen } from '../common/EmptyScreen';
import { CompactNumberInput, FieldStack, ReadOnlyIdField } from '../../common/Fields';
import { FieldLabel } from '../../common/Typography.tsx';
import type { ShopOffering, Shop } from '../../../types/schema';

/**
 * Edits a static shop: its name, whether it buys goods, and the fixed list of items it sells.
 * Every offering is always in stock at its price. Edits apply at once and are saved, undone and
 * redone through the editor's normal save and history handling.
 */
export const ShopEditor: React.FC = () => {
  const shops = useEditorStore((state) => state.shops);
  const selectedShopId = useEditorStore((state) => state.selectedShopId);

  const selected = shops.find((shop) => shop.id === selectedShopId);

  const content = selected ? (
    <DetailPanel key={selected.id} maxWidth="900px">
      <ShopDetail shop={selected} />
    </DetailPanel>
  ) : (
    <EmptyScreen
      icon={<GiShop />}
      title={shops.length ? 'No Shop Selected' : 'No Shops'}
      description={
        shops.length
          ? 'Select a shop from the explorer to edit what it sells.'
          : 'Create a shop from the explorer to define a fixed list of items for sale.'
      }
    />
  );

  return (
    <ResizableEditorLayout
      header={{
        title: 'Shops',
        subtitle: `${shops.length} shop${shops.length !== 1 ? 's' : ''} defined`,
      }}
      content={content}
    />
  );
};

const ShopDetail: React.FC<{ shop: Shop }> = ({ shop }) => {
  const items = useEditorStore((state) => state.items);
  const updateShop = useEditorStore((state) => state.updateShop);
  const undoShop = useEditorStore((state) => state.undoShop);
  const redoShop = useEditorStore((state) => state.redoShop);
  const canUndo = useEditorStore((state) => (state.shopPast[shop.id]?.length ?? 0) > 0);
  const canRedo = useEditorStore((state) => (state.shopFuture[shop.id]?.length ?? 0) > 0);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  const errors = useMemo(() => validateShop(shop), [shop]);
  const repeated = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const offering of shop.offerings) {
      const id = offering.itemId.trim();
      if (id && seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
    return duplicates;
  }, [shop.offerings]);

  const setOfferings = (offerings: ShopOffering[]) => updateShop(shop.id, { offerings });
  const updateOffering = (index: number, changes: Partial<ShopOffering>) =>
    setOfferings(
      shop.offerings.map((offering, i) =>
        i === index ? { ...offering, ...changes } : offering,
      ),
    );

  return (
    <VStack align="stretch" spacing={6}>
      <HStack
        justify="space-between"
        align="start"
        pb={4}
        borderBottom="1px"
        borderColor="whiteAlpha.100"
      >
        <VStack align="start" spacing={1}>
          <Text fontSize="lg" fontWeight="bold" color="editorText" lineHeight={1.1}>
            {shop.name}
          </Text>
          <Text textStyle="monoMeta">{shop.id}</Text>
          <Badge variant="editor">Shop</Badge>
        </VStack>
        <HStack spacing={1}>
          <IconButton
            aria-label="Undo"
            size="sm"
            variant="ghost"
            icon={<MdUndo />}
            isDisabled={!canUndo}
            onClick={() => undoShop(shop.id)}
          />
          <IconButton
            aria-label="Redo"
            size="sm"
            variant="ghost"
            icon={<MdRedo />}
            isDisabled={!canRedo}
            onClick={() => redoShop(shop.id)}
          />
        </HStack>
      </HStack>

      <FieldStack>
        <FormControl>
          <FieldLabel>ID</FieldLabel>
          <ReadOnlyIdField value={shop.id} />
        </FormControl>
        <FormControl>
          <FieldLabel>Name</FieldLabel>
          <Input
            size="sm"
            value={shop.name}
            onChange={(event) => updateShop(shop.id, { name: event.target.value })}
          />
        </FormControl>
        <FormControl>
          <HStack justify="space-between">
            <Box>
              <FieldLabel>Buys goods</FieldLabel>
              <Text fontSize="xs" color="editorMutedText">
                When on, the shop pays each item&apos;s sell price for the player&apos;s goods.
              </Text>
            </Box>
            <Switch
              isChecked={shop.buysGoods}
              onChange={(event) => updateShop(shop.id, { buysGoods: event.target.checked })}
            />
          </HStack>
        </FormControl>
      </FieldStack>

      <VStack align="stretch" spacing={3}>
        <FieldLabel>Items for sale</FieldLabel>
        <datalist id="shop-item-ids">
          {itemIds.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        {shop.offerings.length === 0 ? (
          <Text fontSize="sm" color="editorMutedText">
            This shop sells nothing yet.
          </Text>
        ) : null}
        {shop.offerings.map((offering, index) => (
          <HStack key={index} spacing={3} align="center">
            <Input
              size="sm"
              list="shop-item-ids"
              placeholder="Item ID, for example base:broad_bean_seeds"
              value={offering.itemId}
              isInvalid={repeated.has(offering.itemId.trim())}
              onChange={(event) => updateOffering(index, { itemId: event.target.value })}
            />
            <Box w="110px" flexShrink={0}>
              <CompactNumberInput
                min={0}
                value={offering.price}
                onChange={(_, price) =>
                  updateOffering(index, { price: Number.isNaN(price) ? 0 : price })
                }
              />
            </Box>
            <IconButton
              aria-label="Remove item"
              size="sm"
              variant="ghost"
              icon={<DeleteIcon />}
              onClick={() => setOfferings(shop.offerings.filter((_, i) => i !== index))}
            />
          </HStack>
        ))}
        {errors.length > 0 ? (
          <Text fontSize="xs" color="red.300">
            Not saved yet: {errors.join(' ')}
          </Text>
        ) : null}
        <Box>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<AddIcon />}
            onClick={() => setOfferings([...shop.offerings, { itemId: '', price: 0 }])}
          >
            Add item
          </Button>
        </Box>
      </VStack>
    </VStack>
  );
};
