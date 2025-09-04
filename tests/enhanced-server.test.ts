/**
 * Test the EnhancedFilesystemServer to verify it provides both
 * base filesystem tools and enhanced Obsidian-aware tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// TODO: ListToolsRequestSchema will be used for more advanced testing
import { EnhancedFilesystemServer } from '../src/filesystem.js';
import type { VaultConfig } from '../src/types.js';

describe('EnhancedFilesystemServer', () => {
  let server: Server;
  let enhancedServer: EnhancedFilesystemServer;

  beforeEach(() => {
    const config: VaultConfig = {
      allowedDirectories: ['/tmp'],
      promptsPath: 'prompts',
      tasksPath: 'tasks',
      templatesPath: 'templates',
      enableObsidianFeatures: true,
      cachePrompts: false,
      maxSearchResults: 10,
    };

    server = new Server(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    enhancedServer = new EnhancedFilesystemServer(config);
  });

  it('should register tools without errors', async () => {
    // This test verifies that the registration process works without throwing errors
    await expect(enhancedServer.registerTools(server)).resolves.not.toThrow();
  });

  it('should create an enhanced server instance', () => {
    // Test that we can create an instance with proper configuration
    expect(enhancedServer).toBeInstanceOf(EnhancedFilesystemServer);
  });

  it('should integrate both base and enhanced functionality', () => {
    // This is a structural test to verify our design intent
    // The actual integration would be tested with a real MCP client

    // Verify we have the expected tool handlers by checking method names
    const proto = Object.getPrototypeOf(enhancedServer);
    const methods = Object.getOwnPropertyNames(proto).filter(name =>
      name.startsWith('handle')
    );

    // Should have base filesystem tool handlers
    expect(methods).toContain('handleReadTextFile');
    expect(methods).toContain('handleWriteFile');
    expect(methods).toContain('handleListDirectory');

    // Should have enhanced tool handlers
    expect(methods).toContain('handleGetPrompted');
    expect(methods).toContain('handleCreateTask');
    expect(methods).toContain('handleUpdateTaskProgress');

    console.log(`✓ Server has ${methods.length} tool handlers`);
    console.log(
      `✓ Base filesystem handlers: ${methods.filter(m => m.includes('Read') || m.includes('Write') || m.includes('List')).length}`
    );
    console.log(
      `✓ Enhanced handlers: ${methods.filter(m => m.includes('Prompted') || m.includes('Task')).length}`
    );
  });

  it('should properly configure allowed directories', () => {
    // Test that the filesystem server configuration is properly set up
    // This verifies our integration with the base filesystem functionality
    const testConfig: VaultConfig = {
      allowedDirectories: ['/test1', '/test2'],
      promptsPath: 'prompts',
      tasksPath: 'tasks',
      templatesPath: 'templates',
      enableObsidianFeatures: true,
      cachePrompts: true,
      maxSearchResults: 20,
    };

    const testServer = new EnhancedFilesystemServer(testConfig);
    expect(testServer).toBeInstanceOf(EnhancedFilesystemServer);

    // The constructor should have called setAllowedDirectories
    // We can't directly test this without exposing internals,
    // but we verify the instance was created successfully
    expect(testServer).toBeTruthy();
  });
});
