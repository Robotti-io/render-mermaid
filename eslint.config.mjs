import js from "@eslint/js";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "node_modules/*",
  ]),
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      'array-bracket-spacing': ['error', 'never'],
      'comma-dangle': ['error', 'always-multiline'],
      'consistent-return': 'error',
      'eqeqeq': ['error', 'always'],
      // 'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
      // 'import/order': ['error', { groups: ['builtin', 'external', 'internal'] }],
      'no-console': 'warn',
      'no-underscore-dangle': 'off',
      'object-curly-spacing': ['error', 'always'],
      'prefer-const': 'error',
      'semi': ['error', 'always'],
      'space-before-function-paren': ['error', {
        'anonymous': 'never',
        'named': 'never',
        'asyncArrow': 'always',
      }],
      'eol-last': ['error', 'always'],
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
    },
  },
  {
    files: ["tests/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
]);
