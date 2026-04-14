import { extendTheme, type ThemeConfig } from '@chakra-ui/react';
import type { StyleFunctionProps } from '@chakra-ui/styled-system';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

// Shared field style applied to all text-entry components
const inputFieldStyle = {
  bg: '#0a0a0b',
  borderColor: 'gray.700',
  color: 'white',
  fontSize: 'sm',
  _hover: {
    borderColor: 'gray.600',
  },
  _focus: {
    borderColor: 'blue.500',
    boxShadow: 'none',
  },
};

export const theme = extendTheme({
  config,
  semanticTokens: {
    colors: {
      editorAppBg: {
        default: 'gray.900',
      },
      editorChromeBg: {
        default: 'gray.900',
      },
      editorPanelBg: {
        default: 'gray.950',
      },
      editorCanvasBg: {
        default: 'gray.800',
      },
      editorBorderSubtle: {
        default: 'gray.800',
      },
      editorBorderLight: {
        default: 'gray.700',
      },
      editorHoverBg: {
        default: 'gray.800',
      },
      editorMutedText: {
        default: 'gray.500',
      },
    },
  },
  colors: {
    // Semantic editor colors - centralized color tokens
    editor: {
      panelBg: '#03040a',
      headerBg: '#05060a',
      border: '#071018',
      viewportBg: '#0a0a0b',
      inputBg: '#05060a',
      inputBorder: '#0b1116',
    },
  },
  textStyles: {
    sectionLabel: {
      fontSize: 'xs',
      fontWeight: 'black',
      color: 'gray.500',
      textTransform: 'uppercase',
    },
    inspectorSectionLabel: {
      fontSize: '10px',
      fontWeight: 'black',
      color: 'gray.500',
      textTransform: 'uppercase',
      letterSpacing: 'widest',
    },
    mutedFieldLabel: {
      fontSize: 'xs',
      color: 'gray.400',
      textTransform: 'uppercase',
    },
    panelLabel: {
      fontSize: '9px',
      fontWeight: 'black',
      color: 'gray.500',
      textTransform: 'uppercase',
      letterSpacing: 'widest',
    },
    fieldLabel: {
      fontSize: '10px',
      fontWeight: 'black',
      color: 'gray.500',
      textTransform: 'uppercase',
    },
  },
  styles: {
    global: {
      body: {
        bg: 'editorAppBg',
        color: 'gray.200',
      },
    },
  },
  components: {
    FormLabel: {
      baseStyle: {
        fontSize: 'xs',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 'wide',
        color: 'gray.500',
        mb: 2,
      },
    },
    Input: {
      variants: {
        outline: {
          field: inputFieldStyle,
        },
      },
      defaultProps: {
        size: 'sm',
        variant: 'outline',
      },
    },
    NumberInput: {
      variants: {
        outline: {
          field: inputFieldStyle,
        },
      },
      defaultProps: {
        size: 'sm',
        variant: 'outline',
      },
    },
    Select: {
      variants: {
        outline: {
          field: {
            ...inputFieldStyle,
            // Native select needs explicit option background for dark mode
            '> option, > optgroup': {
              bg: '#0a0a0b',
            },
          },
        },
      },
      defaultProps: {
        size: 'sm',
        variant: 'outline',
      },
    },
    Textarea: {
      variants: {
        outline: inputFieldStyle,
      },
      defaultProps: {
        size: 'sm',
        variant: 'outline',
      },
    },
    FormErrorMessage: {
      baseStyle: {
        text: {
          fontSize: 'xs',
        },
      },
    },
    Button: {
      baseStyle: {
        fontWeight: 'medium',
        rounded: 'md',
      },
      variants: {
        ghost: {
          color: 'gray.400',
          _hover: {
            color: 'white',
            bg: 'editorHoverBg',
          },
        },
        solid: (props: StyleFunctionProps) => ({
          bg: props.colorScheme === 'blue' ? 'blue.600' : undefined,
          _hover: {
            bg: props.colorScheme === 'blue' ? 'blue.500' : undefined,
          },
        }),
      },
      defaultProps: {
        size: 'sm',
      },
    },
    Divider: {
      baseStyle: {
        borderColor: 'editorBorderSubtle',
      },
    },
    Heading: {
      baseStyle: {
        color: 'gray.100',
      },
    },
  },
});
