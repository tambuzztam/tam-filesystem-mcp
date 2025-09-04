/** @type {import('prettier').Config} */
export default {
  // Basic formatting
  semi: true,
  trailingComma: 'es5',
  singleQuote: true,
  tabWidth: 2,
  useTabs: false,

  // Line length (keep reasonable for readability)
  printWidth: 80,

  // Bracket spacing
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow function parentheses
  arrowParens: 'avoid',

  // End of line
  endOfLine: 'lf',

  // File patterns to format
  overrides: [
    {
      files: '*.{ts,tsx,js,jsx,mjs,cjs}',
      options: {
        parser: 'typescript',
      },
    },
    {
      files: '*.{json,md,yml,yaml}',
      options: {
        tabWidth: 2,
      },
    },
  ],
};
