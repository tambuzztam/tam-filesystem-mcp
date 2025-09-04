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
  ActionRecommendation,
  ExecutionResult,
} from './types.js';
import { ObsidianUtils } from './obsidian.js';
import { TemplateProcessor } from './templates.js';
import {
  validateVaultPath,
  getPathInfo,
  isAllowedFileType,
} from './security.js';
import { resolveVaultPath } from './config.js';
import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { join, basename, extname, dirname } from 'path';

export class PromptManager {
  private templateProcessor: TemplateProcessor;

  constructor(
    private config: VaultConfig,
    private obsidianUtils: ObsidianUtils
  ) {
    this.templateProcessor = new TemplateProcessor(config);
  }

  /**
   * The flagship function: Intelligently discover, load, and process prompts
   * Phase 1 implementation with basic functionality
   */
  async getPrompted(
    promptName: string,
    variables: Record<string, any> = {},
    options: PromptOptions = {}
  ): Promise<GetPromptedResult> {
    try {
      // 1. Intelligent Discovery (Phase 1: exact filename matching only)
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

      // 2. Load and Parse Obsidian Content
      const { content, frontmatter } = await this.loadPromptFile(promptPath);
      const { specVariables } = this.collectAllVariables(content, frontmatter);

      // 3. Merge variables with defaults from specifications
      const mergedVariables = this.mergeVariablesWithDefaults(
        variables,
        specVariables
      );

      // 4. Variable Validation (if strict mode or specs exist)
      if (options.strictVariables || specVariables.length > 0) {
        const validation = this.validateVariables(
          specVariables,
          mergedVariables
        );
        if (!validation.isValid && options.strictVariables) {
          throw new EnhancedMcpError(
            'missing_required_variables',
            `Missing required variables: ${validation.missing.join(', ')}`,
            { missing: validation.missing, errors: validation.errors }
          );
        }
      }

      // 5. Template Processing
      let processedContent = content;

      // Handle Templater syntax (Phase 1: basic tp.date.now, tp.file.title)
      if (options.processTemplater !== false && this.config.templaterLite) {
        processedContent = this.resolveTemplaterSyntax(
          processedContent,
          mergedVariables,
          promptPath
        );
      }

      // Handle variable substitution with {{variable}} syntax
      const substitutionResult = this.substituteVariables(
        processedContent,
        mergedVariables
      );
      processedContent = substitutionResult.content;

      // Handle wikilink resolution (Phase 1: not implemented, placeholder)
      if (options.includeWikilinks) {
        // Phase 2 feature - for now just log
        console.log(
          'Wikilink resolution requested but not yet implemented in Phase 1'
        );
      }

      // 6. Analyze content for actionable patterns
      const actionRecommendations = this.analyzeForActions(
        processedContent,
        mergedVariables,
        promptPath
      );

      // 7. Execute high-confidence actions automatically
      const executionResults: ExecutionResult[] = [];
      const autoExecutable = actionRecommendations.filter(
        a => a.autoExecutable && a.confidence > 0.8
      );

      if (autoExecutable.length > 0) {
        for (const action of autoExecutable) {
          try {
            const result = await this.executeAction(action);
            executionResults.push(result);
          } catch (error: any) {
            executionResults.push({
              actionType: action.type,
              success: false,
              message: `Failed to execute ${action.type}: ${error.message}`,
              details: error,
            });
          }
        }
      }

      // 8. Create successful result with action information
      return this.createSuccessResult(
        promptPath,
        processedContent,
        substitutionResult.usedVariables,
        substitutionResult.missingVariables,
        frontmatter,
        actionRecommendations,
        executionResults
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

    throw new Error(`Prompt not found: ${name}`);
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
    // For Phase 1, return null - this will be implemented in Phase 2
    // This method would scan frontmatter of all files looking for aliases
    console.log(`findByAlias: ${basePath}/${name} - Phase 2 feature`);
    return null;
  }

  private async findFuzzyMatch(
    basePath: string,
    name: string
  ): Promise<string | null> {
    // For Phase 1, return null - this will be implemented in Phase 2
    // This method would use fuzzy string matching
    console.log(`findFuzzyMatch: ${basePath}/${name} - Phase 2 feature`);
    return null;
  }

  private async findByContent(
    basePath: string,
    name: string
  ): Promise<string | null> {
    // For Phase 1, return null - this will be implemented in Phase 2
    // This method would search file contents
    console.log(`findByContent: ${basePath}/${name} - Phase 2 feature`);
    return null;
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
   * Create a successful GetPromptedResult
   */
  private createSuccessResult(
    promptPath: string,
    processedContent: string,
    usedVariables: Record<string, any>,
    missingVariables: string[],
    frontmatter: Record<string, any>,
    actionRecommendations: ActionRecommendation[] = [],
    executionResults: ExecutionResult[] = []
  ): GetPromptedResult {
    const fileName = basename(promptPath, extname(promptPath));
    const parsed = this.obsidianUtils.parseObsidianFile(
      `---\n${JSON.stringify(frontmatter)}\n---\n`
    );

    return {
      resolved: true,
      autoApplyRecommended: true,
      confidence: 1.0, // Exact match has full confidence
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
      candidates: [], // Only one candidate in Phase 1
      unresolvedLinks: [], // Phase 1: No wikilink resolution
      processing: {
        templaterProcessed: this.config.templaterLite || false,
        wikilinkResolution: false, // Phase 1: Not implemented yet
        variableInterpolation: true,
      },
      // Enhanced action detection
      actionRecommendations,
      autoExecuted: executionResults.length > 0,
      executionResults,
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
   * Analyze processed prompt content for actionable patterns
   */
  private analyzeForActions(
    content: string,
    variables: Record<string, any>,
    _promptPath: string
  ): ActionRecommendation[] {
    const recommendations: ActionRecommendation[] = [];
    const lines = content.split('\n');

    // Pattern 1: File creation instructions
    const fileCreationPatterns = [
      /create.*(?:file|document).*(?:in|at|to)\s+([^\s]+)/i,
      /write.*to\s+([^\s]+)/i,
      /save.*as\s+([^\s]+)/i,
      /filename:\s*([^\s]+)/i,
      /location:\s*([^\s]+)/i,
      /create.*(?:a complete|the complete)\s+([\w.-]+)/i,
      /generate.*(?:the|a)\s+([\w.-]+)\s+(?:file|content)/i,
      /output.*(?:format|as).*([\w.-]+)/i,
    ];

    for (const line of lines) {
      for (const pattern of fileCreationPatterns) {
        const match = line.match(pattern);
        if (match) {
          const suggestedPath = this.extractFilePath(match[1], variables);
          if (suggestedPath) {
            recommendations.push({
              type: 'create_file',
              description: `Create file at ${suggestedPath}`,
              parameters: {
                path: suggestedPath,
                content: this.extractContentForFile(content, line),
              },
              confidence: 0.9,
              autoExecutable: true,
              reasoning: `Detected file creation instruction: "${line.trim()}"`,
            });
          }
        }
      }
    }

    // Pattern 1.5: Smart README detection
    if (
      content.toLowerCase().includes('readme') &&
      (content.toLowerCase().includes('generate') ||
        content.toLowerCase().includes('create'))
    ) {
      const suggestedPath = this.generateSafeDocumentationPath(variables);
      recommendations.push({
        type: 'create_file',
        description: `Create documentation file at ${suggestedPath}`,
        parameters: {
          path: suggestedPath,
          content: this.generateDocumentationContent(content, variables),
        },
        confidence: 0.95,
        autoExecutable: true,
        reasoning:
          'Detected README.md generation request in documentation prompt',
      });
    }
    // Pattern 2: Task operations
    const taskPatterns = [
      /update.*task.*([a-zA-Z0-9-_]+)/i,
      /check.*off.*([a-zA-Z0-9-_]+)/i,
      /mark.*complete.*([a-zA-Z0-9-_]+)/i,
    ];

    for (const line of lines) {
      for (const pattern of taskPatterns) {
        const match = line.match(pattern);
        if (match) {
          recommendations.push({
            type: 'update_task',
            description: `Update task ${match[1]}`,
            parameters: {
              taskName: match[1],
              updates: this.extractTaskUpdates(line),
            },
            confidence: 0.8,
            autoExecutable: false, // Require explicit confirmation for task updates
            reasoning: `Detected task update instruction: "${line.trim()}"`,
          });
        }
      }
    }

    // Deduplicate recommendations by path and type
    const dedupedRecommendations = recommendations.filter((rec, index) => {
      const key = `${rec.type}:${rec.parameters.path}`;
      return (
        recommendations.findIndex(
          r => `${r.type}:${r.parameters.path}` === key
        ) === index
      );
    });

    return dedupedRecommendations;
  }

  /**
   * Extract and normalize file path from instruction text
   */
  private extractFilePath(
    rawPath: string,
    variables: Record<string, any>
  ): string | null {
    try {
      // Clean up the path
      let path = rawPath.trim().replace(/["'`]/g, '');

      // Handle variable substitution in paths
      path = path.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        return variables[varName.trim()] || match;
      });

      // Ensure path is relative to vault
      if (path.startsWith('/')) {
        path = path.slice(1);
      }

      // Add .md extension if no extension provided
      if (!path.includes('.')) {
        path += '.md';
      }

      return path;
    } catch (error) {
      console.warn(`Failed to extract file path from: ${rawPath}`, error);
      return null;
    }
  }

  /**
   * Extract content intended for file creation
   */
  private extractContentForFile(
    fullContent: string,
    _instructionLine: string
  ): string {
    // For now, return the full processed content
    // In Phase 2, we could implement smarter content extraction
    return fullContent;
  }

  /**
   * Generate a safe path for documentation files to avoid conflicts
   */
  private generateSafeDocumentationPath(
    variables: Record<string, any>
  ): string {
    const serverName = variables.server_name || 'mcp-server';

    // Generate in vault-appropriate location
    // For documentation, put at vault root with clear naming
    // Future options could include: utilities/documentation/, reference/, etc.
    return `${serverName}-documentation.md`;
  }

  /**
   * Generate documentation content based on template and variables
   */
  private generateDocumentationContent(
    templateContent: string,
    variables: Record<string, any>
  ): string {
    const serverName = variables.server_name || 'MCP Server';
    const serverDescription =
      variables.server_description || 'A Model Context Protocol server';
    const toolsList = variables.tools_list || [];
    const installationMethod = variables.installation_method || 'npm install';
    const useCases = variables.example_use_cases || [];

    return `# ${serverName}

${serverDescription}

## Installation

\`\`\`bash
${installationMethod}
\`\`\`

## Tools

This server provides the following tools:

${toolsList.map((tool: string) => `- **${tool}**: [Description needed]`).join('\n')}

## Usage Examples

${useCases.map((useCase: string) => `### ${useCase}\n\n[Example needed]`).join('\n\n')}

## Configuration

Add this server to your MCP client configuration:

\`\`\`json
{
  "mcpServers": {
    "${serverName}": {
      "command": "node",
      "args": ["path/to/server/dist/index.js"]
    }
  }
}
\`\`\`

## Development

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Build the project: \`npm run build\`
4. Test the server: \`npm test\`

## License

MIT License
`;
  }

  /**
   * Extract task updates from instruction text
   */
  private extractTaskUpdates(_instructionLine: string): Record<string, any> {
    // Basic implementation - mark as completed
    return { completed: true };
  }

  /**
   * Execute a single action recommendation
   */
  private async executeAction(
    action: ActionRecommendation
  ): Promise<ExecutionResult> {
    switch (action.type) {
      case 'create_file':
        return await this.executeFileCreation(action);
      case 'update_task':
        return await this.executeTaskUpdate(action);
      default:
        return {
          actionType: action.type,
          success: false,
          message: `Action type ${action.type} not yet implemented`,
        };
    }
  }

  /**
   * Execute file creation action
   */
  private async executeFileCreation(
    action: ActionRecommendation
  ): Promise<ExecutionResult> {
    const { path, content } = action.parameters;

    if (!path || !content) {
      return {
        actionType: 'create_file',
        success: false,
        message: 'Missing required parameters: path or content',
      };
    }

    try {
      // Resolve full path within vault
      const fullPath = resolveVaultPath(path, this.config.allowedDirectories);

      // Find an available filename using auto-increment
      const availablePath = await this.findAvailableFilePath(fullPath);
      const finalPath = availablePath.path;
      const wasIncremented = availablePath.incremented;

      // Ensure directory exists
      await mkdir(dirname(finalPath), { recursive: true });

      // Write file
      await writeFile(finalPath, content, 'utf-8');

      // Create success message with increment info
      const relativeFinalPath = finalPath.replace(
        this.config.allowedDirectories[0] + '/',
        ''
      );
      const message = wasIncremented
        ? `Successfully created file: ${relativeFinalPath} (auto-incremented to avoid conflict)`
        : `Successfully created file: ${relativeFinalPath}`;

      return {
        actionType: 'create_file',
        success: true,
        message,
        details: {
          path: finalPath,
          originalPath: fullPath,
          wasIncremented,
          size: content.length,
        },
      };
    } catch (error: any) {
      return {
        actionType: 'create_file',
        success: false,
        message: `Failed to create file: ${error.message}`,
        details: error,
      };
    }
  }

  /**
   * Find an available file path using intelligent auto-increment
   */
  private async findAvailableFilePath(originalPath: string): Promise<{
    path: string;
    incremented: boolean;
  }> {
    const pathInfo = await getPathInfo(originalPath);

    // If original path is available, use it
    if (!pathInfo.exists) {
      return { path: originalPath, incremented: false };
    }

    // Extract components for auto-increment
    const dirname = originalPath.substring(0, originalPath.lastIndexOf('/'));
    const filename = originalPath.substring(originalPath.lastIndexOf('/') + 1);
    const lastDot = filename.lastIndexOf('.');

    let baseName: string;
    let extension: string;

    if (lastDot === -1) {
      baseName = filename;
      extension = '';
    } else {
      baseName = filename.substring(0, lastDot);
      extension = filename.substring(lastDot);
    }

    // Try incrementing numbers until we find an available path
    let counter = 2;
    const maxAttempts = 100; // Prevent infinite loops

    while (counter <= maxAttempts) {
      const incrementedName = `${baseName}-${counter}${extension}`;
      const incrementedPath = `${dirname}/${incrementedName}`;

      const incrementedPathInfo = await getPathInfo(incrementedPath);
      if (!incrementedPathInfo.exists) {
        return { path: incrementedPath, incremented: true };
      }

      counter++;
    }

    // Fallback with timestamp if we hit max attempts
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const timestampName = `${baseName}-${timestamp}${extension}`;
    const timestampPath = `${dirname}/${timestampName}`;

    return { path: timestampPath, incremented: true };
  }

  /**
   * Execute task update action
   */
  private async executeTaskUpdate(
    _action: ActionRecommendation
  ): Promise<ExecutionResult> {
    // Placeholder for task update functionality
    return {
      actionType: 'update_task',
      success: false,
      message: 'Task update functionality not yet implemented',
    };
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
