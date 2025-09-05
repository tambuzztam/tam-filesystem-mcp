/**
 * Configuration utilities for tam-filesystem-mcp
 *
 * Handles loading vault configuration from .tam-filesystem-mcp.json file
 * and merging with command-line arguments and defaults.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { VaultConfig, VaultConfigFile } from './types.js';

/**
 * Load vault configuration from .tam-filesystem-mcp.json file
 */
export function loadVaultConfig(allowedDirectories: string[]): VaultConfig {
  // Default configuration
  const defaultConfig: VaultConfig = {
    allowedDirectories,
    promptsPath: 'tasks/prompts',
    tasksPath: 'tasks',
    templatesPath: 'utilities/templates',
    enableObsidianFeatures: true,
    cachePrompts: true,
    maxSearchResults: 10,
    templaterLite: true,
    wikilinkResolution: false,
    fuzzyThreshold: 0.6,
    strictVariables: false,
    defaultDateFormat: 'YYYY-MM-DD',
    // Prompt discovery thresholds
    promptFuzzyMatchThreshold: 0.3,
    promptSuggestionThreshold: 0.2,
  };

  // Try to find vault config file in any of the allowed directories
  let vaultConfigFile: VaultConfigFile | null = null;

  for (const dir of allowedDirectories) {
    const configPath = resolve(join(dir, '.tam-filesystem-mcp.json'));

    if (existsSync(configPath)) {
      try {
        const configContent = readFileSync(configPath, 'utf-8');
        vaultConfigFile = JSON.parse(configContent);
        console.error(`✓ Loaded vault config from: ${configPath}`);
        break;
      } catch (error) {
        console.error(
          `Warning: Failed to parse config file ${configPath}: ${error}`
        );
      }
    }
  }

  // If no config file found, use defaults
  if (!vaultConfigFile) {
    console.error('ℹ No vault config file found, using defaults');
    return defaultConfig;
  }

  // Merge config file with defaults
  const mergedConfig: VaultConfig = {
    ...defaultConfig,
    // Map vault config file structure to VaultConfig
    promptsPath: vaultConfigFile.paths?.prompts || defaultConfig.promptsPath,
    tasksPath: vaultConfigFile.paths?.tasks || defaultConfig.tasksPath,
    templatesPath:
      vaultConfigFile.paths?.templates || defaultConfig.templatesPath,
    enableObsidianFeatures:
      vaultConfigFile.features?.obsidianFeatures ??
      defaultConfig.enableObsidianFeatures,
    cachePrompts:
      vaultConfigFile.features?.cachePrompts ?? defaultConfig.cachePrompts,
    templaterLite:
      vaultConfigFile.features?.templaterLite ?? defaultConfig.templaterLite,
    wikilinkResolution:
      vaultConfigFile.features?.wikilinkResolution ??
      defaultConfig.wikilinkResolution,
    maxSearchResults:
      vaultConfigFile.search?.maxResults || defaultConfig.maxSearchResults,
    fuzzyThreshold:
      vaultConfigFile.search?.fuzzyThreshold || defaultConfig.fuzzyThreshold,
    strictVariables:
      vaultConfigFile.variables?.strictValidation ??
      defaultConfig.strictVariables,
    defaultDateFormat:
      vaultConfigFile.variables?.defaultDateFormat ||
      defaultConfig.defaultDateFormat,
    // Prompt discovery thresholds
    promptFuzzyMatchThreshold:
      vaultConfigFile.search?.promptFuzzyMatchThreshold ??
      defaultConfig.promptFuzzyMatchThreshold,
    promptSuggestionThreshold:
      vaultConfigFile.search?.promptSuggestionThreshold ??
      defaultConfig.promptSuggestionThreshold,
  };

  console.error(`✓ Vault: ${vaultConfigFile.vault?.name || 'unnamed'}`);
  console.error(`✓ Prompts path: ${mergedConfig.promptsPath}`);
  console.error(`✓ Tasks path: ${mergedConfig.tasksPath}`);
  console.error(`✓ Templates path: ${mergedConfig.templatesPath}`);

  return mergedConfig;
}

/**
 * Resolve a vault-relative path to an absolute path within allowed directories
 */
export function resolveVaultPath(
  vaultRelativePath: string,
  allowedDirectories: string[]
): string {
  // For now, use the first allowed directory as the vault root
  // TODO: In the future, we could detect which directory contains the config file
  const vaultRoot = allowedDirectories[0];
  return resolve(join(vaultRoot, vaultRelativePath));
}
