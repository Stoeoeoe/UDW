import { extendTheme, type ThemeConfig } from '@chakra-ui/react';
import type { StyleFunctionProps } from '@chakra-ui/styled-system';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const interactiveFieldBase = {
  bg: 'editorFieldBg',
  borderColor: 'editorFieldBorder',
  color: 'editorText',
  _hover: {
    bg: 'editorFieldHoverBg',
    borderColor: 'editorFieldBorderHover',
  },
  _focusVisible: {
    borderColor: 'blue.400',
    boxShadow: '0 0 0 1px var(--chakra-colors-blue-400)',
  },
};

const compactFieldStyle = {
  ...interactiveFieldBase,
  fontSize: 'xs',
  borderRadius: 'md',
};

const readOnlyFieldStyle = {
  ...interactiveFieldBase,
  bg: 'editorFieldReadOnlyBg',
  color: 'editorMutedText',
  fontFamily: 'mono',
  _hover: {
    bg: 'editorFieldReadOnlyHoverBg',
    borderColor: 'editorFieldBorder',
  },
  _focusVisible: {
    borderColor: 'editorFieldBorder',
    boxShadow: 'none',
  },
};

export const theme = extendTheme({
  config,
  semanticTokens: {
    colors: {
      editorAppBg: {
        default: '#171a1f',
      },
      editorChromeBg: {
        default: '#171a1f',
      },
      editorSidebarBg: {
        default: '#111317',
      },
      editorPanelBg: {
        default: '#1b1f26',
      },
      editorSectionBg: {
        default: '#15181d',
      },
      editorWorkspaceBg: {
        default: '#141619',
      },
      editorHeaderBg: {
        default: '#0d0f13',
      },
      editorCanvasBg: {
        default: '#141619',
      },
      editorShellBorder: {
        default: '#071018',
      },
      editorBorderSubtle: {
        default: '#0b1116',
      },
      editorFieldBg: {
        default: '#05060a',
      },
      editorFieldReadOnlyBg: {
        default: '#0a0a0b',
      },
      editorFieldReadOnlyHoverBg: {
        default: '#0d131a',
      },
      editorFieldBorder: {
        default: '#0b1116',
      },
      editorFieldBorderHover: {
        default: '#1a2a39',
      },
      editorInlineBg: {
        default: '#0a0a0b',
      },
      editorInlineBorder: {
        default: '#1a1a2e',
      },
      editorInlineHoverBg: {
        default: '#0b1016',
      },
      editorHoverBg: {
        default: '#101723',
      },
      editorActiveBg: {
        default: 'whiteAlpha.100',
      },
      editorText: {
        default: 'gray.100',
      },
      editorMutedText: {
        default: 'gray.500',
      },
      editorHelperText: {
        default: 'gray.600',
      },
      editorDangerText: {
        default: 'red.300',
      },
    },
  },
  colors: {
    editor: {
      panelBg: '#03040a',
      headerBg: '#05060a',
      border: '#071018',
      viewportBg: '#0a0a0b',
      inputBg: '#05060a',
      inputBorder: '#0b1116',
      inlineBg: '#0a0a0b',
      inlineBorder: '#1a1a2e',
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
      color: 'editorMutedText',
      textTransform: 'uppercase',
      letterSpacing: 'widest',
    },
    mutedFieldLabel: {
      fontSize: 'xs',
      color: 'editorMutedText',
      textTransform: 'uppercase',
    },
    panelLabel: {
      fontSize: '9px',
      fontWeight: 'black',
      color: 'editorMutedText',
      textTransform: 'uppercase',
      letterSpacing: 'widest',
    },
    fieldLabel: {
      fontSize: '10px',
      fontWeight: 'black',
      color: 'editorMutedText',
      textTransform: 'uppercase',
    },
    helperText: {
      fontSize: '10px',
      color: 'editorHelperText',
    },
    monoMeta: {
      fontSize: 'xs',
      color: 'editorMutedText',
      fontFamily: 'mono',
    },
  },
  styles: {
    global: {
      html: {
        h: '100%',
      },
      body: {
        bg: 'editorAppBg',
        color: 'editorText',
        minH: '100%',
      },
      '#root': {
        minH: '100vh',
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
        color: 'editorMutedText',
        mb: 2,
      },
    },
    Input: {
      variants: {
        editor: {
          field: interactiveFieldBase,
        },
        compact: {
          field: compactFieldStyle,
        },
        readOnly: {
          field: readOnlyFieldStyle,
        },
      },
      sizes: {
        xs: {
          field: {
            h: 7,
            px: 2,
            fontSize: 'xs',
          },
        },
        sm: {
          field: {
            h: 8,
          },
        },
      },
      defaultProps: {
        size: 'sm',
        variant: 'editor',
      },
    },
    NumberInput: {
      variants: {
        editor: {
          field: interactiveFieldBase,
        },
        compact: {
          field: compactFieldStyle,
        },
        readOnly: {
          field: readOnlyFieldStyle,
        },
      },
      defaultProps: {
        size: 'sm',
        variant: 'editor',
      },
    },
    Select: {
      variants: {
        editor: {
          field: {
            ...interactiveFieldBase,
            '> option, > optgroup': {
              bg: 'editorInlineBg',
              color: 'editorText',
            },
          },
        },
        compact: {
          field: {
            ...compactFieldStyle,
            '> option, > optgroup': {
              bg: 'editorInlineBg',
              color: 'editorText',
            },
          },
        },
        readOnly: {
          field: {
            ...readOnlyFieldStyle,
            '> option, > optgroup': {
              bg: 'editorInlineBg',
              color: 'editorText',
            },
          },
        },
      },
      defaultProps: {
        size: 'sm',
        variant: 'editor',
      },
    },
    Textarea: {
      variants: {
        editor: interactiveFieldBase,
        compact: compactFieldStyle,
        readOnly: readOnlyFieldStyle,
      },
      defaultProps: {
        size: 'sm',
        variant: 'editor',
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
        subtle: {
          bg: 'editorActiveBg',
          color: 'editorText',
          _hover: {
            bg: 'editorHoverBg',
          },
        },
        toolbar: (props: StyleFunctionProps) => ({
          bg: props.colorScheme ? `${props.colorScheme}.600` : 'transparent',
          color: props.colorScheme ? 'white' : 'editorMutedText',
          _hover: {
            bg: props.colorScheme ? `${props.colorScheme}.500` : 'editorHoverBg',
            color: 'white',
          },
        }),
        ghost: {
          color: 'editorMutedText',
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
    IconButton: {
      variants: {
        toolbar: {
          color: 'editorMutedText',
          bg: 'transparent',
          _hover: {
            color: 'white',
            bg: 'editorHoverBg',
          },
        },
        subtle: {
          color: 'editorMutedText',
          bg: 'editorActiveBg',
          _hover: {
            color: 'white',
            bg: 'editorHoverBg',
          },
        },
      },
      defaultProps: {
        size: 'sm',
        variant: 'toolbar',
      },
    },
    Badge: {
      variants: {
        editor: {
          bg: 'editorActiveBg',
          color: 'editorMutedText',
          borderRadius: 'md',
          px: 2,
          py: 0.5,
          textTransform: 'uppercase',
          letterSpacing: 'wide',
          fontSize: '9px',
        },
      },
    },
    Divider: {
      baseStyle: {
        borderColor: 'editorShellBorder',
      },
    },
    Heading: {
      baseStyle: {
        color: 'editorText',
      },
    },
  },
});
