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
import { ReadmeContentProcessor } from './readme-discovery.js';

export interface ReadmeGenerationOptions {
  readmeFilename?: string;
  analysisDepth?: number;
  maxContentLength?: number;
  verbosity?: 'concise' | 'verbose';
}

export interface ReadmeGenerationResult {
  content: Array<{ type: string; text: string }>;
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
      analysisDepth = 2, // Increased default depth for better structural analysis
      maxContentLength = 2000,
      verbosity = 'concise',
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

    // Analyze directory for intelligence
    const intelligence =
      await this.analysisService.analyzeDirectoryIntelligence(
        validPath,
        userContext,
        analysisDepth
      );

    // Generate fresh README content
    let newContent = this.generateReadmeContent(
      intelligence,
      validPath,
      verbosity
    );

    // Truncate if too long
    if (newContent.length > maxContentLength) {
      newContent = this.truncateReadmeContent(newContent, maxContentLength);
    }

    // Write README file (replacing any existing content)
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
    directoryPath: string,
    verbosity: 'concise' | 'verbose' = 'concise'
  ): string {
    const dirName = this.extractDirectoryName(
      intelligence.purpose,
      directoryPath
    );
    const sections: string[] = [];

    // Title and Purpose (always included)
    sections.push(`# ${dirName}\n\n${intelligence.purpose}\n`);

    if (verbosity === 'concise') {
      // Concise mode: Focus primarily on directory structure with README synthesis
      if (intelligence.subdirectoryRoles.length > 0) {
        sections.push('## Directory Structure');

        // Separate documented and undocumented directories
        const documentedDirs = intelligence.subdirectoryRoles.filter(
          subdir => subdir.hasReadme
        );
        const undocumentedDirs = intelligence.subdirectoryRoles.filter(
          subdir => !subdir.hasReadme
        );

        // Show documented directories first with their README-derived descriptions
        if (documentedDirs.length > 0) {
          sections.push('**Documented Areas:**');
          sections.push(
            documentedDirs
              .map(subdir => {
                const title = subdir.readmeTitle
                  ? ` (${subdir.readmeTitle})`
                  : '';
                return `- **${subdir.name}/${title}**: ${subdir.inferredPurpose}`;
              })
              .join('\n')
          );
          sections.push('');
        }

        // Show undocumented directories more briefly
        if (undocumentedDirs.length > 0) {
          const briefList = undocumentedDirs
            .map(subdir => `**${subdir.name}/**: ${subdir.inferredPurpose}`)
            .join('\n');
          sections.push(documentedDirs.length > 0 ? '**Other Areas:**' : '');
          sections.push(briefList);
          sections.push('');
        }
      }

      // Only show key files if they're particularly important (fewer than before)
      const criticalFiles = intelligence.keyFiles.slice(0, 3); // Limit to top 3
      if (criticalFiles.length > 0) {
        sections.push(
          '**Key Files:** ' +
            criticalFiles.map(file => `**${file}**`).join(', ')
        );
        sections.push('');
      }
    } else {
      // Verbose mode: Comprehensive structural analysis with contextual details

      // Subdirectories section with enhanced README synthesis
      if (intelligence.subdirectoryRoles.length > 0) {
        sections.push('## Directory Structure');

        const documentedDirs = intelligence.subdirectoryRoles.filter(
          subdir => subdir.hasReadme
        );
        const undocumentedDirs = intelligence.subdirectoryRoles.filter(
          subdir => !subdir.hasReadme
        );

        // Documented directories with full README context
        if (documentedDirs.length > 0) {
          sections.push('### Documented Areas');
          documentedDirs.forEach(subdir => {
            const title = subdir.readmeTitle || subdir.name;
            sections.push(`**${subdir.name}/ (${title})**`);
            sections.push(
              `${subdir.inferredPurpose} (${subdir.fileCount} items)`
            );

            // Include brief excerpt from README if available
            if (subdir.readmeContent && subdir.readmeContent.length > 50) {
              const excerpt = ReadmeContentProcessor.truncateContent(
                subdir.readmeContent,
                150
              );
              sections.push(`*${excerpt}*`);
            }
            sections.push('');
          });
        }

        // Undocumented directories more briefly
        if (undocumentedDirs.length > 0) {
          sections.push(documentedDirs.length > 0 ? '### Other Areas' : '');
          sections.push(
            undocumentedDirs
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
      }

      // Organization section (de-emphasized, focused on patterns rather than individual files)
      const significantCategories = intelligence.fileCategories.filter(
        cat => cat.count > 3
      );
      if (significantCategories.length > 0) {
        sections.push('## Content Organization');
        sections.push(this.formatFileCategories(significantCategories));
        sections.push('');
      }

      // Usage Patterns section (moved up for better workflow understanding)
      if (intelligence.workflowHints.length > 0) {
        sections.push('## Usage Patterns');
        sections.push(
          intelligence.workflowHints.map(hint => `- ${hint}`).join('\n')
        );
        sections.push('');
      }

      // Key Files section (reduced prominence, only most critical files)
      const criticalFiles = intelligence.keyFiles.slice(0, 5);
      if (criticalFiles.length > 0) {
        sections.push('## Key Files');
        sections.push(
          criticalFiles
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

      // Integration Notes section
      if (intelligence.integrationNotes.length > 0) {
        sections.push('## Integration Notes');
        sections.push(
          intelligence.integrationNotes.map(note => `- ${note}`).join('\n')
        );
        sections.push('');
      }
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
