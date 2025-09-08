/**
 * Enhanced List-Files with README Context
 *
 * Provides an intelligent directory listing that automatically discovers
 * and presents README files to provide LLMs with immediate contextual
 * understanding of vault structure and contents.
 */

import { readdir } from 'fs/promises';
import { join, basename } from 'path';
import { validateAndNormalizePath, getPathInfo } from './security.js';
import {
  ReadmeDiscoveryService,
  ReadmeFile,
  ReadmeContentProcessor,
} from './readme-discovery.js';
import { DirectoryChangeDetectionService } from './directory-change-detection.js';
import { formatSize } from '@modelcontextprotocol/server-filesystem/dist/lib.js';

export interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
  path: string;
}

export interface EnhancedListingOptions {
  maxDepth?: number;
  includeHidden?: boolean;
  summarize?: boolean;
  maxReadmeLength?: number;
}

export interface EnhancedListingResult {
  content: Array<{ type: string; text: string }>;
}

/**
 * Enhanced Listing Service that combines directory listings with README context
 */
export class EnhancedListingService {
  private readmeService: ReadmeDiscoveryService;
  private changeDetection: DirectoryChangeDetectionService;

  constructor(private allowedDirectories: string[]) {
    this.readmeService = new ReadmeDiscoveryService(allowedDirectories);
    this.changeDetection = new DirectoryChangeDetectionService(
      allowedDirectories
    );
  }

  /**
   * List directory contents with contextual README information
   */
  async listFilesWithContext(
    path: string,
    options: EnhancedListingOptions = {}
  ): Promise<EnhancedListingResult> {
    // Validate path
    const validPath = validateAndNormalizePath(path, this.allowedDirectories);

    // Check path exists and is directory
    const pathInfo = await getPathInfo(validPath);
    if (!pathInfo.exists) {
      throw new Error(`Path does not exist: ${path}`);
    }
    if (!pathInfo.isDirectory) {
      throw new Error(`Path is not a directory: ${path}`);
    }

    const {
      maxDepth = 3,
      includeHidden = false,
      summarize = true,
      maxReadmeLength = 500,
    } = options;

    // Discover README files in directory tree
    const readmeFiles = await this.readmeService.discoverReadmeFiles(
      validPath,
      maxDepth
    );

    // Get standard file listing
    const standardListing = await this.getDirectoryListing(
      validPath,
      includeHidden
    );

    // Structure the enhanced response
    let output = '';

    // Current directory README first (if it exists)
    const currentReadme = readmeFiles.find(
      r => r.directoryContext === validPath
    );
    if (currentReadme) {
      const title = ReadmeContentProcessor.extractTitle(
        currentReadme.content,
        currentReadme.path
      );
      const content = ReadmeContentProcessor.truncateContent(
        currentReadme.content,
        maxReadmeLength
      );

      output += `# Directory Context: ${title}\n\n`;
      output += `${content}\n\n`;
      output += '---\n\n';
    }

    // Current directory file listing
    output += `## Files and Directories in ${this.formatPathForDisplay(validPath)}\n\n`;
    output += this.formatFileList(standardListing);
    output += '\n\n';

    // Subdirectory contexts (only if READMEs are found)
    const subdirReadmes = readmeFiles.filter(
      r => r.directoryContext !== validPath
    );
    if (subdirReadmes.length > 0) {
      output += '## Documented Subdirectories\n\n';

      for (const readme of subdirReadmes) {
        const dirTitle = ReadmeContentProcessor.extractTitle(
          readme.content,
          readme.path
        );
        const relativeDir = this.getRelativePath(
          validPath,
          readme.directoryContext
        );
        const truncatedContent = ReadmeContentProcessor.truncateContent(
          readme.content,
          maxReadmeLength
        );

        output += `### ${relativeDir}\n\n`;
        output += `**${dirTitle}**\n\n`;
        output += `${truncatedContent}\n\n`;

        // List files in this subdirectory
        try {
          const subdirListing = await this.getDirectoryListing(
            readme.directoryContext,
            includeHidden
          );
          if (subdirListing.length > 0) {
            output += '**Contents:**\n';
            output += this.formatFileList(subdirListing, '  ');
            output += '\n\n';
          }
        } catch (error: unknown) {
          // Continue if subdirectory can't be read
          console.warn(
            `Could not read subdirectory ${readme.directoryContext}:`,
            (error as Error).message
          );
        }
      }
    }

    // Optional navigation summary
    if (summarize) {
      output += this.generateNavigationSummary(readmeFiles, validPath);
    }

    // Check for outdated README and add refresh suggestion
    const refreshSuggestion = await this.checkForOutdatedReadme(
      validPath,
      currentReadme || null
    );
    if (refreshSuggestion) {
      output += '\n\n' + refreshSuggestion;
    }

    return {
      content: [
        {
          type: 'text',
          text: output.trim(),
        },
      ],
    };
  }

