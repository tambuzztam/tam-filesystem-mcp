/**
 * Obsidian-specific utilities
 *
 * Handles Obsidian vault conventions including:
 * - Frontmatter parsing with variable extraction
 * - Variable specification parsing and validation
 * - Content normalization and processing
 * - Wikilink resolution
 * - Tag extraction and alias management
 */

import matter from 'gray-matter';
import { VaultConfig, ObsidianFile, VariableSpec } from './types.js';

export class ObsidianUtils {
  constructor(private config: VaultConfig) {}

  /**
   * Parse an Obsidian markdown file with enhanced frontmatter processing
   */
  parseObsidianFile(content: string): ObsidianFile {
    const { data: frontmatter, content: body } = matter(content);

    // Normalize aliases to always be an array
    const aliases = this.normalizeAliases(frontmatter.aliases);

    // Normalize tags to always be an array
    const tags = this.normalizeTags(frontmatter.tags);

    return {
      frontmatter,
      content: body.trim(), // Normalize whitespace
      aliases,
      tags,
    };
  }

  /**
   * Extract variable specifications from frontmatter
   * Looks for 'prompt-vars' field that defines required/optional variables
   */
  extractVariableSpecs(frontmatter: Record<string, any>): VariableSpec[] {
    const promptVars =
      frontmatter['prompt-vars'] || frontmatter.variables || frontmatter.vars;

    if (!promptVars) {
      return [];
    }

    // Handle different formats:
    // 1. Array of strings: ["name", "age"]
    // 2. Array of objects: [{name: "client", type: "string", required: true}]
    // 3. Object mapping: {client: "string", age: {type: "number", default: 30}}

    if (Array.isArray(promptVars)) {
      return promptVars.map(spec => this.parseVariableSpec(spec));
    }

    if (typeof promptVars === 'object') {
      return Object.entries(promptVars).map(([name, spec]) =>
        this.parseVariableSpec(spec, name)
      );
    }

    return [];
  }

  /**
   * Parse a single variable specification into standardized format
   */
  private parseVariableSpec(spec: any, name?: string): VariableSpec {
    // Handle string format: "variableName" or just the name if passed separately
    if (typeof spec === 'string') {
      return {
        name: name || spec,
        type: 'string',
        required: true,
      };
    }

    // Handle object format: {type: "string", required: false, default: "value"}
    if (typeof spec === 'object' && spec !== null) {
      return {
        name: name || spec.name || 'unknown',
        type: spec.type || 'string',
        required: spec.required !== false, // Default to required unless explicitly false
        default: spec.default,
        options: spec.options,
        description: spec.description,
      };
    }

    // Fallback
    return {
      name: name || String(spec),
      type: 'string',
      required: true,
    };
  }

  /**
   * Find variables referenced in content using {{variable}} syntax
   */
  extractContentVariables(content: string): string[] {
    const matches = content.match(/\{\{([^}]+)\}\}/g) || [];
    return matches
      .map(match => {
        const varName = match.slice(2, -2); // Remove {{ }}
        const [name] = varName.split(':'); // Handle {{var:default}} format
        return name.trim();
      })
      .filter((name, index, array) => array.indexOf(name) === index); // Remove duplicates
  }

  /**
   * Validate that provided variables match the specifications
   */
  validateVariables(
    specs: VariableSpec[],
    provided: Record<string, any>
  ): { isValid: boolean; missing: VariableSpec[]; errors: string[] } {
    const missing: VariableSpec[] = [];
    const errors: string[] = [];

    for (const spec of specs) {
      const value = provided[spec.name];

      // Check if required variable is missing
      if (
        spec.required &&
        (value === undefined || value === null || value === '')
      ) {
        missing.push(spec);
        continue;
      }

      // Skip validation if variable is not provided and not required
      if (value === undefined && !spec.required) {
        continue;
      }

      // Type validation
      const typeError = this.validateVariableType(spec, value);
      if (typeError) {
        errors.push(`Variable '${spec.name}': ${typeError}`);
      }
    }

    return {
      isValid: missing.length === 0 && errors.length === 0,
      missing,
      errors,
    };
  }

  /**
   * Validate a single variable against its type specification
   */
  private validateVariableType(spec: VariableSpec, value: any): string | null {
    switch (spec.type) {
      case 'string':
        if (typeof value !== 'string') {
          return `expected string, got ${typeof value}`;
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return `expected number, got ${typeof value}`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `expected boolean, got ${typeof value}`;
        }
        break;

      case 'date': {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return `expected valid date, got invalid date: ${value}`;
        }
        break;
      }
    }

    // Check options if specified
    if (spec.options && !spec.options.includes(value)) {
      return `expected one of [${spec.options.join(', ')}], got ${value}`;
    }

    return null;
  }

  /**
   * Normalize aliases field to always be an array
   */
  private normalizeAliases(aliases: any): string[] {
    if (!aliases) return [];
    if (typeof aliases === 'string') return [aliases];
    if (Array.isArray(aliases))
      return aliases.filter(a => typeof a === 'string');
    return [];
  }

  /**
   * Normalize tags field to always be an array
   */
  private normalizeTags(tags: any): string[] {
    if (!tags) return [];
    if (typeof tags === 'string') {
      // Handle comma-separated or space-separated tags
      return tags.split(/[,\s]+/).filter(tag => tag.trim().length > 0);
    }
    if (Array.isArray(tags)) return tags.filter(tag => typeof tag === 'string');
    return [];
  }

  /**
   * Resolve wikilinks in content
   * Pattern: [[target|alias]] or [[target]]
   */
  async resolveWikilinks(content: string): Promise<string> {
    // Implementation stub
    console.log('resolveWikilinks: Implementation pending');
    return content;
  }

  /**
   * Extract title from markdown content
   */
  extractTitle(content: string): string {
    // Look for # heading or use filename
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : 'Untitled';
  }

  /**
   * Validate wikilink target exists
   */
  async resolveWikilinkTarget(target: string): Promise<string | null> {
    // Implementation stub
    console.log(`resolveWikilinkTarget: ${target} - Implementation pending`);
    return null;
  }
}
