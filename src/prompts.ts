/**
 * Prompt Management System
 *
 * Implements the flagship getPrompted function and related prompt discovery,
 * loading, and processing capabilities with Obsidian awareness.
 */

import {
  VaultConfig,
  PromptOptions,
  GetPromptedResult,
  PromptHit,
  VariableSpec,
  EnhancedMcpError,
} from './types.js';
import { ObsidianUtils } from './obsidian.js';
import { TemplateProcessor } from './templates.js';
import {
  validateVaultPath,
  getPathInfo,
  isAllowedFileType,
} from './security.js';
import { resolveVaultPath } from './config.js';
import { readFile, readdir } from 'fs/promises';
import { join, basename, extname } from 'path';

export class PromptManager {
  private templateProcessor: TemplateProcessor;

  constructor(
    private config: VaultConfig,
    private obsidianUtils: ObsidianUtils
  ) {
    this.templateProcessor = new TemplateProcessor(config);
  }

  /**
   * The flagship function: Quickly and easily direct the LLM to a specific prompt
   * Focuses on efficient and accurate prompt discovery and variable substitution
   */
  async getPrompted(
    promptName: string,
    variables: Record<string, any> = {},
    options: PromptOptions = {}
  ): Promise<GetPromptedResult> {
    try {
      // 1. Discover the prompt file
      const promptPath = await this.discoverPrompt(
        promptName,
        options.searchPaths
      );
      if (!promptPath) {
        throw new EnhancedMcpError(
          'prompt_not_found',
          `Prompt '${promptName}' not found in search paths`
        );
      }

      // 2. Load and parse the prompt
      const { content, frontmatter } = await this.loadPromptFile(promptPath);
      const { specVariables } = this.collectAllVariables(content, frontmatter);

      // 3. Check for missing required variables (but don't error - let LLM handle it)
      const missingRequired = this.findMissingRequiredVariables(
        specVariables,
        variables
      );

      if (missingRequired.length > 0) {
        // Return a response that asks the LLM to collect missing variables
        return this.createMissingVariablesResult(
          promptPath,
          missingRequired,
          frontmatter
        );
      }

      // 4. Process variables and template syntax
      const mergedVariables = this.mergeVariablesWithDefaults(
        variables,
        specVariables
      );
      let processedContent = content;

      // Basic templater processing if enabled
      if (options.processTemplater !== false && this.config.templaterLite) {
        processedContent = this.resolveTemplaterSyntax(
          processedContent,
          mergedVariables,
          promptPath
        );
      }

      // Variable substitution
      const substitutionResult = this.substituteVariables(
        processedContent,
        mergedVariables
      );

      // 5. Return the processed prompt - let the LLM decide what to do with it
      return this.createSuccessResult(
        promptPath,
        substitutionResult.content,
        substitutionResult.usedVariables,
        substitutionResult.missingVariables,
        frontmatter
      );
    } catch (error) {
      console.error(`getPrompted error for '${promptName}':`, error);
      return this.createErrorResult(error as Error, promptName);
    }
  }

  /**
   * Discover prompt using hierarchical search algorithm
   */
  private async discoverPrompt(
    name: string,
    searchPaths?: string[]
  ): Promise<string> {
    const paths = searchPaths || [
      this.config.promptsPath,
      this.config.templatesPath,
    ];

    for (const basePath of paths) {
      // 1. Exact filename match
      const exactMatch = await this.findExactMatch(basePath, name);
      if (exactMatch) return exactMatch;

      // 2. Alias resolution via frontmatter
      const aliasMatch = await this.findByAlias(basePath, name);
      if (aliasMatch) return aliasMatch;

      // 3. Fuzzy filename search
      const fuzzyMatch = await this.findFuzzyMatch(basePath, name);
      if (fuzzyMatch) return fuzzyMatch;

      // 4. Content search
      const contentMatch = await this.findByContent(basePath, name);
      if (contentMatch) return contentMatch;
    }

    // If no matches found, provide helpful suggestions
    try {
      const absolutePaths = paths.map(path =>
        path.startsWith('/')
          ? path
          : resolveVaultPath(path, this.config.allowedDirectories)
      );
      const suggestions = await this.getSuggestions(absolutePaths, name);
      const suggestionText =
        suggestions.length > 0
          ? ` Did you mean: ${suggestions.slice(0, 3).join(', ')}?`
          : '';

      throw new Error(`Prompt not found: ${name}.${suggestionText}`);
    } catch (suggestionError: any) {
      // If suggestion generation fails, just return basic error
      if (suggestionError?.message?.startsWith('Prompt not found:')) {
        // This is our own error being re-thrown, just pass it through
        throw suggestionError;
      }
      // This is a different error from suggestion generation
      throw new Error(`Prompt not found: ${name}.`);
    }
  }

