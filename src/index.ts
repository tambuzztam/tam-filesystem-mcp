#!/usr/bin/env node

/**
 * tam-filesystem-mcp: Enhanced MCP filesystem server
 *
 * Main server with enhanced registration that extends the canonical filesystem server
 * with Obsidian-aware task and prompt management for philosophical counseling workflows.
 *
 * Based on @modelcontextprotocol/server-filesystem
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// These are imported for future use when implementing tool handlers

const _futureUse = { CallToolRequestSchema, ListToolsRequestSchema };

import { EnhancedFilesystemServer } from './filesystem.js';
import { loadVaultConfig } from './config.js';

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(
    'Usage: tam-filesystem-mcp [allowed-directory] [additional-directories...]'
  );
  console.error(
    'Note: This enhanced server extends the canonical filesystem server'
  );
  console.error('with Obsidian-aware task and prompt management capabilities.');
  process.exit(1);
}

// Load vault configuration from .tam-filesystem-mcp.json file
const vaultConfig = loadVaultConfig(args);

// Initialize enhanced server
const enhancedServer = new EnhancedFilesystemServer(vaultConfig);

// Create MCP server instance
const server = new Server(
  {
    name: 'tam-filesystem-mcp',
    version: '1.0.0',
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

  console.error('tam-filesystem-mcp: Enhanced filesystem server started');
  console.error(
    `Allowed directories: ${vaultConfig.allowedDirectories.join(', ')}`
  );
  console.error(
    `Obsidian features: ${vaultConfig.enableObsidianFeatures ? 'enabled' : 'disabled'}`
  );
  console.error(
    `Templater-lite: ${vaultConfig.templaterLite ? 'enabled' : 'disabled'}`
  );
}

main().catch(error => {
  console.error('Server error:', error);
  process.exit(1);
});
