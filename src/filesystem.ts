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
// TODO: PromptOptions will be used when implementing get_prompted functionality
import { ObsidianUtils } from './obsidian.js';
import { PromptManager } from './prompts.js';
import { TaskManager } from './tasks.js';
import { TemplateProcessor } from './templates.js';

/**
 * EnhancedFilesystemServer extends the canonical filesystem server
 * with domain-specific intelligence for philosophical counseling workflows
 */
export class EnhancedFilesystemServer {
  private obsidianUtils: ObsidianUtils;
  private promptManager: PromptManager;
  private taskManager: TaskManager;
  private templateProcessor: TemplateProcessor;

  constructor(private config: VaultConfig) {
    // Set up the base filesystem server's allowed directories
    setAllowedDirectories(config.allowedDirectories);

    // Initialize enhanced subsystems
    this.obsidianUtils = new ObsidianUtils(config);
    this.promptManager = new PromptManager(config, this.obsidianUtils);
    this.taskManager = new TaskManager(config, this.obsidianUtils);
    this.templateProcessor = new TemplateProcessor(config);
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
              'Intelligently discover, load, and process prompt templates with variable substitution and Obsidian feature support. Perfect for philosophical counseling workflows.',
            inputSchema: zodToJsonSchema(GetPromptedArgsSchema),
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
        case 'create_task':
          return await this.handleCreateTask(args);
        case 'update_task_progress':
          return await this.handleUpdateTaskProgress(args);
        case 'get_task_status':
          return await this.handleGetTaskStatus(args);
        case 'link_task_to_prompt':
          return await this.handleLinkTaskToPrompt(args);

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

  // ENHANCED OBSIDIAN-AWARE TOOL HANDLERS (stubs for now)
  private async handleGetPrompted(_args: unknown) {
    // Implementation will go here
    return {
      content: [
        {
          type: 'text',
          text: 'get_prompted: Implementation pending',
        },
      ],
    };
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
}