  // Discovery methods - implemented
  private async findExactMatch(
    basePath: string,
    name: string
  ): Promise<string | null> {
    const searchPath = resolveVaultPath(
      basePath,
      this.config.allowedDirectories
    );

    // Try common variations of the filename
    const variations = [
      name, // exact name
      `${name}.md`, // with .md extension
      `${name}.txt`, // with .txt extension
      name.toLowerCase(), // lowercase
      `${name.toLowerCase()}.md`, // lowercase with .md
    ];

    for (const variation of variations) {
      try {
        const validatedPath = validateVaultPath(
          variation,
          searchPath,
          this.config.allowedDirectories
        );
        const pathInfo = await getPathInfo(validatedPath);

        if (
          pathInfo.exists &&
          pathInfo.isFile &&
          isAllowedFileType(validatedPath)
        ) {
          return validatedPath;
        }
      } catch {
        // Continue trying other variations
        continue;
      }
    }

    return null;
  }

  private async findByAlias(
    basePath: string,
    name: string
  ): Promise<string | null> {
    try {
      const searchPath = resolveVaultPath(
        basePath,
        this.config.allowedDirectories
      );

      // Get all files in the directory
      const entries = await readdir(searchPath, { withFileTypes: true });
      const files = entries
        .filter(entry => entry.isFile() && isAllowedFileType(entry.name))
        .map(entry => join(searchPath, entry.name));

      // Search through each file's aliases
      for (const filePath of files) {
        try {
          const content = await readFile(filePath, 'utf-8');
          const parsed = this.obsidianUtils.parseObsidianFile(content);

          // Check aliases in frontmatter
          const aliases = parsed.frontmatter.aliases || [];
          const aliasArray = Array.isArray(aliases) ? aliases : [aliases];

          // Check for exact alias match (case-insensitive)
          for (const alias of aliasArray) {
            if (
              typeof alias === 'string' &&
              alias.toLowerCase() === name.toLowerCase()
            ) {
              return filePath;
            }
          }
        } catch {
          // Skip files that can't be parsed
          continue;
        }
      }

      return null;
    } catch (error: any) {
      // Only log if it's not a simple "directory doesn't exist" error
      if (error.code !== 'ENOENT') {
        console.warn(`Alias search error in ${basePath}:`, error);
      }
      return null;
    }
  }

  private async findFuzzyMatch(
    basePath: string,
    name: string
  ): Promise<string | null> {
    try {
      const searchPath = resolveVaultPath(
        basePath,
        this.config.allowedDirectories
      );

      // Get all files in the directory
      const entries = await readdir(searchPath, { withFileTypes: true });
      const files = entries
        .filter(entry => entry.isFile() && isAllowedFileType(entry.name))
        .map(entry => ({
          name: entry.name,
          path: join(searchPath, entry.name),
        }));

      // Calculate fuzzy match scores
      const matches = files
        .map(file => ({
          ...file,
          score: this.calculateFuzzyScore(
            name.toLowerCase(),
            file.name.toLowerCase()
          ),
        }))
        .filter(file => file.score > 0.3) // Minimum threshold
        .sort((a, b) => b.score - a.score);

      if (matches.length > 0) {
        // Validate the best match
        const bestMatch = matches[0];
        const pathInfo = await getPathInfo(bestMatch.path);

        if (pathInfo.exists && pathInfo.isFile) {
          return bestMatch.path;
        }
      }

      return null;
    } catch (error: any) {
      // Only log if it's not a simple "directory doesn't exist" error
      if (error.code !== 'ENOENT') {
        console.warn(`Fuzzy match error in ${basePath}:`, error);
      }
      return null;
    }
  }

