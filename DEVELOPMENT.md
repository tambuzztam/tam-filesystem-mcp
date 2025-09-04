# Development Guide

## Code Quality & Formatting

This project uses a comprehensive code quality setup with automatic formatting and linting.

### Tools Configured

- **Prettier** - Code formatting
- **ESLint** - Code linting with TypeScript support
- **Husky** - Git hooks for pre-commit quality checks
- **lint-staged** - Run linters only on staged files
- **EditorConfig** - Consistent editor behavior

### Scripts Available

```bash
# Formatting
npm run format          # Format all files
npm run format:check    # Check if files are formatted

# Linting
npm run lint           # Lint all files
npm run lint:fix       # Lint and auto-fix issues

# Type checking
npm run typecheck      # Run TypeScript type checker

# Combined quality checks
npm run quality        # Run typecheck + lint + format:check
npm run quality:fix    # Run typecheck + lint:fix + format

# Testing
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
```

### Pre-commit Hooks

Husky is configured to run `lint-staged` on pre-commit, which will:
- Run ESLint with auto-fix on staged TypeScript/JavaScript files
- Format staged files with Prettier
- Ensure code quality before commits

### Current Status

**Note**: The project is currently in development with stub implementations. Some ESLint warnings and errors are expected:

- Console statements in stub methods (will be removed when implementing)
- Unused variables in stub parameters (prefixed with `_` where possible)
- `any` types in interfaces (will be refined during implementation)

### Editor Integration

For VS Code users, the project includes settings in `.vscode/settings.json` that enable:
- Format on save
- Auto-fix ESLint issues on save
- Organize imports on save

### Configuration Files

- `.prettierrc.mjs` - Prettier configuration
- `eslint.config.mjs` - ESLint configuration
- `.editorconfig` - Editor consistency settings
- `jest.config.mjs` - Jest test configuration
- `tsconfig.json` - TypeScript configuration

### Ignoring Files

- `.prettierignore` - Files/patterns to exclude from formatting
- ESLint ignores are configured in `eslint.config.mjs`

This setup ensures consistent code style and quality across the project while supporting the ES module architecture.
