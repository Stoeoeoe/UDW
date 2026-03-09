import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = { initialColorMode: 'dark', useSystemColorMode: false };

export const editorColors = {
  editor: {
    panelBg: '#03040a',
    headerBg: '#05060a',
    border: '#071018',
    viewportBg: '#0a0a0b',
    inputBg: '#05060a',
    inputBorder: '#0b1116',
  },
};

export const editorTheme = extendTheme({
  config,
  colors: editorColors,
  styles: { global: { body: { bg: 'gray.900', color: 'gray.200' } } },
  components: {
    FormLabel: { baseStyle: { fontSize: 'xs', fontWeight: 'bold', textTransform: 'uppercase', color: 'gray.500', mb: 2 } },
    Input: { variants: { outline: { field: { bg: 'gray.950', borderColor: 'gray.700', fontSize: 'sm', _hover: { borderColor: 'gray.600' }, _focus: { borderColor: 'blue.500', boxShadow: 'none' } } } }, defaultProps: { size: 'sm', variant: 'outline' } },
    Textarea: { variants: { outline: { bg: 'gray.950', borderColor: 'gray.700', fontSize: 'sm', _hover: { borderColor: 'gray.600' }, _focus: { borderColor: 'blue.500', boxShadow: 'none' } } }, defaultProps: { size: 'sm', variant: 'outline' } },
    Button: { baseStyle: { fontWeight: 'medium', rounded: 'md' }, variants: { ghost: { color: 'gray.400', _hover: { color: 'white', bg: 'gray.800' } }, solid: (props: any) => ({ bg: props.colorScheme === 'blue' ? 'blue.600' : undefined, _hover: { bg: props.colorScheme === 'blue' ? 'blue.500' : undefined } }) }, defaultProps: { size: 'sm' } },
    Divider: { baseStyle: { borderColor: 'gray.800' } },
    Heading: { baseStyle: { color: 'gray.100' } },
  },
});

export function createEditorTheme(overrides: Parameters<typeof extendTheme>[0] = {}) {
  return extendTheme(editorTheme, overrides);
}
