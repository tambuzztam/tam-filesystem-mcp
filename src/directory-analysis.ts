/**
 * Directory Analysis Engine
 *
 * Analyzes directory structure, file patterns, naming conventions,
 * and content to generate intelligent README content optimized for LLM orientation.
 */

import { readdir } from 'fs/promises';
import { join, basename, extname, dirname } from 'path';
import { validateAndNormalizePath, getPathInfo } from './security.js';
import { FileInfo } from './enhanced-listing.js';

export interface DirectoryIntelligence {
  purpose: string; // From user context
  fileCategories: FileCategory[]; // Detected file groupings
  namingPatterns: string[]; // Observed conventions
  keyFiles: string[]; // Important files to highlight
  workflowHints: string[]; // Detected usage patterns
  subdirectoryRoles: SubdirRole[]; // Purpose of subdirectories
  integrationNotes: string[]; // How this connects to broader vault
}

export interface FileCategory {
  pattern: string; // e.g., "*.md", "session-*"
  description: string; // What these files represent
  count: number; // How many found
  examples: string[]; // 1-2 example filenames
}

export interface SubdirRole {
  name: string; // Subdirectory name
  inferredPurpose: string; // What it appears to contain
  fileCount: number; // Size indicator
  keyPatterns: string[]; // Important patterns found
}

export interface DirectorySuggestion {
  path: string;
  reason: string;
  similarity: number;
}

export interface DirectoryValidation {
  exists: boolean;
  allowed: boolean;
  suggestions: DirectorySuggestion[];
}

/**
 * Directory Analysis Service
 */
export class DirectoryAnalysisService {
  constructor(private allowedDirectories: string[]) {}

  /**
   * Analyze a directory to extract intelligence for README generation
   */
  async analyzeDirectoryIntelligence(
    path: string,
    userContext: string,
    analysisDepth: number = 1
  ): Promise<DirectoryIntelligence> {
    const validPath = validateAndNormalizePath(path, this.allowedDirectories);

    // Get directory contents
    const files = await this.getDirectoryContents(validPath);

    // Analyze file patterns and categories
    const fileCategories = this.detectFileCategories(files);

    // Identify naming conventions
    const namingPatterns = this.extractNamingPatterns(files);

    // Determine key files (largest, newest, mentioned in user context)
    const keyFiles = this.identifyKeyFiles(files, userContext);

    // Look into subdirectories for context (limited depth)
    const subdirectoryRoles = await this.analyzeSubdirectories(
      validPath,
      analysisDepth
    );

    // Extract workflow hints from file patterns and names
    const workflowHints = this.inferWorkflowPatterns(files, fileCategories);

    // Generate integration notes based on context
    const integrationNotes = this.generateIntegrationNotes(
      userContext,
      subdirectoryRoles
    );

    return {
      purpose: userContext,
      fileCategories,
      namingPatterns,
      keyFiles,
      workflowHints,
      subdirectoryRoles,
      integrationNotes,
    };
  }

  /**
   * Validate directory and suggest alternatives if not found
   */
  async validateAndSuggestDirectory(
    targetPath: string
  ): Promise<DirectoryValidation> {
    try {
      const validPath = validateAndNormalizePath(
        targetPath,
        this.allowedDirectories
      );
      const pathInfo = await getPathInfo(validPath);

      if (pathInfo.exists && pathInfo.isDirectory) {
        return { exists: true, allowed: true, suggestions: [] };
      }

      if (pathInfo.exists && !pathInfo.isDirectory) {
        return { exists: true, allowed: false, suggestions: [] };
      }
    } catch {
      // Path validation failed or path doesn't exist
    }

    // Generate suggestions for non-existent paths
    const suggestions = await this.generateDirectorySuggestions(targetPath);
    return { exists: false, allowed: false, suggestions };
  }

  /**
   * Get directory contents with metadata
   */
  private async getDirectoryContents(
    directoryPath: string
  ): Promise<FileInfo[]> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const fileInfos: FileInfo[] = [];

