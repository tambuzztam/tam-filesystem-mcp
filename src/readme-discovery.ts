/**
 * README Discovery and Caching System
 *
 * Provides intelligent README file discovery with pattern matching,
 * depth control, and caching for the enhanced list-files feature.
 */

import { readFile, stat, readdir } from 'fs/promises';
import { join, dirname, relative, basename } from 'path';
import { validateAndNormalizePath, getPathInfo } from './security.js';

export interface ReadmeFile {
  path: string;
  relativePath: string;
  depth: number;
  content: string;
  directoryContext: string; // The directory this README describes
  size: number;
  modified: Date;
}

export interface ReadmeCacheEntry {
  content: string;
  mtime: number;
  size: number;
}

export interface ReadmeDiscoveryOptions {
  maxDepth?: number;
  patterns?: string[];
  maxFileSize?: number; // in bytes, default 100KB
  allowedDirectories?: string[];
}

/**
 * Default README file patterns in order of preference
 */
export const DEFAULT_README_PATTERNS = [
  'README.md',
  'readme.md',
  'README.txt',
  'readme.txt',
  'README',
  'readme',
  'index.md',
  'overview.md',
];

/**
 * README Discovery and Caching Service
 */
export class ReadmeDiscoveryService {
  private readmeCache = new Map<string, ReadmeCacheEntry>();
  private readonly maxFileSize: number;
  private readonly patterns: string[];

  constructor(
    private allowedDirectories: string[],
    options: ReadmeDiscoveryOptions = {}
  ) {
    this.maxFileSize = options.maxFileSize || 100 * 1024; // 100KB default
    this.patterns = options.patterns || DEFAULT_README_PATTERNS;
  }

  /**
   * Discover README files in directory tree
   */
  async discoverReadmeFiles(
    rootPath: string,
    maxDepth: number = 3
  ): Promise<ReadmeFile[]> {
    // Validate root path
    const validRootPath = validateAndNormalizePath(
      rootPath,
      this.allowedDirectories
    );

    const readmeFiles: ReadmeFile[] = [];
    await this._discoverReadmeFilesRecursive(
      validRootPath,
      validRootPath,
      0,
      maxDepth,
      readmeFiles
    );

    return readmeFiles.sort((a, b) => a.depth - b.depth);
  }