  /**
   * Get directory listing with file metadata
   */
  private async getDirectoryListing(
    directoryPath: string,
    includeHidden: boolean = false
  ): Promise<FileInfo[]> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const fileInfos: FileInfo[] = [];

    for (const entry of entries) {
      // Skip hidden files/directories unless requested
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

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
        // If we can't get info for this item, include basic info
        fileInfos.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: fullPath,
        });
      }
    }

    // Sort directories first, then files, alphabetically
    return fileInfos.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Format file list for display
   */
  private formatFileList(files: FileInfo[], indent: string = ''): string {
    if (files.length === 0) {
      return `${indent}*(empty directory)*`;
    }

    return files
      .map(file => {
        const icon = file.type === 'directory' ? '📁' : '📄';
        const size =
          file.type === 'file' && file.size !== undefined
            ? ` (${formatSize(file.size)})`
            : '';
        const modified = file.modified
          ? ` - ${file.modified.toISOString().split('T')[0]}`
          : '';

        return `${indent}- ${icon} **${file.name}**${size}${modified}`;
      })
      .join('\n');
  }

  /**
   * Generate navigation summary
   */
  private generateNavigationSummary(
    readmeFiles: ReadmeFile[],
    currentPath: string
  ): string {
    if (readmeFiles.length === 0) {
      return `\n## Navigation Summary\n\n📁 Standard directory listing - no README documentation found.\n💡 **LLM Guidance**: Explore files and subdirectories to understand the structure.\n`;
    }

    const documentedAreas = readmeFiles
      .map(r => {
        const dirName =
          this.getRelativePath(currentPath, r.directoryContext) ||
          'current directory';
        const description = ReadmeContentProcessor.extractFirstLine(r.content);
        return `- **${dirName}**: ${description}`;
      })
      .join('\n');

    return `\n## Navigation Summary\n\nFound documentation for ${readmeFiles.length} area${readmeFiles.length === 1 ? '' : 's'}:\n\n${documentedAreas}\n\n💡 **LLM Guidance**: Use the available README context above. Undocumented directories require exploration to understand their purpose.\n`;
  }

  /**
   * Get relative path for display
   */
  private getRelativePath(basePath: string, targetPath: string): string {
    if (basePath === targetPath) {
      return '';
    }

    // Simple relative path calculation
    if (targetPath.startsWith(basePath)) {
      const relative = targetPath.substring(basePath.length);
      return relative.startsWith('/') ? relative.substring(1) : relative;
    }

    // Fall back to basename
    return basename(targetPath);
  }

  /**
   * Format path for display (remove common prefixes)
   */
  private formatPathForDisplay(path: string): string {
    // Try to make paths more readable by removing common prefixes
    const segments = path.split('/');

    // If path is very long, show last few segments
    if (segments.length > 4) {
      return '.../' + segments.slice(-3).join('/');
    }

    return path;
  }

  /**
   * Find README in directory (public accessor)
   */
  async findReadmeInDirectory(
    directoryPath: string
  ): Promise<ReadmeFile | null> {
    return await this.readmeService.findReadmeInDirectory(directoryPath);
  }

  /**
   * Clear README cache (useful for testing or when files change)
   */
  clearCache(): void {
    this.readmeService.clearCache();
  }

  /**
   * Check if README is outdated and suggest refresh
   */
  private async checkForOutdatedReadme(
    directoryPath: string,
    currentReadme: ReadmeFile | null
  ): Promise<string | null> {
    try {
      // Extract README generation date if it exists
      let readmeAge: Date | undefined;
      if (currentReadme && currentReadme.content) {
        const generatedMatch = currentReadme.content.match(
          /\*Generated on (\d{4}-\d{2}-\d{2})/i
        );
        if (generatedMatch) {
          readmeAge = new Date(generatedMatch[1]);
        } else if (currentReadme.modified) {
          // Fall back to file modification time
          readmeAge = currentReadme.modified;
        }
      }

      // Detect changes
      const changeResult = await this.changeDetection.detectChanges(
        directoryPath,
        readmeAge
      );

      if (changeResult.hasSignificantChanges) {
        const summary =
          this.changeDetection.generateChangesSummary(changeResult);
        const prompt = this.changeDetection.getRefreshPrompt(
          changeResult,
          directoryPath
        );

        let output = '## 🔄 README Status\n\n';
        output += summary;

        if (prompt) {
          output += '\n\n**💬 ' + prompt + '**';
          output +=
            '\n\n*Use `generate_readme_for_orientation` to refresh the README with current information.*';
        }

        return output;
      }

      return null;
    } catch (error: any) {
      // Don't fail the whole operation if change detection fails
      console.warn('Change detection failed:', error.message);
      return null;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    readmeCache: {
      size: number;
      entries: Array<{ path: string; size: number; age: number }>;
    };
    changeDetection: {
      count: number;
      paths: string[];
      oldestSnapshot?: Date;
    };
  } {
    return {
      readmeCache: this.readmeService.getCacheStats(),
      changeDetection: this.changeDetection.getSnapshotStats(),
    };
  }
}