    for (const entry of entries) {
      const fullPath = join(directoryPath, entry.name);

      try {
        const pathInfo = await getPathInfo(fullPath);

        fileInfos.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: pathInfo.size,
          modified: pathInfo.modified,
          path: fullPath,
        });
      } catch {
        // Include basic info even if we can't get full metadata
        fileInfos.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: fullPath,
        });
      }
    }

    return fileInfos;
  }

  /**
   * Detect file categories and patterns
   */
  private detectFileCategories(files: FileInfo[]): FileCategory[] {
    const categories: Map<string, FileCategory> = new Map();

    files.forEach(file => {
      if (file.type === 'file') {
        // Group by extension
        const ext = extname(file.name).toLowerCase();
        const categoryKey = ext || 'no-extension';

        const category = categories.get(categoryKey) || {
          pattern: ext ? `*${ext}` : 'files without extension',
          description: this.getFileTypeDescription(ext),
          count: 0,
          examples: [],
        };

        category.count++;
        if (category.examples.length < 2) {
          category.examples.push(file.name);
        }

        categories.set(categoryKey, category);
      }
    });

    // Also detect naming patterns
    const namePatterns = this.detectNamingPatterns(files);
    namePatterns.forEach(pattern => {
      if (!categories.has(pattern.pattern)) {
        categories.set(pattern.pattern, pattern);
      }
    });

    return Array.from(categories.values())
      .filter(cat => cat.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Detect naming patterns in files
   */
  private detectNamingPatterns(files: FileInfo[]): FileCategory[] {
    const patterns: FileCategory[] = [];
    const names = files.filter(f => f.type === 'file').map(f => f.name);

    // Detect date patterns
    const datePattern = /\d{4}-\d{2}-\d{2}/;
    const dateFiles = names.filter(name => datePattern.test(name));
    if (dateFiles.length > 1) {
      patterns.push({
        pattern: 'date-named files',
        description: 'Files with date-based naming (YYYY-MM-DD)',
        count: dateFiles.length,
        examples: dateFiles.slice(0, 2),
      });
    }

    // Detect numbered sequences
    const numberPattern = /\d+/;
    const numberedFiles = names.filter(name => numberPattern.test(name));
    if (numberedFiles.length > 2) {
      patterns.push({
        pattern: 'numbered files',
        description: 'Files with numbers in names (sequences or versions)',
        count: numberedFiles.length,
        examples: numberedFiles.slice(0, 2),
      });
    }

    // Detect common prefixes
    const prefixes = this.findCommonPrefixes(names);
    prefixes.forEach(prefix => {
      const prefixFiles = names.filter(name => name.startsWith(prefix.prefix));
      if (prefixFiles.length > 1) {
        patterns.push({
          pattern: `${prefix.prefix}*`,
          description: `Files with "${prefix.prefix}" prefix`,
          count: prefixFiles.length,
          examples: prefixFiles.slice(0, 2),
        });
      }
    });

    return patterns;
  }

  /**
   * Find common prefixes in file names
   */
  private findCommonPrefixes(
    names: string[]
  ): Array<{ prefix: string; count: number }> {
    const prefixCounts = new Map<string, number>();

    // Look for prefixes of 3+ characters
    for (const name of names) {
      for (let i = 3; i <= Math.min(name.length, 10); i++) {
        const prefix = name.substring(0, i);
        // Skip if prefix ends with a number or common separator
        if (/[0-9\-_.]$/.test(prefix)) continue;

        prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      }
    }

    // Return prefixes that appear in 2+ files
    return Array.from(prefixCounts.entries())
      .filter(([_, count]) => count >= 2)
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 prefixes
  }

  /**
   * Extract naming conventions from file patterns
   */
  private extractNamingPatterns(files: FileInfo[]): string[] {
    const patterns: string[] = [];
    const names = files.filter(f => f.type === 'file').map(f => f.name);

    // Detect kebab-case
    const kebabFiles = names.filter(name =>
      /^[a-z0-9]+(-[a-z0-9]+)*\.[a-z]+$/i.test(name)
    );
    if (kebabFiles.length > names.length * 0.3) {
      patterns.push('Kebab-case naming (words-separated-by-hyphens)');
    }

    // Detect camelCase
    const camelFiles = names.filter(name =>
      /^[a-z][a-zA-Z0-9]*\.[a-z]+$/.test(name)
    );
    if (camelFiles.length > names.length * 0.3) {
      patterns.push('CamelCase naming (wordsConnectedTogether)');
    }

    // Detect snake_case
    const snakeFiles = names.filter(name =>
      /^[a-z0-9]+(_[a-z0-9]+)*\.[a-z]+$/i.test(name)
    );
    if (snakeFiles.length > names.length * 0.3) {
      patterns.push('Snake_case naming (words_separated_by_underscores)');
    }

    // Detect date patterns
    if (names.some(name => /\d{4}-\d{2}-\d{2}/.test(name))) {
      patterns.push('Date-based naming (YYYY-MM-DD format)');
    }

    return patterns;
  }

  /**
   * Identify key files that should be highlighted
   */
  private identifyKeyFiles(files: FileInfo[], userContext: string): string[] {
    const keyFiles: string[] = [];

    // Files mentioned in user context
    files.forEach(file => {
      if (userContext.toLowerCase().includes(file.name.toLowerCase())) {
        keyFiles.push(file.name);
      }
    });

    // Largest files (likely important)
    const sortedBySize = files
      .filter(f => f.type === 'file' && f.size)
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 3);

    sortedBySize.forEach(file => {
      if (!keyFiles.includes(file.name)) {
        keyFiles.push(file.name);
      }
    });

    // Common important names
    const importantNames = [
      'index',
      'main',
      'config',
      'template',
      'example',
      'readme',
    ];
    files.forEach(file => {
      const baseName = basename(file.name, extname(file.name)).toLowerCase();
      if (importantNames.includes(baseName) && !keyFiles.includes(file.name)) {
        keyFiles.push(file.name);
      }
    });

    return keyFiles.slice(0, 5); // Limit to most important
  }

  /**
   * Analyze subdirectories to understand their roles
   */
  private async analyzeSubdirectories(
    directoryPath: string,
    analysisDepth: number
  ): Promise<SubdirRole[]> {
    if (analysisDepth <= 0) {
      return [];
    }

    const files = await this.getDirectoryContents(directoryPath);
    const subdirs = files.filter(f => f.type === 'directory');
    const roles: SubdirRole[] = [];

    for (const subdir of subdirs) {
      try {
        const subdirContents = await this.getDirectoryContents(subdir.path);
        const patterns = this.detectFileCategories(subdirContents).map(
          cat => cat.pattern
        );

        roles.push({
          name: subdir.name,
          inferredPurpose: this.inferDirectoryPurpose(
            subdir.name,
            subdirContents
          ),
          fileCount: subdirContents.filter(f => f.type === 'file').length,
          keyPatterns: patterns.slice(0, 3), // Top 3 patterns
        });
      } catch {
        // If we can't read the subdirectory, still include basic info
        roles.push({
          name: subdir.name,
          inferredPurpose: this.inferDirectoryPurposeFromName(subdir.name),
          fileCount: 0,
          keyPatterns: [],
        });
      }
    }

    return roles.slice(0, 10); // Limit to avoid overwhelming output
  }

  /**
   * Infer directory purpose from name and contents
   */
  private inferDirectoryPurpose(dirName: string, contents: FileInfo[]): string {
    const name = dirName.toLowerCase();
    const fileTypes = contents
      .filter(f => f.type === 'file')
      .map(f => extname(f.name).toLowerCase())
      .filter(ext => ext);

    // Common directory patterns
    if (name.includes('test') || name.includes('spec')) {
      return 'Testing and validation files';
    }
    if (name.includes('doc') || name.includes('readme')) {
      return 'Documentation and guides';
    }
    if (name.includes('config') || name.includes('setting')) {
      return 'Configuration files';
    }
    if (name.includes('template')) {
      return 'Template files for reuse';
    }
    if (name.includes('backup') || name.includes('archive')) {
      return 'Backup or archived files';
    }
    if (name.includes('temp') || name.includes('tmp')) {
      return 'Temporary files';
    }
    if (name.includes('src') || name.includes('source')) {
      return 'Source files and content';
    }
    if (
      name.includes('dist') ||
      name.includes('build') ||
      name.includes('output')
    ) {
      return 'Generated or output files';
    }

    // Infer from file types
    if (fileTypes.includes('.md') && fileTypes.length === 1) {
      return 'Markdown documents';
    }
    if (fileTypes.includes('.json') && fileTypes.length <= 2) {
      return 'JSON data and configuration';
    }
    if (fileTypes.includes('.txt') && fileTypes.length <= 2) {
      return 'Text files and notes';
    }

    // Generic based on content
    const fileCount = contents.filter(f => f.type === 'file').length;
    const dirCount = contents.filter(f => f.type === 'directory').length;

    if (fileCount > dirCount * 3) {
      return `Collection of ${fileCount} files`;
    }
    if (dirCount > fileCount) {
      return `Organized into ${dirCount} subdirectories`;
    }

    return `Mixed content (${fileCount} files, ${dirCount} subdirectories)`;
  }

  /**
   * Infer directory purpose from name only (fallback)
   */
  private inferDirectoryPurposeFromName(dirName: string): string {
    const name = dirName.toLowerCase();

    if (name.includes('test')) return 'Testing files';
    if (name.includes('doc')) return 'Documentation';
    if (name.includes('config')) return 'Configuration';
    if (name.includes('template')) return 'Templates';
    if (name.includes('backup')) return 'Backup files';
    if (name.includes('temp')) return 'Temporary files';
    if (name.includes('src')) return 'Source files';
    if (name.includes('dist')) return 'Distribution files';

    return 'Various files';
  }

  /**
   * Infer workflow patterns from file analysis
   */
  private inferWorkflowPatterns(
    files: FileInfo[],
    categories: FileCategory[]
  ): string[] {
    const patterns: string[] = [];

    // Template-based workflow
    if (categories.some(cat => cat.pattern.includes('template'))) {
      patterns.push('Use templates as starting points for new files');
    }

    // Date-based organization
    if (categories.some(cat => cat.description.includes('date-based'))) {
      patterns.push('Files are organized chronologically');
    }

    // Versioning workflow
    if (categories.some(cat => cat.description.includes('version'))) {
      patterns.push('Version control or iteration workflow in use');
    }

    // Documentation workflow
    if (categories.some(cat => cat.pattern.includes('.md'))) {
      patterns.push('Markdown documentation workflow');
    }

    // Configuration workflow
    if (
      categories.some(
        cat => cat.pattern.includes('.json') || cat.pattern.includes('.yaml')
      )
    ) {
      patterns.push('Configuration-driven workflow');
    }

    return patterns;
  }

  /**
   * Generate integration notes based on context
   */
  private generateIntegrationNotes(
    userContext: string,
    subdirs: SubdirRole[]
  ): string[] {
    const notes: string[] = [];

    // Look for references to other directories in context
    const contextLower = userContext.toLowerCase();

    if (contextLower.includes('session') || contextLower.includes('client')) {
      notes.push('Part of client session management workflow');
    }

    if (contextLower.includes('prompt') || contextLower.includes('template')) {
      notes.push('Supports prompt-based task automation');
    }

    if (contextLower.includes('analysis') || contextLower.includes('report')) {
      notes.push('Used for analysis and reporting tasks');
    }

    // Infer from subdirectory structure
    if (
      subdirs.some(d => d.name.includes('input') || d.name.includes('source'))
    ) {
      notes.push('Has input/source directory structure');
    }

    if (
      subdirs.some(d => d.name.includes('output') || d.name.includes('result'))
    ) {
      notes.push('Generates outputs to result directories');
    }

    return notes;
  }

  /**
   * Generate directory suggestions for invalid paths
   */
  private async generateDirectorySuggestions(
    targetPath: string
  ): Promise<DirectorySuggestion[]> {
    const suggestions: DirectorySuggestion[] = [];

    try {
      // Check parent directory exists
      const parentDir = dirname(targetPath);
      const targetName = basename(targetPath);

      const parentPathInfo = await getPathInfo(parentDir);
      if (parentPathInfo.exists && parentPathInfo.isDirectory) {
        try {
          validateAndNormalizePath(parentDir, this.allowedDirectories);
          const parentContents = await this.getDirectoryContents(parentDir);

          // Find similar directory names
          parentContents
            .filter(item => item.type === 'directory')
            .forEach(dir => {
              const similarity = this.calculateSimilarity(targetName, dir.name);
              if (similarity > 0.6) {
                suggestions.push({
                  path: join(parentDir, dir.name),
                  reason: `Similar name in parent directory`,
                  similarity,
                });
              }
            });
        } catch {
          // Parent directory not allowed
        }
      }

      // Check allowed directories for partial matches
      for (const allowedDir of this.allowedDirectories) {
        if (allowedDir.includes(targetName)) {
          const similarity = this.calculateSimilarity(targetPath, allowedDir);
          if (similarity > 0.4) {
            suggestions.push({
              path: allowedDir,
              reason: `Matches allowed directory pattern`,
              similarity,
            });
          }
        }
      }

      // Look for case variations
      const caseVariations = this.generateCaseVariations(targetPath);
      for (const variation of caseVariations) {
        try {
          const pathInfo = await getPathInfo(variation);
          if (pathInfo.exists && pathInfo.isDirectory) {
            validateAndNormalizePath(variation, this.allowedDirectories);
            suggestions.push({
              path: variation,
              reason: `Case variation`,
              similarity: 0.9,
            });
          }
        } catch {
          // Continue if directory can't be read
        }
      }
    } catch {
      // Continue with empty suggestions if error occurs
    }

    return suggestions.sort((a, b) => b.similarity - a.similarity).slice(0, 3); // Top 3 suggestions
  }

  /**
   * Calculate similarity between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.toLowerCase().includes(shorter[i].toLowerCase())) matches++;
    }

    return matches / longer.length;
  }

  /**
   * Generate case variations of a path
   */
  private generateCaseVariations(path: string): string[] {
    const variations = [];
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1];

    // Generate case variations for the last part
    variations.push(
      parts.slice(0, -1).concat(lastPart.toLowerCase()).join('/'),
      parts.slice(0, -1).concat(lastPart.toUpperCase()).join('/'),
      parts
        .slice(0, -1)
        .concat(lastPart.charAt(0).toUpperCase() + lastPart.slice(1))
        .join('/')
    );

    return variations.filter(v => v !== path);
  }

  /**
   * Get file type description from extension
   */
  private getFileTypeDescription(ext: string): string {
    const descriptions: Record<string, string> = {
      '.md': 'Markdown documents',
      '.txt': 'Text files',
      '.json': 'JSON data files',
      '.yaml': 'YAML configuration files',
      '.yml': 'YAML configuration files',
      '.js': 'JavaScript files',
      '.ts': 'TypeScript files',
      '.py': 'Python scripts',
      '.html': 'HTML documents',
      '.css': 'CSS stylesheets',
      '.png': 'PNG images',
      '.jpg': 'JPEG images',
      '.pdf': 'PDF documents',
      '': 'Files without extension',
    };

    return descriptions[ext] || `${ext.substring(1).toUpperCase()} files`;
  }
}
