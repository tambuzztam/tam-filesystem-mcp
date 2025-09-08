/**
 * Directory Change Detection System
 *
 * Detects when a directory has changed enough that its README might be out of date.
 * Provides intelligent suggestions to users about when to regenerate READMEs.
 */

import { readdir } from 'fs/promises';
import { basename } from 'path';
import { validateAndNormalizePath } from './security.js';

export interface DirectorySnapshot {
  path: string;
  snapshotTime: Date;
  subdirectories: string[];
  fileCount: number;
  fileTypes: string[];
  largestFiles: string[];
  readmeGenerated?: Date;
}

export interface ChangeDetectionResult {
  hasSignificantChanges: boolean;
  changes: DetectedChange[];
  recommendation: 'none' | 'suggest' | 'recommend' | 'urgent';
  readmeAge?: number; // days
}

export interface DetectedChange {
  type:
    | 'subdirectory_added'
    | 'subdirectory_removed'
    | 'file_count_change'
    | 'new_file_types'
    | 'key_files_changed'
    | 'readme_very_old';
  description: string;
  severity: 'low' | 'medium' | 'high';
  details?: Record<string, unknown>;
}

/**
 * Directory Change Detection Service
 */
export class DirectoryChangeDetectionService {
  private snapshots = new Map<string, DirectorySnapshot>();

  constructor(private allowedDirectories: string[]) {}

  /**
   * Create a snapshot of the current directory state
   */
  async createDirectorySnapshot(
    directoryPath: string,
    readmeGenerated?: Date
  ): Promise<DirectorySnapshot> {
    const validPath = validateAndNormalizePath(
      directoryPath,
      this.allowedDirectories
    );

    const entries = await readdir(validPath, { withFileTypes: true });

    // Extract subdirectories
    const subdirectories = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .sort();

    // Count files and analyze types
    const files = entries.filter(entry => entry.isFile());
    const fileTypes = [
      ...new Set(
        files.map(file => {
          const ext = file.name.includes('.')
            ? file.name.split('.').pop()?.toLowerCase()
            : 'no-ext';
          return ext || 'no-ext';
        })
      ),
    ].sort();

    // Find largest files (by name length as a proxy for importance)
    const largestFiles = files
      .map(file => file.name)
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);

    const snapshot: DirectorySnapshot = {
      path: validPath,
      snapshotTime: new Date(),
      subdirectories,
      fileCount: files.length,
      fileTypes,
      largestFiles,
      readmeGenerated,
    };

