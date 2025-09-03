/**
 * Type definitions for tam-filesystem-mcp
 */

// Configuration types
export interface VaultConfig {
  allowedDirectories: string[];
  promptsPath: string;
  tasksPath: string;
  templatesPath: string;
  enableObsidianFeatures: boolean;
  cachePrompts: boolean;
  maxSearchResults: number;
}

// Obsidian-specific types
export interface ObsidianFile {
  frontmatter: Record<string, any>;
  content: string;
  aliases: string[];
  tags: string[];
}

export interface VariableDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array';
  required?: boolean;
  default?: any;
  options?: any[];
  description?: string;
}

// Prompt system types
export interface PromptOptions {
  includeWikilinks?: boolean;
  processTemplater?: boolean;
  searchPaths?: string[];
  strictVariables?: boolean;
}

export interface PromptDiscoveryResult {
  path: string;
  match: 'exact' | 'alias' | 'fuzzy' | 'content';
  score?: number;
}

// Task management types
export interface TaskMetadata {
  client?: string;
  sessionType?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  dueDate?: Date;
  dependencies?: string[];
  [key: string]: any;
}

export interface TaskProgress {
  completionPercentage: number;
  totalItems: number;
  completedItems: number;
  nextActions: string[];
  blockers: string[];
  lastUpdated: Date;
}

export interface ChecklistItem {
  text: string;
  completed: boolean;
  subItems?: ChecklistItem[];
}

export interface Task {
  name: string;
  description: string;
  checklist: ChecklistItem[];
  metadata: TaskMetadata;
  progress: TaskProgress;
  path: string;
}

// Template system types
export interface TemplateVariable {
  name: string;
  value: any;
  source: 'user' | 'computed' | 'default';
}

export interface TemplateContext {
  variables: Record<string, TemplateVariable>;
  currentDate: Date;
  vaultPath: string;
  taskName?: string;
  promptName?: string;
}

// Error types
export class EnhancedMcpError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'EnhancedMcpError';
  }
}
