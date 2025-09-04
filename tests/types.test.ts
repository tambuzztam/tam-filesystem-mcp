/**
 * Test that we can import our types and modules correctly
 */

import type { VaultConfig, ObsidianFile } from '../src/types.js';
import { ObsidianUtils } from '../src/obsidian.js';

describe('Module Imports', () => {
  it('should work with TypeScript interfaces', () => {
    // We can use types in TypeScript but they don't exist at runtime
    expect(true).toBe(true); // Just verify test runs
  });

  it('should import and instantiate classes correctly', () => {
    const config: VaultConfig = {
      allowedDirectories: ['/test'],
      promptsPath: 'prompts',
      tasksPath: 'tasks',
      templatesPath: 'templates',
      enableObsidianFeatures: true,
      cachePrompts: false,
      maxSearchResults: 10,
    };

    const obsidianUtils = new ObsidianUtils(config);
    expect(obsidianUtils).toBeInstanceOf(ObsidianUtils);
  });

  it('should handle frontmatter parsing', () => {
    const config: VaultConfig = {
      allowedDirectories: ['/test'],
      promptsPath: 'prompts',
      tasksPath: 'tasks',
      templatesPath: 'templates',
      enableObsidianFeatures: true,
      cachePrompts: false,
      maxSearchResults: 10,
    };

    const obsidianUtils = new ObsidianUtils(config);

    const testMarkdown = `---
title: "Test Document"
aliases: ["test", "example"]
tags: ["testing", "jest"]
---

# Test Document

This is a test document with frontmatter.`;

    const result = obsidianUtils.parseObsidianFile(testMarkdown);

    expect(result.frontmatter.title).toBe('Test Document');
    expect(result.aliases).toEqual(['test', 'example']);
    expect(result.tags).toEqual(['testing', 'jest']);
    expect(result.content.trim()).toBe(
      '# Test Document\n\nThis is a test document with frontmatter.'
    );
  });
});
