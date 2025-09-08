/**
 * Enhanced Filesystem Server
 *
 * Extends the canonical MCP filesystem server with Obsidian-aware
 * task and prompt management capabilities.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Import filesystem server functionality (using custom type declarations)
import {
  setAllowedDirectories,
  getAllowedDirectories,
  validatePath,
  getFileStats,
  readFileContent,
  writeFileContent,
  // applyFileEdits, // TODO: Will be used for edit_file functionality
  formatSize,
} from '@modelcontextprotocol/server-filesystem/dist/lib.js';

import { VaultConfig } from './types.js';
import { ObsidianUtils } from './obsidian.js';
import { PromptManager } from './prompts.js';
import { TaskManager } from './tasks.js';
import { TemplateProcessor } from './templates.js';
import { EnhancedListingService } from './enhanced-listing.js';
import { ReadmeGenerationService } from './readme-generation.js';
import { DirectoryChangeDetectionService } from './directory-change-detection.js';

/**
 * EnhancedFilesystemServer extends the canonical filesystem server
 * with domain-specific intelligence for philosophical counseling workflows
 */
export class EnhancedFilesystemServer {
  private obsidianUtils: ObsidianUtils;
  private promptManager: PromptManager;
  private taskManager: TaskManager;
  private templateProcessor: TemplateProcessor;
  private enhancedListing: EnhancedListingService;
  private readmeGeneration: ReadmeGenerationService;
  private changeDetection: DirectoryChangeDetectionService;

  constructor(private config: VaultConfig) {
    // Set up the base filesystem server's allowed directories
    setAllowedDirectories(config.allowedDirectories);

    // Initialize enhanced subsystems
    this.obsidianUtils = new ObsidianUtils(config);
    this.promptManager = new PromptManager(config, this.obsidianUtils);
    this.taskManager = new TaskManager(config, this.obsidianUtils);
    this.templateProcessor = new TemplateProcessor(config);
    this.enhancedListing = new EnhancedListingService(
      config.allowedDirectories
    );
    this.readmeGeneration = new ReadmeGenerationService(
      config.allowedDirectories
    );
    this.changeDetection = new DirectoryChangeDetectionService(
      config.allowedDirectories
    );
  }

