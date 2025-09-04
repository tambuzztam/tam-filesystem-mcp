/**
 * Type declarations for @modelcontextprotocol/server-filesystem
 * Since the package doesn't include TypeScript declarations
 */

declare module '@modelcontextprotocol/server-filesystem/dist/lib.js' {
  export function setAllowedDirectories(directories: string[]): void;
  export function getAllowedDirectories(): string[];
  export function validatePath(path: string): Promise<string>;
  export function formatSize(bytes: number): string;
  export function readFileContent(
    filePath: string,
    encoding?: string
  ): Promise<string>;
  export function writeFileContent(
    filePath: string,
    content: string
  ): Promise<void>;
  export function getFileStats(filePath: string): Promise<{
    size: number;
    created: Date;
    modified: Date;
    accessed: Date;
    isDirectory: boolean;
    isFile: boolean;
    permissions: string;
  }>;
  export function applyFileEdits(
    filePath: string,
    edits: Array<{ oldText: string; newText: string }>,
    dryRun?: boolean
  ): Promise<string>;
}