/**
 * Utility functions for enhanced listings
 */
export class ListingUtilities {
  /**
   * Detect file categories from a file list
   */
  static categorizeFiles(files: FileInfo[]): Map<string, FileInfo[]> {
    const categories = new Map<string, FileInfo[]>();

    for (const file of files) {
      if (file.type === 'directory') {
        const dirs = categories.get('directories') || [];
        dirs.push(file);
        categories.set('directories', dirs);
      } else {
        const ext = file.name.includes('.')
          ? file.name.split('.').pop()?.toLowerCase() || 'unknown'
          : 'no-extension';

        const group = categories.get(ext) || [];
        group.push(file);
        categories.set(ext, group);
      }
    }

    return categories;
  }

  /**
   * Generate file statistics summary
   */
  static generateFileStats(files: FileInfo[]): string {
    const stats = {
      totalFiles: 0,
      totalDirs: 0,
      totalSize: 0,
      extensions: new Set<string>(),
    };

    for (const file of files) {
      if (file.type === 'directory') {
        stats.totalDirs++;
      } else {
        stats.totalFiles++;
        if (file.size) {
          stats.totalSize += file.size;
        }

        const ext = file.name.includes('.')
          ? file.name.split('.').pop()?.toLowerCase()
          : null;
        if (ext) {
          stats.extensions.add(ext);
        }
      }
    }

    const parts = [];
    if (stats.totalFiles > 0) {
      parts.push(
        `${stats.totalFiles} file${stats.totalFiles === 1 ? '' : 's'}`
      );
    }
    if (stats.totalDirs > 0) {
      parts.push(
        `${stats.totalDirs} director${stats.totalDirs === 1 ? 'y' : 'ies'}`
      );
    }
    if (stats.totalSize > 0) {
      parts.push(`${formatSize(stats.totalSize)} total`);
    }
    if (stats.extensions.size > 0) {
      const extList = Array.from(stats.extensions).sort().join(', ');
      parts.push(`types: ${extList}`);
    }

    return parts.join(', ');
  }

  /**
   * Filter files by various criteria
   */
  static filterFiles(
    files: FileInfo[],
    criteria: {
      extensions?: string[];
      minSize?: number;
      maxSize?: number;
      namePattern?: RegExp;
      modifiedSince?: Date;
    }
  ): FileInfo[] {
    return files.filter(file => {
      // Extension filter
      if (criteria.extensions && file.type === 'file') {
        const ext = file.name.includes('.')
          ? file.name.split('.').pop()?.toLowerCase()
          : '';
        if (ext && !criteria.extensions.includes(ext)) {
          return false;
        }
      }

      // Size filters
      if (criteria.minSize && (file.size || 0) < criteria.minSize) {
        return false;
      }
      if (criteria.maxSize && (file.size || 0) > criteria.maxSize) {
        return false;
      }

      // Name pattern filter
      if (criteria.namePattern && !criteria.namePattern.test(file.name)) {
        return false;
      }

      // Modified date filter
      if (
        criteria.modifiedSince &&
        file.modified &&
        file.modified < criteria.modifiedSince
      ) {
        return false;
      }

      return true;
    });
  }
}
