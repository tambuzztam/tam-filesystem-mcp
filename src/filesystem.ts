/**
 * Enhanced Filesystem Server
 * 
 * Extends the canonical MCP filesystem server with Obsidian-aware
 * task and prompt management capabilities.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { VaultConfig } from './types.js';
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
    // Initialize subsystems
    this.obsidianUtils = new ObsidianUtils(config);
    this.promptManager = new PromptManager(config, this.obsidianUtils);
    this.taskManager = new TaskManager(config, this.obsidianUtils);
    this.templateProcessor = new TemplateProcessor(config);
  }

  /**
   * Register all enhanced tools with the MCP server
   */
  async registerTools(server: Server): Promise<void> {
    // Register tool listing handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Original filesystem tools would be inherited here
          
          // Enhanced prompt management tools
          {
            name: "get_prompted",
            description: "Intelligently discover, load, and process prompt templates with variable substitution and Obsidian feature support",
            inputSchema: {
              type: "object",
              properties: {
                promptName: {
                  type: "string",
                  description: "Name or partial name of the prompt to load"
                },
                variables: {
                  type: "object",
                  description: "Variables to substitute in the prompt template",
                  additionalProperties: true
                },
                options: {
                  type: "object",
                  properties: {
                    includeWikilinks: { type: "boolean", default: false },
                    processTemplater: { type: "boolean", default: true },
                    searchPaths: { type: "array", items: { type: "string" } },
                    strictVariables: { type: "boolean", default: false }
                  }
                }
              },
              required: ["promptName"]
            }
          },
          
          // Enhanced task management tools
          {
            name: "create_task",
            description: "Create a new task using Task.md template with auto-populated metadata",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string", description: "Task name" },
                description: { type: "string", description: "Task description" },
                checklist: { type: "array", items: { type: "string" }, description: "Checklist items" },
                metadata: { type: "object", description: "Task metadata", additionalProperties: true }
              },
              required: ["name", "description", "checklist"]
            }
          },
          
          {
            name: "update_task_progress",
            description: "Update task progress by modifying checklist item completion status",
            inputSchema: {
              type: "object",
              properties: {
                taskName: { type: "string", description: "Name of the task to update" },
                updates: { 
                  type: "object", 
                  description: "Checklist updates as item_number: boolean pairs",
                  additionalProperties: { type: "boolean" }
                }
              },
              required: ["taskName", "updates"]
            }
          },
          
          {
            name: "get_task_status",
            description: "Get comprehensive task status including completion metrics and next actions",
            inputSchema: {
              type: "object",
              properties: {
                taskName: { type: "string", description: "Name of the task to analyze" }
              },
              required: ["taskName"]
            }
          },
          
          {
            name: "link_task_to_prompt",
            description: "Create bidirectional links between tasks and prompts with relationship tracking",
            inputSchema: {
              type: "object",
              properties: {
                taskName: { type: "string", description: "Name of the task" },
                promptName: { type: "string", description: "Name of the prompt" },
                relationship: { type: "string", description: "Nature of the relationship", default: "uses" }
              },
              required: ["taskName", "promptName"]
            }
          }
        ]
      };
    });

    // Register tool call handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "get_prompted":
          return await this.handleGetPrompted(args);
        case "create_task":
          return await this.handleCreateTask(args);
        case "update_task_progress":
          return await this.handleUpdateTaskProgress(args);
        case "get_task_status":
          return await this.handleGetTaskStatus(args);
        case "link_task_to_prompt":
          return await this.handleLinkTaskToPrompt(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  // Tool handlers - stubs for now
  private async handleGetPrompted(args: any) {
    // Implementation will go here
    return {
      content: [{
        type: "text",
        text: "get_prompted: Implementation pending"
      }]
    };
  }

  private async handleCreateTask(args: any) {
    // Implementation will go here
    return {
      content: [{
        type: "text", 
        text: "create_task: Implementation pending"
      }]
    };
  }

  private async handleUpdateTaskProgress(args: any) {
    // Implementation will go here
    return {
      content: [{
        type: "text",
        text: "update_task_progress: Implementation pending"
      }]
    };
  }

  private async handleGetTaskStatus(args: any) {
    // Implementation will go here
    return {
      content: [{
        type: "text",
        text: "get_task_status: Implementation pending"
      }]
    };
  }

  private async handleLinkTaskToPrompt(args: any) {
    // Implementation will go here
    return {
      content: [{
        type: "text",
        text: "link_task_to_prompt: Implementation pending"
      }]
    };
  }
}
