#!/usr/bin/env node

/**
 * tam-filesystem-mcp: Enhanced MCP filesystem server
 * 
 * Main server with enhanced registration that extends the canonical filesystem server
 * with Obsidian-aware task and prompt management for philosophical counseling workflows.
 * 
 * Based on @modelcontextprotocol/server-filesystem
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { EnhancedFilesystemServer } from './filesystem.js';
import { VaultConfig } from './types.js';

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: tam-filesystem-mcp [allowed-directory] [additional-directories...]");
  console.error("Note: This enhanced server extends the canonical filesystem server");
  console.error("with Obsidian-aware task and prompt management capabilities.");
  process.exit(1);
}

// Default vault configuration
const defaultConfig: VaultConfig = {
  allowedDirectories: args,
  promptsPath: 'tasks/prompts',
  tasksPath: 'tasks',
  templatesPath: 'utilities/templates',
  enableObsidianFeatures: true,
  cachePrompts: true,
  maxSearchResults: 10
};

// Initialize enhanced server
const enhancedServer = new EnhancedFilesystemServer(defaultConfig);

// Create MCP server instance
const server = new Server(
  {
    name: "tam-filesystem-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register enhanced tools
await enhancedServer.registerTools(server);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("tam-filesystem-mcp: Enhanced filesystem server started");
  console.error(`Allowed directories: ${defaultConfig.allowedDirectories.join(', ')}`);
  console.error("Obsidian features: enabled");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