  /**
   * Register all enhanced tools with the MCP server
   */
  async registerTools(server: Server): Promise<void> {
    // Schema definitions for enhanced tools
    const GetPromptedArgsSchema = z.object({
      promptName: z
        .string()
        .describe('Name or partial name of the prompt to load'),
      variables: z
        .record(z.any())
        .optional()
        .describe('Variables to substitute in the prompt template'),
      options: z
        .object({
          includeWikilinks: z.boolean().optional().default(false),
          processTemplater: z.boolean().optional().default(true),
          searchPaths: z.array(z.string()).optional(),
          strictVariables: z.boolean().optional().default(false),
        })
        .optional(),
    });

    const CreateTaskArgsSchema = z.object({
      name: z.string().describe('Task name'),
      description: z.string().describe('Task description'),
      checklist: z.array(z.string()).describe('Checklist items'),
      metadata: z.record(z.any()).optional().describe('Task metadata'),
    });

    const CreatePromptArgsSchema = z.object({
      purpose: z
        .string()
        .describe(
          'What the new prompt should help accomplish (e.g., "analyze session transcripts", "create weekly reports")'
        ),
      targetFilename: z
        .string()
        .optional()
        .describe(
          'Optional filename for the new prompt (will be auto-generated if not provided)'
        ),
    });

    // Register tool listing handler that includes ALL tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // BASE FILESYSTEM TOOLS (from canonical server)
          {
            name: 'read_text_file',
            description:
              'Read the complete contents of a file from the file system as text. Only works within allowed directories.',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                tail: {
                  type: 'number',
                  description:
                    'If provided, returns only the last N lines of the file',
                },
                head: {
                  type: 'number',
                  description:
                    'If provided, returns only the first N lines of the file',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'write_file',
            description:
              'Create a new file or completely overwrite an existing file with new content. Only works within allowed directories.',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
              required: ['path', 'content'],
            },
          },
          {
            name: 'list_directory',
            description:
              'Get a detailed listing of all files and directories in a specified path. Only works within allowed directories.',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
          {
            name: 'search_files',
            description:
              'Recursively search for files and directories matching a pattern. Only searches within allowed directories.',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                pattern: { type: 'string' },
                excludePatterns: {
                  type: 'array',
                  items: { type: 'string' },
                  default: [],
                },
              },
              required: ['path', 'pattern'],
            },
          },
          {
            name: 'get_file_info',
            description:
              'Retrieve detailed metadata about a file or directory. Only works within allowed directories.',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
          {
            name: 'list_allowed_directories',
            description:
              'Returns the list of directories that this server is allowed to access.',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },

          // ENHANCED OBSIDIAN-AWARE TOOLS
          {
            name: 'get_prompted',
            description:
              'Quickly and easily direct the LLM to a specific prompt file using natural language. Discovers prompts by name, substitutes variables, and returns the processed content for the LLM to work with.',
            inputSchema: zodToJsonSchema(GetPromptedArgsSchema),
          },
          {
            name: 'create_prompt',
            description:
              'Create a new prompt file optimized for the getPrompted functionality. Use when the user says "create a prompt to...", "construct a prompt for...", "make a prompt that...", or similar requests to build new reusable prompts.',
            inputSchema: zodToJsonSchema(CreatePromptArgsSchema),
          },
          {
            name: 'create_task',
            description:
              'Create a new task using Task.md template with auto-populated metadata. Integrates with Obsidian templating system.',
            inputSchema: zodToJsonSchema(CreateTaskArgsSchema),
          },
          {
            name: 'update_task_progress',
            description:
              'Update task progress by modifying checklist item completion status. Supports Obsidian checkbox syntax.',
            inputSchema: {
              type: 'object',
              properties: {
                taskName: {
                  type: 'string',
                  description: 'Name of the task to update',
                },
                updates: {
                  type: 'object',
                  description: 'Checklist updates as item_text: boolean pairs',
                  additionalProperties: { type: 'boolean' },
                },
              },
              required: ['taskName', 'updates'],
            },
          },
          {
            name: 'get_task_status',
            description:
              'Get comprehensive task status including completion metrics and next actions.',
            inputSchema: {
              type: 'object',
              properties: {
                taskName: {
                  type: 'string',
                  description: 'Name of the task to analyze',
                },
              },
              required: ['taskName'],
            },
          },
          {
            name: 'link_task_to_prompt',
            description:
              'Create bidirectional links between tasks and prompts with relationship tracking.',
            inputSchema: {
              type: 'object',
              properties: {
                taskName: { type: 'string', description: 'Name of the task' },
                promptName: {
                  type: 'string',
                  description: 'Name of the prompt',
                },
                relationship: {
                  type: 'string',
                  description: 'Nature of the relationship',
                  default: 'uses',
                },
              },
              required: ['taskName', 'promptName'],
            },
          },

          // ENHANCED README AND LISTING TOOLS
          {
            name: 'check_readme_freshness',
            description:
              'Check if a README file is out of date based on directory changes and suggest refresh if needed. Useful for maintaining up-to-date documentation.',
            inputSchema: {
              type: 'object',
              properties: {
                directoryPath: {
                  type: 'string',
                  description: 'Directory path to check for README freshness',
                },
                includeSnapshot: {
                  type: 'boolean',
                  description:
                    'Whether to create a snapshot for future change detection',
                  default: true,
                },
              },
              required: ['directoryPath'],
            },
          },
          {
            name: 'list_files_with_context',
            description:
              'List directory contents with contextual README information to orient LLMs to vault structure and purpose. Use this instead of list_directory when you need to understand the context and organization of a directory.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Directory path to list with context',
                },
                maxDepth: {
                  type: 'number',
                  description: 'Maximum depth to search for README files',
                  default: 3,
                },
                includeHidden: {
                  type: 'boolean',
                  description: 'Include hidden files and directories',
                  default: false,
                },
                summarize: {
                  type: 'boolean',
                  description: 'Include AI-generated summary of README content',
                  default: true,
                },
                maxReadmeLength: {
                  type: 'number',
                  description: 'Maximum length of README content to include',
                  default: 500,
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'generate_readme_for_orientation',
            description:
              'Generate or refresh a README file in a directory that serves as an LLM task orientation guide. Analyzes directory structure and integrates user context to produce practical workspace intelligence.',
            inputSchema: {
              type: 'object',
              properties: {
                targetDirectory: {
                  type: 'string',
                  description:
                    'Directory path where README should be generated',
                },
                userContext: {
                  type: 'string',
                  description:
                    "User-provided background about the directory's purpose and role",
                },
                readmeFilename: {
                  type: 'string',
                  description: 'Name for the README file',
                  default: 'README.md',
                },
                preserveExisting: {
                  type: 'boolean',
                  description:
                    'Whether to preserve existing manual content when updating',
                  default: true,
                },
                analysisDepth: {
                  type: 'number',
                  description:
                    'How deep to look into subdirectories for context (1-2 levels)',
                  default: 1,
                  minimum: 1,
                  maximum: 3,
                },
                maxContentLength: {
                  type: 'number',
                  description: 'Maximum length of generated README content',
                  default: 2000,
                },
              },
              required: ['targetDirectory', 'userContext'],
            },
          },
        ],
      };
    });

    // Register tool call handler for both base and enhanced tools
    server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      switch (name) {
        // BASE FILESYSTEM TOOLS
        case 'read_text_file':
          return await this.handleReadTextFile(args);
        case 'write_file':
          return await this.handleWriteFile(args);
        case 'list_directory':
          return await this.handleListDirectory(args);
        case 'search_files':
          return await this.handleSearchFiles(args);
        case 'get_file_info':
          return await this.handleGetFileInfo(args);
        case 'list_allowed_directories':
          return await this.handleListAllowedDirectories(args);

        // ENHANCED OBSIDIAN-AWARE TOOLS
        case 'get_prompted':
          return await this.handleGetPrompted(args);
        case 'create_prompt':
          return await this.handleCreatePrompt(args);
        case 'create_task':
          return await this.handleCreateTask(args);
        case 'update_task_progress':
          return await this.handleUpdateTaskProgress(args);
        case 'get_task_status':
          return await this.handleGetTaskStatus(args);
        case 'link_task_to_prompt':
          return await this.handleLinkTaskToPrompt(args);

        // ENHANCED README AND LISTING TOOLS
        case 'check_readme_freshness':
          return await this.handleCheckReadmeFreshness(args);
        case 'list_files_with_context':
          return await this.handleListFilesWithContext(args);
        case 'generate_readme_for_orientation':
          return await this.handleGenerateReadmeForOrientation(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  // BASE FILESYSTEM TOOL HANDLERS (delegate to canonical server functions)
  private async handleReadTextFile(args: unknown) {
    const parsed = z
      .object({
        path: z.string(),
        tail: z.number().optional(),
        head: z.number().optional(),
      })
      .parse(args);

    const validPath = await validatePath(parsed.path);
    const content = await readFileContent(validPath);

    return {
      content: [{ type: 'text', text: content }],
    };
  }

  private async handleWriteFile(args: unknown) {
    const parsed = z
      .object({
        path: z.string(),
        content: z.string(),
      })
      .parse(args);

    const validPath = await validatePath(parsed.path);
    await writeFileContent(validPath, parsed.content);

    return {
      content: [{ type: 'text', text: `Successfully wrote to ${parsed.path}` }],
    };
  }

  private async handleListDirectory(args: unknown) {
    const parsed = z
      .object({
        path: z.string(),
      })
      .parse(args);

    const validPath = await validatePath(parsed.path);
    // Use Node.js fs to list directory since we have the base functionality imported
    const fs = await import('fs/promises');
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    const formatted = entries
      .map(entry => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`)
      .join('\n');

    return {
      content: [{ type: 'text', text: formatted }],
    };
  }

  private async handleSearchFiles(_args: unknown) {
    // TODO: Implement file search functionality
    return {
      content: [{ type: 'text', text: 'search_files: Implementation pending' }],
    };
  }

  private async handleGetFileInfo(args: unknown) {
    const parsed = z
      .object({
        path: z.string(),
      })
      .parse(args);

    const validPath = await validatePath(parsed.path);
    const stats = await getFileStats(validPath);

    const info =
      `File Information for ${parsed.path}:
` +
      `Size: ${formatSize(stats.size)}
` +
      `Type: ${stats.isDirectory ? 'Directory' : 'File'}
` +
      `Created: ${stats.created}
` +
      `Modified: ${stats.modified}
` +
      `Permissions: ${stats.permissions}`;

    return {
      content: [{ type: 'text', text: info }],
    };
  }

  private async handleListAllowedDirectories(_args: unknown) {
    const directories = getAllowedDirectories();
    const list = directories.map((dir: string) => `- ${dir}`).join('\n');

    return {
      content: [{ type: 'text', text: `Allowed directories:\n${list}` }],
    };
  }

  // ENHANCED OBSIDIAN-AWARE TOOL HANDLERS
  private async handleGetPrompted(args: unknown) {
    try {
      const parsed = z
        .object({
          promptName: z.string(),
          variables: z.record(z.any()).optional().default({}),
          options: z
            .object({
              includeWikilinks: z.boolean().optional().default(false),
              processTemplater: z.boolean().optional().default(true),
              searchPaths: z.array(z.string()).optional(),
              strictVariables: z.boolean().optional().default(false),
            })
            .optional()
            .default({}),
        })
        .parse(args);

      // Call the PromptManager's getPrompted function
      const result = await this.promptManager.getPrompted(
        parsed.promptName,
        parsed.variables,
        parsed.options
      );

      // Format response - simple and focused
      if (result.resolved) {
        // Just return the processed prompt content
        return {
          content: [
            {
              type: 'text' as const,
              text: result.content,
            },
          ],
        };
      } else {
        // Error case
        const errorMessage = result.error
          ? `Error (${result.error.code}): ${result.error.message}`
          : `Failed to process prompt '${parsed.promptName}'`;

        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ ${errorMessage}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error('handleGetPrompted error:', error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Invalid request: ${error.message}`,
          },
        ],
      };
    }
  }

  private async handleCreatePrompt(args: unknown) {
    try {
      const parsed = z
        .object({
          purpose: z.string(),
          targetFilename: z.string().optional(),
        })
        .parse(args);

      // Use the built-in prompt constructor functionality
      const constructorContent = this.getBuiltInPromptConstructor(
        parsed.purpose
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: constructorContent,
          },
        ],
      };
    } catch (error) {
      console.error('handleCreatePrompt error:', error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Invalid request: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }

  /**
   * Get the built-in prompt constructor content
   */
  private getBuiltInPromptConstructor(purpose: string): string {
    return `# Prompt Constructor

You are tasked with helping the user create a new prompt file that works perfectly with the \`getPrompted\` functionality.

## Your Mission

Conduct a brief discovery conversation with the user to understand their needs, then create a well-structured prompt file that:

1. **Directs the LLM clearly** using natural language, and role assignment
2. **Uses variables effectively** for reusability and abstraction  
3. **Contains actionable instructions** for filesystem operations
4. **Stands alone** when possible, or gracefully requests missing variables

## Discovery Process

Ask the user targeted questions to understand:

- **Purpose**: What specific task or workflow should this prompt help with?
- **Context**: Who will use it and when?
- **Variables**: What information will vary each time? What should be required vs optional?
- **Actions**: What filesystem operations should typically result from using this prompt?
- **Structure**: What format or style do they prefer for the output?

The user has indicated their purpose is: **${purpose}**

Use this as a starting point but still ask clarifying questions.

## Your Task

After gathering sufficient information through your discovery conversation:

1. **Generate an appropriate filename** (kebab-case, descriptive)
2. **Create the prompt file** using \`write_file\` in the vault's configured prompts directory (\`${
      this.config.promptsPath
    }\`)
3. **Structure it properly** with:
   - YAML frontmatter containing title, description, and prompt-vars
   - Clear content that works with variable substitution ({{variable}} syntax)
   - Specific instructions for the LLM on what filesystem actions to take
   - Template syntax (tp.date.now(), etc.) where appropriate

## Quality Standards

The prompt you create should be optimized so that when someone calls:
\`\`\`
get_prompted("your-prompt-name", {variables})
\`\`\`

The LLM immediately understands what to do and can execute the intended workflow using the available filesystem tools.

---

**Begin the discovery conversation now. Ask your first question to understand what kind of prompt the user needs.**`;
  }

  private async handleCreateTask(_args: unknown) {
    // Implementation will go here
    return {
      content: [
        {
          type: 'text',
          text: 'create_task: Implementation pending',
        },
      ],
    };
  }

  private async handleUpdateTaskProgress(_args: unknown) {
    // Implementation will go here
    return {
      content: [
        {
          type: 'text',
          text: 'update_task_progress: Implementation pending',
        },
      ],
    };
  }

  private async handleGetTaskStatus(_args: unknown) {
    // Implementation will go here
    return {
      content: [
        {
          type: 'text',
          text: 'get_task_status: Implementation pending',
        },
      ],
    };
  }

  private async handleLinkTaskToPrompt(_args: unknown) {
    // Implementation will go here
    return {
      content: [
        {
          type: 'text',
          text: 'link_task_to_prompt: Implementation pending',
        },
      ],
    };
  }

  // ENHANCED README AND LISTING TOOL HANDLERS
  private async handleCheckReadmeFreshness(args: unknown) {
    try {
      const parsed = z
        .object({
          directoryPath: z.string(),
          includeSnapshot: z.boolean().optional().default(true),
        })
        .parse(args);

      // Find existing README
      const currentReadme = await this.enhancedListing.findReadmeInDirectory(
        parsed.directoryPath
      );

      // Extract README generation date if it exists
      let readmeAge: Date | undefined;
      if (currentReadme && currentReadme.content) {
        const generatedMatch = currentReadme.content.match(
          /\*Generated on (\d{4}-\d{2}-\d{2})/i
        );
        if (generatedMatch) {
          readmeAge = new Date(generatedMatch[1]);
        } else if (currentReadme.modified) {
          readmeAge = currentReadme.modified;
        }
      }

      // Detect changes
      const changeResult = await this.changeDetection.detectChanges(
        parsed.directoryPath,
        readmeAge
      );

      let responseText = `# README Freshness Check: ${
        parsed.directoryPath
      }\n\n`;

      if (currentReadme) {
        responseText += `📄 **Found README:** ${currentReadme.path}\n`;
        if (readmeAge) {
          const ageDays = Math.round(
            (Date.now() - readmeAge.getTime()) / (1000 * 60 * 60 * 24)
          );
          responseText += `📅 **Age:** ${ageDays} days old\n\n`;
        }
      } else {
        responseText += `❌ **No README found** in directory\n\n`;
        responseText += `💡 **Suggestion:** Consider creating a README with \`generate_readme_for_orientation\` to document this directory.\n\n`;
        return {
          content: [
            {
              type: 'text' as const,
              text: responseText,
            },
          ],
        };
      }

      // Add change detection results
      if (changeResult.hasSignificantChanges) {
        const summary =
          this.changeDetection.generateChangesSummary(changeResult);
        const prompt = this.changeDetection.getRefreshPrompt(
          changeResult,
          parsed.directoryPath
        );

        responseText += summary;

        if (prompt) {
          responseText += '\n\n**💬 ' + prompt + '**';
          responseText +=
            '\n\n*Use `generate_readme_for_orientation` to refresh the README with current information.*';
        }
      } else {
        responseText +=
          '📋 **Status:** README appears to be up to date - no significant changes detected.';
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: responseText,
          },
        ],
      };
    } catch (error) {
      console.error('handleCheckReadmeFreshness error:', error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Error checking README freshness: ${error.message}`,
          },
        ],
      };
    }
  }

  private async handleListFilesWithContext(args: unknown) {
    try {
      const parsed = z
        .object({
          path: z.string(),
          maxDepth: z.number().optional().default(3),
          includeHidden: z.boolean().optional().default(false),
          summarize: z.boolean().optional().default(true),
          maxReadmeLength: z.number().optional().default(500),
        })
        .parse(args);

      const result = await this.enhancedListing.listFilesWithContext(
        parsed.path,
        {
          maxDepth: parsed.maxDepth,
          includeHidden: parsed.includeHidden,
          summarize: parsed.summarize,
          maxReadmeLength: parsed.maxReadmeLength,
        }
      );

      return {
        content: result.content,
      };
    } catch (error) {
      console.error('handleListFilesWithContext error:', error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Error listing files with context: ${error.message}`,
          },
        ],
      };
    }
  }

  private async handleGenerateReadmeForOrientation(args: unknown) {
    try {
      const parsed = z
        .object({
          targetDirectory: z.string(),
          userContext: z.string(),
          readmeFilename: z.string().optional().default('README.md'),
          preserveExisting: z.boolean().optional().default(true),
          analysisDepth: z.number().min(1).max(3).optional().default(1),
          maxContentLength: z.number().optional().default(2000),
        })
        .parse(args);

      const result = await this.readmeGeneration.generateReadmeForOrientation(
        parsed.targetDirectory,
        parsed.userContext,
        {
          readmeFilename: parsed.readmeFilename,
          preserveExisting: parsed.preserveExisting,
          analysisDepth: parsed.analysisDepth,
          maxContentLength: parsed.maxContentLength,
        }
      );

      return {
        content: result.content,
      };
    } catch (error) {
      console.error('handleGenerateReadmeForOrientation error:', error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Error generating README: ${error.message}`,
          },
        ],
      };
    }
  }
}