  private async findByContent(
    basePath: string,
    name: string
  ): Promise<string | null> {
    try {
      const searchPath = resolveVaultPath(
        basePath,
        this.config.allowedDirectories
      );

      // Get all files in the directory
      const entries = await readdir(searchPath, { withFileTypes: true });
      const files = entries
        .filter(entry => entry.isFile() && isAllowedFileType(entry.name))
        .map(entry => join(searchPath, entry.name));

      const searchLower = name.toLowerCase();
      const matches: { path: string; score: number }[] = [];

      // Search through each file's content and title
      for (const filePath of files) {
        try {
          const content = await readFile(filePath, 'utf-8');
          const parsed = this.obsidianUtils.parseObsidianFile(content);

          let score = 0;

          // Check title in frontmatter
          const title = parsed.frontmatter.title;
          if (title && typeof title === 'string') {
            if (title.toLowerCase().includes(searchLower)) {
              score += 0.8 * (searchLower.length / title.length);
            }
          }

          // Check content (but weight it lower than title)
          const contentLower = parsed.content.toLowerCase();
          if (contentLower.includes(searchLower)) {
            // Count occurrences but cap the influence
            const occurrences = (
              contentLower.match(new RegExp(searchLower, 'g')) || []
            ).length;
            score += Math.min(0.5, occurrences * 0.1);
          }

          if (score > 0) {
            matches.push({ path: filePath, score });
          }
        } catch {
          // Skip files that can't be parsed
          continue;
        }
      }

      // Return the best match if above threshold
      if (matches.length > 0) {
        matches.sort((a, b) => b.score - a.score);
        const bestMatch = matches[0];
        if (bestMatch.score > 0.2) {
          return bestMatch.path;
        }
      }

      return null;
    } catch (error: any) {
      // Only log if it's not a simple "directory doesn't exist" error
      if (error.code !== 'ENOENT') {
        console.warn(`Content search error in ${basePath}:`, error);
      }
      return null;
    }
  }

