module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@chakra-ui/react',
            importNames: ['FormLabel'],
            message:
              'Import label wrappers from the local typography layer instead of Chakra FormLabel directly.',
          },
        ],
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "JSXOpeningElement[name.name='FormLabel'] > JSXAttribute[name.name='fontSize'], JSXOpeningElement[name.name='FormLabel'] > JSXAttribute[name.name='fontWeight'], JSXOpeningElement[name.name='FormLabel'] > JSXAttribute[name.name='color'], JSXOpeningElement[name.name='FormLabel'] > JSXAttribute[name.name='textTransform'], JSXOpeningElement[name.name='FormLabel'] > JSXAttribute[name.name='letterSpacing'], JSXOpeningElement[name.name='FormLabelUppercase'] > JSXAttribute[name.name='fontSize'], JSXOpeningElement[name.name='FormLabelUppercase'] > JSXAttribute[name.name='fontWeight'], JSXOpeningElement[name.name='FormLabelUppercase'] > JSXAttribute[name.name='color'], JSXOpeningElement[name.name='FormLabelUppercase'] > JSXAttribute[name.name='textTransform'], JSXOpeningElement[name.name='FormLabelUppercase'] > JSXAttribute[name.name='letterSpacing'], JSXOpeningElement[name.name='FieldLabel'] > JSXAttribute[name.name='fontSize'], JSXOpeningElement[name.name='FieldLabel'] > JSXAttribute[name.name='fontWeight'], JSXOpeningElement[name.name='FieldLabel'] > JSXAttribute[name.name='color'], JSXOpeningElement[name.name='FieldLabel'] > JSXAttribute[name.name='textTransform'], JSXOpeningElement[name.name='FieldLabel'] > JSXAttribute[name.name='letterSpacing'], JSXOpeningElement[name.name='MutedFieldLabel'] > JSXAttribute[name.name='fontSize'], JSXOpeningElement[name.name='MutedFieldLabel'] > JSXAttribute[name.name='fontWeight'], JSXOpeningElement[name.name='MutedFieldLabel'] > JSXAttribute[name.name='color'], JSXOpeningElement[name.name='MutedFieldLabel'] > JSXAttribute[name.name='textTransform'], JSXOpeningElement[name.name='MutedFieldLabel'] > JSXAttribute[name.name='letterSpacing']",
        message: 'Do not set label typography inline; use the themed label wrappers.',
      },
    ],
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
  overrides: [
    {
      files: ['src/components/common/FormLabel.tsx', 'src/components/common/Typography.tsx'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
