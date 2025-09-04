/**
 * Security utilities for tam-filesystem-mcp
 *
 * Provides path validation, directory traversal prevention, and
 * safe file operation utilities to ensure the server only accesses
 * allowed directories and prevents security vulnerabilities.
 */

import { resolve, normalize, relative, join } from 'path';
import { stat } from 'fs/promises';

/**
 * Validate that a path is within allowed directories and safe to access
 */
export function validateAndNormalizePath(
  inputPath: string,
  allowedDirectories: string[]
): string {
  // Normalize the path to handle '..' and '.' components
  const normalizedPath = normalize(resolve(inputPath));

  // Check if the normalized path is within any of the allowed directories
  for (const allowedDir of allowedDirectories) {
    const normalizedAllowedDir = normalize(resolve(allowedDir));

    // Calculate relative path from allowed directory to target
    const relativePath = relative(normalizedAllowedDir, normalizedPath);

    // If the relative path doesn't start with '..' or is empty/same,
    // then the target is within the allowed directory
    if (
      !relativePath ||
      (!relativePath.startsWith('..') && !relativePath.startsWith('/'))
    ) {
      return normalizedPath;
    }
  }

  throw new SecurityError(
    'path_outside_allowed_directories',
    `Path '${inputPath}' is outside allowed directories: ${allowedDirectories.join(', ')}`
  );
}

/**
 * Validate that a vault-relative path is safe and construct full path
 */
export function validateVaultPath(
  vaultRelativePath: string,
  vaultRoot: string,
  allowedDirectories: string[]
): string {
  // Remove leading slash if present to ensure it's treated as relative
  const cleanPath = vaultRelativePath.startsWith('/')
    ? vaultRelativePath.slice(1)
    : vaultRelativePath;

  // Construct full path
  const fullPath = join(vaultRoot, cleanPath);

  // Validate against allowed directories
  return validateAndNormalizePath(fullPath, allowedDirectories);
}

/**
 * Check if a path exists and get basic information about it
 */
export async function getPathInfo(path: string): Promise<{
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
  size?: number;
  modified?: Date;
}> {
  try {
    const stats = await stat(path);
    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      modified: stats.mtime,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        exists: false,
        isFile: false,
        isDirectory: false,
      };
    }
    throw error;
  }
}

/**
 * Sanitize filename to prevent path traversal and ensure safe filename
 */
export function sanitizeFilename(filename: string): string {
  return (
    filename
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
      .replace(/\.+/g, '.') // Replace multiple dots with single dot
      .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
      .trim() || // Remove whitespace
    'unnamed'
  ); // Fallback if empty
}

/**
 * Create a safe filename for new files with proper extension
 */
export function createSafeFilename(
  baseName: string,
  extension: string = '.md'
): string {
  const sanitized = sanitizeFilename(baseName);
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `${sanitized}${ext}`;
}

/**
 * Validate that a search pattern is safe (no shell injection)
 */
export function validateSearchPattern(pattern: string): string {
  // Remove potentially dangerous characters for shell commands
  // Allow letters, numbers, spaces, common wildcards, but not shell metacharacters
  const sanitized = pattern.replace(/[;&|`$(){}[\]]/g, '');

  if (sanitized !== pattern) {
    throw new SecurityError(
      'unsafe_search_pattern',
      `Search pattern contains unsafe characters: '${pattern}'`
    );
  }

  return sanitized;
}

/**
 * Check if a file extension is allowed for processing
 */
export function isAllowedFileType(
  filePath: string,
  allowedExtensions: string[] = ['.md', '.txt', '.json']
): boolean {
  const extension = filePath.toLowerCase().split('.').pop();
  return extension ? allowedExtensions.includes(`.${extension}`) : false;
}

/**
 * Custom error class for security-related errors
 */
export class SecurityError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Rate limiting utility (simple in-memory implementation)
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(
    private maxRequests: number = 100,
    private windowMs: number = 60000 // 1 minute
  ) {}

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];

    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);

    return true;
  }

  reset(identifier: string): void {
    this.requests.delete(identifier);
  }
}

// Export a default rate limiter instance
export const defaultRateLimiter = new RateLimiter();

/**
 * Validate variable values to prevent injection attacks
 */
export function sanitizeVariableValue(value: any): any {
  if (typeof value === 'string') {
    // Remove potentially dangerous patterns
    return value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  return value;
}