  /**
   * Get cached README content or read from file
   */
  async getCachedReadme(filePath: string): Promise<string> {
    try {
      const stats = await stat(filePath);
      const cached = this.readmeCache.get(filePath);

      if (
        cached &&
        cached.mtime >= stats.mtimeMs &&
        cached.size === stats.size
      ) {
        return cached.content;
      }

      // Check file size
      if (stats.size > this.maxFileSize) {
        throw new Error(
          `README file too large: ${stats.size} bytes (max: ${
            this.maxFileSize
          })`
        );
      }

      const content = await readFile(filePath, 'utf-8');
      this.readmeCache.set(filePath, {
        content,
        mtime: stats.mtimeMs,
        size: stats.size,
      });

      return content;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Remove from cache if file no longer exists
        this.readmeCache.delete(filePath);
      }
      throw error;
    }
  }

  /**
   * Find README file in a specific directory
   */
  async findReadmeInDirectory(
    directoryPath: string
  ): Promise<ReadmeFile | null> {
    // Validate directory path
    const validPath = validateAndNormalizePath(
      directoryPath,
      this.allowedDirectories
    );

    const pathInfo = await getPathInfo(validPath);
    if (!pathInfo.exists || !pathInfo.isDirectory) {
      return null;
    }

    // Try each README pattern in order of preference
    for (const pattern of this.patterns) {
      const readmePath = join(validPath, pattern);

      try {
        const readmeInfo = await getPathInfo(readmePath);
        if (readmeInfo.exists && readmeInfo.isFile) {
          const content = await this.getCachedReadme(readmePath);

          return {
            path: readmePath,
            relativePath: relative(validPath, readmePath),
            depth: 0,
            content: content.trim(),
            directoryContext: validPath,
            size: readmeInfo.size || 0,
            modified: readmeInfo.modified || new Date(),
          };
        }
      } catch (error) {
        // Continue to next pattern if this one fails
        console.warn(
          `Failed to read README at ${readmePath}:`,
          (error as Error).message
        );
        continue;
      }
    }

    return null;
  }

  /**
   * Clear cache for a specific file or all files
   */
  clearCache(filePath?: string): void {
    if (filePath) {
      this.readmeCache.delete(filePath);
    } else {
      this.readmeCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ path: string; size: number; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.readmeCache.entries()).map(
      ([path, entry]) => ({
        path,
        size: entry.size,
        age: now - entry.mtime,
      })
    );

    return {
      size: this.readmeCache.size,
      entries,
    };
  }

  /**
   * Recursive README discovery implementation
   */
  private async _discoverReadmeFilesRecursive(
    currentPath: string,
    rootPath: string,
    currentDepth: number,
    maxDepth: number,
    results: ReadmeFile[]
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      // Find README in current directory
      const readme = await this.findReadmeInDirectory(currentPath);
      if (readme) {
        readme.depth = currentDepth;
        readme.relativePath = relative(rootPath, readme.path);
        results.push(readme);
      }

      // Don't recurse into subdirectories if we're at max depth
      if (currentDepth >= maxDepth) {
        return;
      }

      // Get subdirectories and recurse
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subdirPath = join(currentPath, entry.name);

          // Ensure subdirectory is within allowed paths
          try {
            validateAndNormalizePath(subdirPath, this.allowedDirectories);
            await this._discoverReadmeFilesRecursive(
              subdirPath,
              rootPath,
              currentDepth + 1,
              maxDepth,
              results
            );
          } catch {
            // Skip directories outside allowed paths
            console.warn(
              `Skipping directory outside allowed paths: ${subdirPath}`
            );
            continue;
          }
        }
      }
    } catch (error) {
      console.warn(
        `Error discovering READMEs in ${currentPath}:`,
        (error as Error).message
      );
    }
  }
}

/**
 * Utility functions for README content processing
 */
export class ReadmeContentProcessor {
  /**
   * Extract first meaningful line from README content
   */
  static extractFirstLine(content: string): string {
    const lines = content.split('\n').map(line => line.trim());

    for (const line of lines) {
      // Skip empty lines, markdown headers, and common markup
      if (
        line &&
        !line.startsWith('#') &&
        !line.startsWith('---') &&
        !line.match(/^[*\-_]+$/)
      ) {
        // Limit length and clean up
        return line.length > 100 ? line.substring(0, 97) + '...' : line;
      }
    }

    return 'No description available';
  }

  /**
   * Extract title from README content (first heading or filename)
   */
  static extractTitle(content: string, fallbackPath: string): string {
    const lines = content.split('\n');

    // Look for first heading
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        // Remove markdown header syntax
        const title = trimmed.replace(/^#+\s*/, '').trim();
        if (title) {
          return title;
        }
      }
    }

    // Fall back to directory name
    return basename(dirname(fallbackPath));
  }

  /**
   * Truncate README content for display (preserve structure)
   */
  static truncateContent(content: string, maxLength: number = 500): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Try to break at a natural point (end of paragraph or section)
    const truncated = content.substring(0, maxLength);
    const lastNewline = truncated.lastIndexOf('\n\n');
    const lastSentence = truncated.lastIndexOf('.');

    // Use the better break point
    const breakPoint =
      lastNewline > maxLength * 0.7
        ? lastNewline
        : lastSentence > maxLength * 0.7
          ? lastSentence + 1
          : maxLength;

    return content.substring(0, breakPoint) + '...';
  }

  /**
   * Check if content appears to be a valid README
   */
  static isValidReadmeContent(content: string): boolean {
    const trimmed = content.trim();

    // Too short to be useful
    if (trimmed.length < 10) {
      return false;
    }

    // Contains only code or data (very rough heuristic)
    const codeLines = trimmed
      .split('\n')
      .filter(
        line =>
          line.trim().startsWith('```') || line.trim().match(/^[{}[\]();,\s]*$/)
      ).length;

    const totalLines = trimmed.split('\n').length;

    // If more than 80% appears to be code, probably not a useful README
    return codeLines / totalLines < 0.8;
  }
}