    this.snapshots.set(validPath, snapshot);
    return snapshot;
  }

  /**
   * Check if a directory has changed significantly since last snapshot
   */
  async detectChanges(
    directoryPath: string,
    currentReadmeAge?: Date
  ): Promise<ChangeDetectionResult> {
    const validPath = validateAndNormalizePath(
      directoryPath,
      this.allowedDirectories
    );
    const currentSnapshot = await this.createDirectorySnapshot(
      validPath,
      currentReadmeAge
    );
    const previousSnapshot = this.snapshots.get(validPath);

    if (!previousSnapshot) {
      // First time seeing this directory - check if README is very old or missing
      const changes: DetectedChange[] = [];

      if (currentReadmeAge) {
        const ageDays =
          (Date.now() - currentReadmeAge.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 30) {
          changes.push({
            type: 'readme_very_old',
            description: `README is ${Math.round(ageDays)} days old`,
            severity: ageDays > 90 ? 'high' : 'medium',
            details: { ageDays },
          });
        }

        return {
          hasSignificantChanges: changes.length > 0,
          changes,
          recommendation:
            ageDays > 90 ? 'recommend' : ageDays > 30 ? 'suggest' : 'none',
          readmeAge: ageDays,
        };
      }

      return {
        hasSignificantChanges: false,
        changes: [],
        recommendation: 'none',
      };
    }

    // Compare snapshots to detect changes
    const changes: DetectedChange[] = [];

    // Check for added/removed subdirectories
    const addedSubdirs = currentSnapshot.subdirectories.filter(
      dir => !previousSnapshot.subdirectories.includes(dir)
    );
    const removedSubdirs = previousSnapshot.subdirectories.filter(
      dir => !currentSnapshot.subdirectories.includes(dir)
    );

    addedSubdirs.forEach(dir => {
      changes.push({
        type: 'subdirectory_added',
        description: `New subdirectory: ${dir}/`,
        severity: 'medium',
        details: { subdirectory: dir },
      });
    });

    removedSubdirs.forEach(dir => {
      changes.push({
        type: 'subdirectory_removed',
        description: `Removed subdirectory: ${dir}/`,
        severity: 'high',
        details: { subdirectory: dir },
      });
    });

    // Check for significant file count changes
    const fileCountChange =
      currentSnapshot.fileCount - previousSnapshot.fileCount;
    const fileCountChangePercent =
      previousSnapshot.fileCount > 0
        ? Math.abs(fileCountChange) / previousSnapshot.fileCount
        : 0;

    if (fileCountChangePercent > 0.3 || Math.abs(fileCountChange) > 10) {
      changes.push({
        type: 'file_count_change',
        description: `File count changed by ${fileCountChange > 0 ? '+' : ''}${fileCountChange} (${Math.round(fileCountChangePercent * 100)}%)`,
        severity: fileCountChangePercent > 0.5 ? 'high' : 'medium',
        details: {
          oldCount: previousSnapshot.fileCount,
          newCount: currentSnapshot.fileCount,
          change: fileCountChange,
        },
      });
    }

    // Check for new file types
    const newFileTypes = currentSnapshot.fileTypes.filter(
      type => !previousSnapshot.fileTypes.includes(type)
    );

    if (newFileTypes.length > 0) {
      changes.push({
        type: 'new_file_types',
        description: `New file types: ${newFileTypes.join(', ')}`,
        severity: 'low',
        details: { newTypes: newFileTypes },
      });
    }

    // Check if key files have changed significantly
    const keyFileChanges = this.detectKeyFileChanges(
      previousSnapshot,
      currentSnapshot
    );
    if (keyFileChanges) {
      changes.push(keyFileChanges);
    }

    // Check README age if provided
    if (currentReadmeAge) {
      const ageDays =
        (Date.now() - currentReadmeAge.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 30) {
        changes.push({
          type: 'readme_very_old',
          description: `README is ${Math.round(ageDays)} days old`,
          severity: ageDays > 90 ? 'high' : 'medium',
          details: { ageDays },
        });
      }
    }

    // Determine recommendation based on changes
    const recommendation = this.calculateRecommendation(changes);

    return {
      hasSignificantChanges: changes.length > 0,
      changes,
      recommendation,
      readmeAge: currentReadmeAge
        ? (Date.now() - currentReadmeAge.getTime()) / (1000 * 60 * 60 * 24)
        : undefined,
    };
  }

  /**
   * Generate a human-readable change summary
   */
  generateChangesSummary(result: ChangeDetectionResult): string {
    if (!result.hasSignificantChanges) {
      return '📋 Directory appears up to date - no significant changes detected.';
    }

    const parts: string[] = [];

    // Group changes by severity
    const highSeverity = result.changes.filter(c => c.severity === 'high');
    const mediumSeverity = result.changes.filter(c => c.severity === 'medium');
    const lowSeverity = result.changes.filter(c => c.severity === 'low');

    if (highSeverity.length > 0) {
      parts.push('🚨 **Significant changes detected:**');
      highSeverity.forEach(change => {
        parts.push(`  • ${change.description}`);
      });
    }

    if (mediumSeverity.length > 0) {
      parts.push(
        highSeverity.length > 0
          ? '\n⚠️ **Additional changes:**'
          : '⚠️ **Changes detected:**'
      );
      mediumSeverity.forEach(change => {
        parts.push(`  • ${change.description}`);
      });
    }

    if (
      lowSeverity.length > 0 &&
      (highSeverity.length > 0 || mediumSeverity.length > 0)
    ) {
      parts.push('\nℹ️ **Minor changes:**');
      lowSeverity.forEach(change => {
        parts.push(`  • ${change.description}`);
      });
    }

    // Add recommendation
    const recommendations = {
      suggest:
        '💡 **Suggestion:** Consider refreshing the README to reflect these changes.',
      recommend:
        '📝 **Recommendation:** The README should be updated to stay current.',
      urgent:
        '🔥 **Action Needed:** The README is likely out of date and should be regenerated.',
    };

    if (result.recommendation !== 'none') {
      parts.push(`\n${recommendations[result.recommendation]}`);
    }

    return parts.join('\n');
  }

  /**
   * Get a user-friendly prompt for README regeneration
   */
  getRefreshPrompt(
    result: ChangeDetectionResult,
    directoryPath: string
  ): string {
    if (result.recommendation === 'none') {
      return '';
    }

    const dirName = basename(directoryPath);

    switch (result.recommendation) {
      case 'suggest':
        return `The README in '${dirName}' might benefit from a refresh. Would you like me to regenerate it with current directory information?`;

      case 'recommend':
        return `The README in '${dirName}' appears to be out of date based on directory changes. Should I generate a fresh README that reflects the current state?`;

      case 'urgent':
        return `The README in '${dirName}' is significantly out of date. I strongly recommend regenerating it. Shall I create an updated README now?`;

      default:
        return '';
    }
  }

  /**
   * Clear snapshots (for testing or memory management)
   */
  clearSnapshots(directoryPath?: string): void {
    if (directoryPath) {
      const validPath = validateAndNormalizePath(
        directoryPath,
        this.allowedDirectories
      );
      this.snapshots.delete(validPath);
    } else {
      this.snapshots.clear();
    }
  }

  /**
   * Get snapshot statistics
   */
  getSnapshotStats(): {
    count: number;
    paths: string[];
    oldestSnapshot?: Date;
  } {
    const entries = Array.from(this.snapshots.values());

    return {
      count: entries.length,
      paths: entries.map(s => s.path),
      oldestSnapshot:
        entries.length > 0
          ? new Date(Math.min(...entries.map(s => s.snapshotTime.getTime())))
          : undefined,
    };
  }

  /**
   * Detect changes in key files
   */
  private detectKeyFileChanges(
    previous: DirectorySnapshot,
    current: DirectorySnapshot
  ): DetectedChange | null {
    // Simple heuristic: if the top files changed significantly, it might indicate restructuring
    const previousTop3 = previous.largestFiles.slice(0, 3);
    const currentTop3 = current.largestFiles.slice(0, 3);

    const commonFiles = previousTop3.filter(file => currentTop3.includes(file));

    if (commonFiles.length < 2 && previousTop3.length >= 2) {
      return {
        type: 'key_files_changed',
        description: 'Key files in directory have changed significantly',
        severity: 'medium',
        details: {
          previousTop: previousTop3,
          currentTop: currentTop3,
          commonCount: commonFiles.length,
        },
      };
    }

    return null;
  }

  /**
   * Calculate recommendation level based on detected changes
   */
  private calculateRecommendation(
    changes: DetectedChange[]
  ): 'none' | 'suggest' | 'recommend' | 'urgent' {
    if (changes.length === 0) return 'none';

    const hasHighSeverity = changes.some(c => c.severity === 'high');
    const mediumCount = changes.filter(c => c.severity === 'medium').length;
    const hasStructuralChanges = changes.some(
      c => c.type === 'subdirectory_added' || c.type === 'subdirectory_removed'
    );
    const hasVeryOldReadme = changes.some(
      c => c.type === 'readme_very_old' && (c.details as any)?.ageDays > 90
    );

    if (hasHighSeverity || hasVeryOldReadme) {
      return 'urgent';
    }

    if (hasStructuralChanges || mediumCount >= 2) {
      return 'recommend';
    }

    if (mediumCount >= 1 || changes.length >= 3) {
      return 'suggest';
    }

    return 'none';
  }
}
