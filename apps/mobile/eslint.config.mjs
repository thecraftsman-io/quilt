import { reactNative } from '@quilt/eslint-config';

export default [
  ...reactNative({
    projectDir: import.meta.dirname,
    typedFiles: ['**/*.{ts,tsx}'],
  }),
  {
    // This regression harness runs in Node and never ships in the app.
    files: ['tests/native-actions.test.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.native-tests.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { 'no-restricted-imports': 'off' },
  },
];