  /**
   * Get suggestions for similar prompt names when exact match fails
   */
  async getSuggestions(searchPaths: string[], name: string): Promise<string[]> {
    const allSuggestions: { name: string; score: number }[] = [];

    for (const basePath of searchPaths) {
      try {
        // For absolute paths, use them directly instead of resolveVaultPath
        const searchPath = basePath.startsWith('/')
          ? basePath
          : resolveVaultPath(basePath, this.config.allowedDirectories);

        const entries = await readdir(searchPath, { withFileTypes: true });
        const files = entries
          .filter(entry => entry.isFile() && isAllowedFileType(entry.name))
          .map(entry => ({
            name: entry.name.replace(/\.(md|txt)$/, ''),
            path: join(searchPath, entry.name),
          }));

        // Calculate scores for all files
        for (const file of files) {
          const score = this.calculateFuzzyScore(
            name.toLowerCase(),
            file.name.toLowerCase()
          );
          if (score > 0.2) {
            // Lower threshold for suggestions
            allSuggestions.push({ name: file.name, score });
          }

          // Also check aliases for suggestions
          try {
            const content = await readFile(file.path, 'utf-8');
            const parsed = this.obsidianUtils.parseObsidianFile(content);
            const aliases = parsed.frontmatter.aliases || [];
            const aliasArray = Array.isArray(aliases) ? aliases : [aliases];

            for (const alias of aliasArray) {
              if (typeof alias === 'string') {
                const aliasScore = this.calculateFuzzyScore(
                  name.toLowerCase(),
                  alias.toLowerCase()
                );
                if (aliasScore > 0.2) {
                  allSuggestions.push({ name: alias, score: aliasScore * 0.9 }); // Slightly lower score for aliases
                }
              }
            }
          } catch {
            // Skip files that can't be parsed
          }
        }
      } catch {
        // Skip paths that can't be accessed
        continue;
      }
    }

    // Sort by score and return top suggestions
    return allSuggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.name);
  }

  /**
   * Calculate fuzzy match score between search term and filename
   */
  private calculateFuzzyScore(search: string, filename: string): number {
    // Remove file extensions for scoring
    const cleanFilename = filename.replace(/\.(md|txt)$/, '');

    // Exact match gets highest score
    if (cleanFilename === search) return 1.0;

    // Check for substring matches
    if (cleanFilename.includes(search)) {
      return 0.8 * (search.length / cleanFilename.length);
    }

    // Check for word boundary matches
    const searchWords = search.split(/[\s-_]+/);
    const filenameWords = cleanFilename.split(/[\s-_]+/);

    let matchedWords = 0;
    for (const searchWord of searchWords) {
      for (const filenameWord of filenameWords) {
        if (
          filenameWord.includes(searchWord) ||
          searchWord.includes(filenameWord)
        ) {
          matchedWords++;
          break;
        }
      }
    }

    if (matchedWords > 0) {
      return 0.6 * (matchedWords / searchWords.length);
    }

    // Check for character overlap (basic Levenshtein-like)
    const commonChars = this.countCommonCharacters(search, cleanFilename);
    const maxLen = Math.max(search.length, cleanFilename.length);
    const charScore = commonChars / maxLen;

    return charScore > 0.4 ? charScore * 0.5 : 0;
  }

  /**
   * Count common characters between two strings
   */
  private countCommonCharacters(str1: string, str2: string): number {
    const chars1 = str1.split('').sort();
    const chars2 = str2.split('').sort();
    let common = 0;
    let i = 0,
      j = 0;

    while (i < chars1.length && j < chars2.length) {
      if (chars1[i] === chars2[j]) {
        common++;
        i++;
        j++;
      } else if (chars1[i] < chars2[j]) {
        i++;
      } else {
        j++;
      }
    }

    return common;
  }

  /**
   * Load and parse a prompt file from the filesystem
   */
  async loadPromptFile(
    filePath: string
  ): Promise<{ content: string; frontmatter: Record<string, any> }> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = this.obsidianUtils.parseObsidianFile(content);

      return {
        content: parsed.content,
        frontmatter: parsed.frontmatter,
      };
    } catch (error: any) {
      throw new Error(
        `Failed to load prompt file '${filePath}': ${error.message}`
      );
    }
  }

  /**
   * List all prompt files in a directory (for future use)
   */
  async listPromptFiles(directoryPath: string): Promise<string[]> {
    try {
      const validatedPath = validateVaultPath(
        directoryPath,
        this.config.allowedDirectories[0],
        this.config.allowedDirectories
      );
      const entries = await readdir(validatedPath, { withFileTypes: true });

      return entries
        .filter(entry => entry.isFile() && isAllowedFileType(entry.name))
        .map(entry => join(validatedPath, entry.name));
    } catch (error: any) {
      console.warn(
        `Failed to list prompt files in '${directoryPath}': ${error.message}`
      );
      return [];
    }
  }

  // Processing methods - implemented
  private validateVariables(
    specs: any,
    providedVars: Record<string, any>
  ): { isValid: boolean; missing: string[]; errors: string[] } {
    // If specs is not an array of VariableSpec, convert it
    const variableSpecs = Array.isArray(specs)
      ? specs
      : this.obsidianUtils.extractVariableSpecs({ 'prompt-vars': specs });

    const validation = this.obsidianUtils.validateVariables(
      variableSpecs,
      providedVars
    );

    return {
      isValid: validation.isValid,
      missing: validation.missing.map(spec => spec.name),
      errors: validation.errors,
    };
  }

  private resolveTemplaterSyntax(
    content: string,
    variables: Record<string, any>,
    filePath?: string
  ): string {
    return this.templateProcessor.processTemplate(
      content,
      variables,
      {},
      filePath
    );
  }

  /**
   * Enhanced variable substitution with support for various formats
   */
  private substituteVariables(
    content: string,
    variables: Record<string, any>
  ): {
    content: string;
    usedVariables: Record<string, any>;
    missingVariables: string[];
  } {
    const usedVariables: Record<string, any> = {};
    const missingVariables: string[] = [];

    // Handle {{variable}} and {{variable:default}} syntax
    const processedContent = content.replace(
      /\{\{([^}]+)\}\}/g,
      (match, varExpression) => {
        const [varName, defaultValue] = varExpression
          .split(':')
          .map((s: string) => s.trim());

        if (varName in variables) {
          const value = variables[varName];
          usedVariables[varName] = value;
          return String(value);
        } else if (defaultValue !== undefined) {
          usedVariables[varName] = defaultValue;
          return defaultValue;
        } else {
          missingVariables.push(varName);
          return match; // Keep original placeholder
        }
      }
    );

    return {
      content: processedContent,
      usedVariables,
      missingVariables: [...new Set(missingVariables)], // Remove duplicates
    };
  }

  /**
   * Merge variables with defaults from variable specifications
   */
  private mergeVariablesWithDefaults(
    variables: Record<string, any>,
    specs: any[]
  ): Record<string, any> {
    const merged = { ...variables };

    for (const spec of specs) {
      if (spec.default !== undefined && !(spec.name in merged)) {
        merged[spec.name] = spec.default;
      }
    }

    return merged;
  }

  /**
   * Extract all variable references from content and frontmatter
   */
  private collectAllVariables(
    content: string,
    frontmatter: Record<string, any>
  ): { contentVariables: string[]; specVariables: any[] } {
    const contentVariables =
      this.obsidianUtils.extractContentVariables(content);
    const specVariables = this.obsidianUtils.extractVariableSpecs(frontmatter);

    return {
      contentVariables,
      specVariables,
    };
  }

  /**
   * Find missing required variables from specs
   */
  private findMissingRequiredVariables(
    specVariables: any[],
    providedVariables: Record<string, any>
  ): VariableSpec[] {
    return specVariables.filter(
      spec => spec.required && !(spec.name in providedVariables)
    );
  }

  /**
   * Create result for missing variables (lets LLM ask for them)
   */
  private createMissingVariablesResult(
    promptPath: string,
    missingVariables: VariableSpec[],
    frontmatter: Record<string, any>
  ): GetPromptedResult {
    const fileName = basename(promptPath, extname(promptPath));
    const variableList = missingVariables
      .map(
        v =>
          `- **${v.name}** (${v.type})${v.description ? `: ${v.description}` : ''}`
      )
      .join('\n');

    const content = `# Missing Required Variables for "${frontmatter.title || fileName}"

This prompt requires the following variables to be provided:

${variableList}

Please provide values for these variables and call get_prompted again with the variables parameter.`;

    return {
      resolved: true,
      autoApplyRecommended: false,
      confidence: 1.0,
      chosen: {
        id: fileName,
        name: fileName,
        path: promptPath,
        title: frontmatter.title || fileName,
        aliases: [],
        tags: [],
        frontmatterExcerpt: this.createFrontmatterExcerpt(frontmatter),
      },
      content,
      variablesUsed: {},
      missingVariables,
      candidates: [],
      unresolvedLinks: [],
      processing: {
        templaterProcessed: false,
        wikilinkResolution: false,
        variableInterpolation: false,
      },
      actionRecommendations: [],
      autoExecuted: false,
      executionResults: [],
    };
  }

  /**
   * Create a successful GetPromptedResult (simplified)
   */
  private createSuccessResult(
    promptPath: string,
    processedContent: string,
    usedVariables: Record<string, any>,
    missingVariables: string[],
    frontmatter: Record<string, any>
  ): GetPromptedResult {
    const fileName = basename(promptPath, extname(promptPath));
    const parsed = this.obsidianUtils.parseObsidianFile(
      `---\n${JSON.stringify(frontmatter)}\n---\n`
    );

    return {
      resolved: true,
      autoApplyRecommended: false, // Let LLM decide what to do
      confidence: 1.0,
      chosen: {
        id: fileName,
        name: fileName,
        path: promptPath,
        title: frontmatter.title || fileName,
        aliases: parsed.aliases,
        tags: parsed.tags,
        frontmatterExcerpt: this.createFrontmatterExcerpt(frontmatter),
      },
      content: processedContent,
      variablesUsed: usedVariables,
      missingVariables: this.convertMissingVariablesToSpecs(
        missingVariables,
        frontmatter
      ),
      candidates: [],
      unresolvedLinks: [],
      processing: {
        templaterProcessed: this.config.templaterLite || false,
        wikilinkResolution: false,
        variableInterpolation: true,
      },
      actionRecommendations: [], // No automatic action detection
      autoExecuted: false, // No auto-execution
      executionResults: [], // No executions performed
    };
  }

  /**
   * Create an error GetPromptedResult
   */
  private createErrorResult(
    error: Error,
    promptName: string,
    candidates: PromptHit[] = []
  ): GetPromptedResult {
    const errorCode =
      error instanceof EnhancedMcpError ? error.code : 'unknown_error';

    return {
      resolved: false,
      autoApplyRecommended: false,
      confidence: 0,
      content: '',
      variablesUsed: {},
      missingVariables: [],
      candidates,
      unresolvedLinks: [],
      processing: {
        templaterProcessed: false,
        wikilinkResolution: false,
        variableInterpolation: false,
      },
      // Enhanced action detection
      actionRecommendations: [],
      autoExecuted: false,
      executionResults: [],
      error: {
        code: errorCode,
        message: error.message,
        details: error instanceof EnhancedMcpError ? error.details : undefined,
      },
    };
  }

  /**
   * Create a frontmatter excerpt for display
   */
  private createFrontmatterExcerpt(frontmatter: Record<string, any>): string {
    const relevant = {
      title: frontmatter.title,
      description: frontmatter.description,
      'prompt-vars': frontmatter['prompt-vars'] || frontmatter.variables,
      aliases: frontmatter.aliases,
      tags: frontmatter.tags,
    };

    // Filter out undefined values
    const filtered = Object.fromEntries(
      Object.entries(relevant).filter(([_, value]) => value !== undefined)
    );

    return Object.keys(filtered).length > 0
      ? JSON.stringify(filtered, null, 2)
      : '';
  }

  /**
   * Convert missing variable names to VariableSpec objects
   */
  private convertMissingVariablesToSpecs(
    missingVariables: string[],
    frontmatter: Record<string, any>
  ): VariableSpec[] {
    const specs = this.obsidianUtils.extractVariableSpecs(frontmatter);

    return missingVariables.map(varName => {
      // Try to find spec for this variable
      const existingSpec = specs.find(spec => spec.name === varName);
      if (existingSpec) {
        return existingSpec;
      }

      // Create a default spec
      return {
        name: varName,
        type: 'string',
        required: true,
        description: `Missing variable: ${varName}`,
      };
    });
  }

  /**
   * Format error message for user-friendly display
   */
  private formatErrorMessage(error: Error, promptName: string): string {
    if (error instanceof EnhancedMcpError) {
      switch (error.code) {
        case 'prompt_not_found':
          return `Could not find prompt '${promptName}'. Check that the file exists in your prompts directory.`;
        case 'path_outside_allowed_directories':
          return `Access denied: The requested prompt path is outside the allowed directories.`;
        case 'missing_required_variables':
          return `Missing required variables for prompt '${promptName}'. Please provide all required variables.`;
        default:
          return error.message;
      }
    }

    return `Failed to process prompt '${promptName}': ${error.message}`;
  }
}
