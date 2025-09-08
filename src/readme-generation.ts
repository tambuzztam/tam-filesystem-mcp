/**
 * README Generation for LLM Task Orientation
 *
 * Creates README files specifically designed to orient LLMs for efficient
 * task execution by analyzing directory contents and user context.
 */

import { readFile, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { validateAndNormalizePath, getPathInfo } from './security.js';
import {
  DirectoryAnalysisService,
  DirectoryIntelligence,
  FileCategory,
} from './directory-analysis.js';

export interface ReadmeGenerationOptions {
  readmeFilename?: string;
  preserveExisting?: boolean;
  analysisDepth?: number;
  maxContentLength?: number;
}

export interface ReadmeGenerationResult {
  content: Array<{ type: string; text: string }>;
}

export interface UserSection {
  title: string;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * README Generation Service
 */
export class ReadmeGenerationService {
  private analysisService: DirectoryAnalysisService;

  constructor(private allowedDirectories: string[]) {
    this.analysisService = new DirectoryAnalysisService(allowedDirectories);
  }

  /**
   * Generate or refresh a README file for LLM task orientation
   */
  async generateReadmeForOrientation(
    targetDirectory: string,
    userContext: string,
    options: ReadmeGenerationOptions = {}
  ): Promise<ReadmeGenerationResult> {
    const {
      readmeFilename = 'README.md',
      preserveExisting = true,
      analysisDepth = 1,
      maxContentLength = 2000,
    } = options;

    // Validate directory with suggestions
    const dirValidation =
      await this.analysisService.validateAndSuggestDirectory(targetDirectory);

    if (!dirValidation.exists) {
      if (dirValidation.suggestions.length > 0) {
        const suggestionText = dirValidation.suggestions
          .map(s => `- ${s.path} (${s.reason})`)
          .join('\n');

        throw new Error(
          `Directory not found: ${targetDirectory}\n\nDid you mean:\n${suggestionText}\n\nPlease confirm the correct path.`
        );
      } else {
        throw new Error(`Directory not found: ${targetDirectory}`);
      }
    }

    if (!dirValidation.allowed) {
      throw new Error(`Directory not allowed: ${targetDirectory}`);
    }

    const validPath = validateAndNormalizePath(
      targetDirectory,
      this.allowedDirectories
    );
    const readmePath = join(validPath, readmeFilename);

    // Preserve existing content if requested
    let existingContent = '';
    let preservedSections: UserSection[] = [];

    if (preserveExisting) {
      try {
        const pathInfo = await getPathInfo(readmePath);
        if (pathInfo.exists) {
          existingContent = await readFile(readmePath, 'utf-8');
          preservedSections = this.extractUserSections(existingContent);
        }
      } catch {
        // File doesn't exist or can't be read - continue with fresh generation
      }
    }

    // Analyze directory for intelligence
    const intelligence =
      await this.analysisService.analyzeDirectoryIntelligence(
        validPath,
        userContext,
        analysisDepth
      );

    // Generate new README content
    let newContent = this.generateReadmeContent(intelligence, validPath);

    // Truncate if too long
    if (newContent.length > maxContentLength) {
      newContent = this.truncateReadmeContent(newContent, maxContentLength);
    }

    // Merge with preserved content if applicable
    if (preservedSections.length > 0) {
      newContent = this.mergeWithPreservedContent(
        newContent,
        preservedSections
      );
    }

    // Write README file
    await writeFile(readmePath, newContent, 'utf-8');

    return {
      content: [
        {
          type: 'text',
          text: `README generated at ${readmePath}\n\nContent:\n${newContent}`,
        },
      ],
    };
  }

  /**
   * Generate README content from directory intelligence
   */
  private generateReadmeContent(
    intelligence: DirectoryIntelligence,
    directoryPath: string
  ): string {
    const dirName = this.extractDirectoryName(
      intelligence.purpose,
      directoryPath
    );
    const sections: string[] = [];

    // Title and Purpose
    sections.push(`# ${dirName}\n\n## Purpose\n${intelligence.purpose}\n`);

    // Organization section
    if (intelligence.fileCategories.length > 0) {
      sections.push('## Organization');
      sections.push(this.formatFileCategories(intelligence.fileCategories));
      sections.push('');
    }

    // Key Files section
    if (intelligence.keyFiles.length > 0) {
      sections.push('## Key Files');
      sections.push(
        intelligence.keyFiles
          .map(file => {
            const importance = this.inferFileImportance(file, intelligence);
            return `- **${file}**: ${importance}`;
          })
          .join('\n')
      );
      sections.push('');
    }

    // Conventions section
    if (intelligence.namingPatterns.length > 0) {
      sections.push('## Conventions');
      sections.push(
        intelligence.namingPatterns.map(pattern => `- ${pattern}`).join('\n')
      );
      sections.push('');
    }

    // Subdirectories section
    if (intelligence.subdirectoryRoles.length > 0) {
      sections.push('## Subdirectories');
      sections.push(
        intelligence.subdirectoryRoles
          .map(
            subdir =>
              `- **${subdir.name}/**: ${subdir.inferredPurpose} (${
                subdir.fileCount
              } items)`
          )
          .join('\n')
      );
      sections.push('');
    }

    // Usage Patterns section
    if (intelligence.workflowHints.length > 0) {
      sections.push('## Usage Patterns');
      sections.push(
        intelligence.workflowHints.map(hint => `- ${hint}`).join('\n')
      );
      sections.push('');
    }

    // Integration Notes section
    if (intelligence.integrationNotes.length > 0) {
      sections.push('## Integration Notes');
      sections.push(
        intelligence.integrationNotes.map(note => `- ${note}`).join('\n')
      );
      sections.push('');
    }

    // Footer
    const today = new Date().toISOString().split('T')[0];
    sections.push('---');
    sections.push(`*Generated on ${today} for LLM task orientation*`);

    return sections.join('\n');
  }

  /**
   * Format file categories for display
   */
  private formatFileCategories(categories: FileCategory[]): string {
    return categories
      .map(cat => {
        const examples =
          cat.examples.length > 0 ? ` (e.g., ${cat.examples.join(', ')})` : '';
        return `- **${cat.description}**: ${cat.count} file${
          cat.count === 1 ? '' : 's'
        }${examples}`;
      })
      .join('\n');
  }

  /**
   * Infer why a file is important
   */
  private inferFileImportance(
    fileName: string,
    intelligence: DirectoryIntelligence
  ): string {
    const nameLower = fileName.toLowerCase();

    // Check if mentioned in user context
    if (intelligence.purpose.toLowerCase().includes(nameLower)) {
      return 'Key file mentioned in purpose';
    }

    // Common important file patterns
    if (nameLower.includes('template')) {
      return 'Template for creating new files';
    }
    if (nameLower.includes('config') || nameLower.includes('setting')) {
      return 'Configuration file';
    }
    if (nameLower.includes('index') || nameLower.includes('main')) {
      return 'Main entry point or index';
    }
    if (nameLower.includes('example') || nameLower.includes('sample')) {
      return 'Example or reference file';
    }
    if (nameLower.includes('readme')) {
      return 'Documentation file';
    }

    // Check file size implications (if this was a large file)
    return 'Important file in this directory';
  }

  /**
   * Extract directory name for title
   */
  private extractDirectoryName(purpose: string, directoryPath: string): string {
    // Try to extract a meaningful name from the purpose
    const words = purpose.split(' ').slice(0, 4); // First few words
    const capitalizedWords = words.map(
      word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );

    if (capitalizedWords.length > 0 && capitalizedWords.join(' ').length < 50) {
      return capitalizedWords.join(' ');
    }

    // Fall back to directory name
    return basename(directoryPath);
  }

  /**
   * Extract user-written sections from existing README
   */
  private extractUserSections(content: string): UserSection[] {
    const lines = content.split('\n');
    const sections: UserSection[] = [];
    let currentSection: UserSection | null = null;
    let inGeneratedContent = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for generated content marker
      if (
        line.includes('Generated on') &&
        line.includes('for LLM task orientation')
      ) {
        inGeneratedContent = true;
        continue;
      }

      // Skip generated content
      if (inGeneratedContent) {
        continue;
      }

      // Check for section headers
      if (line.startsWith('# ') || line.startsWith('## ')) {
        // Save previous section
        if (currentSection) {
          currentSection.endLine = i - 1;
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          title: line,
          content: '',
          startLine: i,
          endLine: i,
        };
      } else if (currentSection) {
        // Add to current section
        currentSection.content += (currentSection.content ? '\n' : '') + line;
      }
    }

    // Save last section
    if (currentSection && !inGeneratedContent) {
      currentSection.endLine = lines.length - 1;
      sections.push(currentSection);
    }

    // Filter out sections that look generated
    return sections.filter(
      section =>
        !this.looksLikeGeneratedContent(section.content) &&
        section.content.trim().length > 10
    );
  }

  /**
   * Check if content looks like it was generated
   */
  private looksLikeGeneratedContent(content: string): boolean {
    const indicators = [
      'Generated on',
      'for LLM task orientation',
      'file categories:',
      'naming patterns:',
      'key files:',
      'subdirectories:',
    ];

    const contentLower = content.toLowerCase();
    return indicators.some(indicator => contentLower.includes(indicator));
  }

  /**
   * Merge generated content with preserved user sections
   */
  private mergeWithPreservedContent(
    newContent: string,
    preservedSections: UserSection[]
  ): string {
    if (preservedSections.length === 0) {
      return newContent;
    }

    const lines = newContent.split('\n');
    const mergedLines: string[] = [];
    let i = 0;

    // Find insertion points for preserved sections
    while (i < lines.length) {
      const line = lines[i];

      // Check if any preserved sections should be inserted here
      const matchingSection = preservedSections.find(section =>
        this.shouldInsertSectionHere(section, line, lines, i)
      );

      if (matchingSection) {
        // Insert preserved section
        mergedLines.push('', '## 📝 Notes', '');
        mergedLines.push(matchingSection.content);
        mergedLines.push('');

        // Remove this section from the list
        const index = preservedSections.indexOf(matchingSection);
        preservedSections.splice(index, 1);
      }

      mergedLines.push(line);
      i++;
    }

    // Add any remaining preserved sections at the end
    if (preservedSections.length > 0) {
      mergedLines.push('', '## 📝 Additional Notes', '');
      for (const section of preservedSections) {
        mergedLines.push(section.content);
        mergedLines.push('');
      }
    }

    return mergedLines.join('\n');
  }

  /**
   * Determine where to insert a preserved section
   */
  private shouldInsertSectionHere(
    section: UserSection,
    currentLine: string,
    allLines: string[],
    currentIndex: number
  ): boolean {
    // Insert before the footer (generated marker)
    if (currentLine.startsWith('---') || currentLine.includes('Generated on')) {
      return true;
    }

    // Insert after integration notes or usage patterns
    if (currentIndex > 0) {
      const previousLine = allLines[currentIndex - 1];
      if (
        previousLine.includes('Integration Notes') ||
        previousLine.includes('Usage Patterns')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Truncate README content while preserving structure
   */
  private truncateReadmeContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    const lines = content.split('\n');
    let currentLength = 0;
    const truncatedLines: string[] = [];

    for (const line of lines) {
      if (currentLength + line.length + 1 > maxLength * 0.9) {
        // Try to end at a natural section break
        if (
          line.startsWith('#') ||
          line.trim() === '' ||
          line.startsWith('---')
        ) {
          truncatedLines.push(line);
          break;
        }

        // If we can't find a good break, just stop here
        truncatedLines.push('...');
        truncatedLines.push('');
        truncatedLines.push('*(Content truncated for brevity)*');
        break;
      }

      truncatedLines.push(line);
      currentLength += line.length + 1;
    }

    // Always include footer if we truncated
    if (currentLength >= maxLength * 0.9) {
      truncatedLines.push('');
      truncatedLines.push('---');
      const today = new Date().toISOString().split('T')[0];
      truncatedLines.push(`*Generated on ${today} for LLM task orientation*`);
    }

    return truncatedLines.join('\n');
  }

  /**
   * Validate README file path and content
   */
  async validateReadmeFile(readmePath: string): Promise<{
    exists: boolean;
    readable: boolean;
    size: number;
    isGenerated: boolean;
  }> {
    try {
      const pathInfo = await getPathInfo(readmePath);

      if (!pathInfo.exists) {
        return {
          exists: false,
          readable: false,
          size: 0,
          isGenerated: false,
        };
      }

      let content = '';
      let readable = true;
      let isGenerated = false;

      try {
        content = await readFile(readmePath, 'utf-8');
        isGenerated =
          content.includes('Generated on') &&
          content.includes('for LLM task orientation');
      } catch {
        readable = false;
      }

      return {
        exists: true,
        readable,
        size: pathInfo.size || 0,
        isGenerated,
      };
    } catch {
      return {
        exists: false,
        readable: false,
        size: 0,
        isGenerated: false,
      };
    }
  }

  /**
   * Get suggestions for improving an existing README
   */
  async suggestReadmeImprovements(
    readmePath: string,
    directoryPath: string
  ): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      const content = await readFile(readmePath, 'utf-8');
      const intelligence =
        await this.analysisService.analyzeDirectoryIntelligence(
          directoryPath,
          'Existing directory analysis',
          1
        );

      // Check for missing sections
      if (!content.includes('## Purpose') && !content.includes('# ')) {
        suggestions.push('Add a clear purpose statement');
      }

      if (intelligence.keyFiles.length > 0 && !content.includes('Key Files')) {
        suggestions.push('Highlight important files in a Key Files section');
      }

      if (
        intelligence.namingPatterns.length > 0 &&
        !content.includes('Conventions')
      ) {
        suggestions.push('Document naming conventions used in this directory');
      }

      if (
        intelligence.subdirectoryRoles.length > 0 &&
        !content.includes('Subdirectories')
      ) {
        suggestions.push('Explain the purpose of subdirectories');
      }

      // Check content quality
      if (content.length < 100) {
        suggestions.push('Expand the README with more descriptive content');
      }

      if (
        !content.includes('workflow') &&
        !content.includes('usage') &&
        intelligence.workflowHints.length > 0
      ) {
        suggestions.push('Add usage patterns or workflow guidance');
      }
    } catch {
      suggestions.push('Could not analyze existing README file');
    }

    return suggestions;
  }
}
