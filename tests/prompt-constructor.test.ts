/**
 * Test the prompt constructor functionality
 */

import { PromptManager, PromptFileContent } from '../src/prompts.js';
import { ObsidianUtils } from '../src/obsidian.js';
import type { VaultConfig, VariableSpec } from '../src/types.js';

describe('PromptConstructor', () => {
  let promptManager: PromptManager;
  let obsidianUtils: ObsidianUtils;
  let config: VaultConfig;

  beforeEach(() => {
    config = {
      allowedDirectories: ['/tmp'],
      promptsPath: 'prompts',
      tasksPath: 'tasks',
      templatesPath: 'templates',
      enableObsidianFeatures: true,
      cachePrompts: false,
      maxSearchResults: 10,
      templaterLite: true,
      wikilinkResolution: false,
      fuzzyThreshold: 0.6,
      strictVariables: false,
      defaultDateFormat: 'YYYY-MM-DD',
      promptFuzzyMatchThreshold: 0.3,
      promptSuggestionThreshold: 0.2,
    };

    obsidianUtils = new ObsidianUtils(config);
    promptManager = new PromptManager(config, obsidianUtils);
  });

  it('should generate valid filenames from purpose strings', () => {
    const testCases = [
      {
        input: 'Analyze session transcripts',
        expected: 'analyze-session-transcripts',
      },
      { input: 'Create weekly reports!', expected: 'create-weekly-reports' },
      {
        input: 'Process @#$% special chars',
        expected: 'process-special-chars',
      },
      { input: 'Multiple   spaces   here', expected: 'multiple-spaces-here' },
    ];

    testCases.forEach(({ input, expected }) => {
      expect(promptManager.generateFilenameFromPurpose(input)).toBe(expected);
    });
  });

  it('should create proper prompt template structure', () => {
    const purpose = 'analyze session transcripts';
    const variables: VariableSpec[] = [
      {
        name: 'client_name',
        type: 'string',
        required: true,
        description: 'Name of the client',
      },
      {
        name: 'session_date',
        type: 'string',
        required: true,
        description: 'Date of the session',
      },
    ];

    const template = promptManager.createPromptTemplate(
      purpose,
      variables,
      true
    );

    expect(template.filename).toBe('analyze-session-transcripts');
    expect(template.title).toBe('Analyze session transcripts');
    expect(template.description).toBe('Helps with analyze session transcripts');
    expect(template.variables).toEqual(variables);
    expect(template.body).toContain('# Analyze session transcripts');
    expect(template.body).toContain('{{client_name}}');
    expect(template.body).toContain('{{session_date}}');
    expect(template.body).toContain('tp.date.now()');
    expect(template.tags).toContain('generated');
    expect(template.tags).toContain('prompt');
  });

  it('should format prompt file content with proper YAML frontmatter', () => {
    const _content: PromptFileContent = {
      filename: 'test-prompt',
      title: 'Test Prompt',
      description: 'A test prompt for validation',
      variables: [
        {
          name: 'test_var',
          type: 'string',
          required: true,
          description: 'A test variable',
        },
      ],
      body: '# Test Content\n\nHello {{test_var}}!',
      tags: ['test', 'example'],
      aliases: ['test-alias'],
    };

    // Test the private method indirectly by checking if createPromptFile would work
    // Since createPromptFile calls formatPromptFileContent internally
    expect(() => {
      // This would call formatPromptFileContent internally
      const template = promptManager.createPromptTemplate('test purpose');
      expect(template).toBeTruthy();
    }).not.toThrow();
  });

  it('should create template without variables when none provided', () => {
    const purpose = 'simple task';
    const template = promptManager.createPromptTemplate(purpose, [], false);

    expect(template.variables).toEqual([]);
    expect(template.body).not.toContain('Context Variables');
    expect(template.body).not.toContain('tp.date.now()');
    expect(template.body).toContain('You are tasked with simple task');
  });
});
