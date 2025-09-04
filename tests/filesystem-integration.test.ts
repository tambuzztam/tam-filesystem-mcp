/**
 * Integration test to verify base filesystem functionality works
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EnhancedFilesystemServer } from '../src/filesystem.js';
import type { VaultConfig } from '../src/types.js';

describe('Filesystem Integration', () => {
  let enhancedServer: EnhancedFilesystemServer;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = await fs.mkdtemp(join(tmpdir(), 'mcp-test-'));

    // Resolve the real path to avoid symlink issues with filesystem server validation
    testDir = await fs.realpath(testDir);

    const config: VaultConfig = {
      allowedDirectories: [testDir],
      promptsPath: 'prompts',
      tasksPath: 'tasks',
      templatesPath: 'templates',
      enableObsidianFeatures: true,
      cachePrompts: false,
      maxSearchResults: 10,
    };

    enhancedServer = new EnhancedFilesystemServer(config);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup test directory:', error);
    }
  });

  it('should read and write files using base filesystem functionality', async () => {
    const testFile = join(testDir, 'test.txt');
    const testContent = 'Hello, Enhanced Filesystem Server!';

    // Test write functionality
    const writeResult = await enhancedServer['handleWriteFile']({
      path: testFile,
      content: testContent,
    });

    expect(writeResult.content).toBeDefined();
    expect(writeResult.content[0].text).toContain('Successfully wrote');

    // Verify file was actually created
    const fileExists = await fs
      .access(testFile)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);

    // Test read functionality
    const readResult = await enhancedServer['handleReadTextFile']({
      path: testFile,
    });

    expect(readResult.content).toBeDefined();
    expect(readResult.content[0].text).toBe(testContent);
  });

  it('should list directory contents using base functionality', async () => {
    // Create some test files
    await fs.writeFile(join(testDir, 'file1.txt'), 'content1');
    await fs.writeFile(join(testDir, 'file2.md'), 'content2');
    await fs.mkdir(join(testDir, 'subdir'));

    // Test directory listing
    const listResult = await enhancedServer['handleListDirectory']({
      path: testDir,
    });

    expect(listResult.content).toBeDefined();
    const listing = listResult.content[0].text;

    expect(listing).toContain('[FILE] file1.txt');
    expect(listing).toContain('[FILE] file2.md');
    expect(listing).toContain('[DIR] subdir');
  });

  it('should get file information using base functionality', async () => {
    const testFile = join(testDir, 'info-test.txt');
    await fs.writeFile(testFile, 'test content for file info');

    const infoResult = await enhancedServer['handleGetFileInfo']({
      path: testFile,
    });

    expect(infoResult.content).toBeDefined();
    const info = infoResult.content[0].text;

    expect(info).toContain('File Information');
    expect(info).toContain('Size:');
    expect(info).toContain('Type: File');
    expect(info).toContain('Created:');
    expect(info).toContain('Modified:');
  });

  it('should list allowed directories', async () => {
    const dirResult = await enhancedServer['handleListAllowedDirectories']({});

    expect(dirResult.content).toBeDefined();
    const directories = dirResult.content[0].text;

    expect(directories).toContain('Allowed directories:');
    expect(directories).toContain(testDir);
  });
});
