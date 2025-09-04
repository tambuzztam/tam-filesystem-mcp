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
  // New configuration options
  templaterLite?: boolean;
  wikilinkResolution?: boolean;
  fuzzyThreshold?: number;
  strictVariables?: boolean;
  defaultDateFormat?: string;
}

// Vault configuration file structure
export interface VaultConfigFile {
  vault: {
    name: string;
    description?: string;
  };
  paths: {
    prompts: string;
    tasks: string;
    templates: string;
  };
  features: {
    obsidianFeatures: boolean;
    cachePrompts: boolean;
    templaterLite: boolean;
    wikilinkResolution: boolean;
  };
  search: {
    maxResults: number;
    fuzzyThreshold: number;
  };
  variables: {
    strictValidation: boolean;
    defaultDateFormat: string;
  };
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

// Prompt system types - Enhanced for Phase 1
export interface PromptOptions {
  includeWikilinks?: boolean;
  processTemplater?: boolean;
  searchPaths?: string[];
  strictVariables?: boolean;
  searchMode?: 'auto' | 'exact' | 'alias' | 'fuzzy' | 'content' | 'path';
  promptsDir?: string;
  resolveWikilinks?: boolean | { mode: 'markdown' | 'path'; embed?: boolean };
  templater?: boolean;
  returnCandidates?: boolean;
  maxCandidates?: number;
  fuzzyThreshold?: number;
}

export interface PromptDiscoveryResult {
  path: string;
  match: 'exact' | 'alias' | 'fuzzy' | 'content';
  score?: number;
}

// Enhanced getPrompted types
export interface GetPromptedRequest {
  promptName: string;
  variables?: Record<string, any>;
  options?: PromptOptions;
}

export interface PromptHit {
  id: string;
  name: string;
  path: string;
  score: number;
  reason: 'exact' | 'alias' | 'fuzzy' | 'content';
  title?: string;
  aliases?: string[];
  tags?: string[];
}

export interface VariableSpec {
  name: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  default?: any;
  options?: any[];
}

export interface ActionRecommendation {
  type:
    | 'create_file'
    | 'update_file'
    | 'create_task'
    | 'update_task'
    | 'link_resources';
  description: string;
  parameters: {
    path?: string;
    content?: string;
    taskName?: string;
    updates?: Record<string, any>;
    [key: string]: any;
  };
  confidence: number;
  autoExecutable: boolean;
  reasoning: string;
}

export interface ExecutionResult {
  actionType: string;
  success: boolean;
  message: string;
  details?: any;
}

export interface GetPromptedResult {
  resolved: boolean;
  autoApplyRecommended: boolean;
  confidence: number;
  chosen?: {
    id: string;
    name: string;
    path: string;
    title: string;
    aliases: string[];
    tags: string[];
    frontmatterExcerpt?: string;
  };
  content: string;
  variablesUsed: Record<string, any>;
  missingVariables: VariableSpec[];
  candidates: PromptHit[];
  unresolvedLinks: string[];
  processing: {
    templaterProcessed: boolean;
    wikilinkResolution: boolean;
    variableInterpolation: boolean;
  };
  // Enhanced action detection
  actionRecommendations: ActionRecommendation[];
  autoExecuted: boolean;
  executionResults: ExecutionResult[];
  error?: {
    code: string;
    message: string;
    details?: any;
  };
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
