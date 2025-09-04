/**
 * Template Processing Engine
 *
 * Handles Templater syntax processing and variable substitution
 * with support for complex template logic and context awareness.
 */

import { VaultConfig, TemplateContext, TemplateVariable } from './types.js';
import { basename } from 'path';

export class TemplateProcessor {
  constructor(private config: VaultConfig) {}

  /**
   * Process template with Templater syntax and variable substitution
   */
  processTemplate(
    content: string,
    variables: Record<string, any> = {},
    context: Partial<TemplateContext> = {},
    filePath?: string
  ): string {
    // Create full context
    const fullContext: TemplateContext = {
      variables: this.createVariableMap(variables),
      currentDate: new Date(),
      vaultPath: this.config.allowedDirectories[0] || '',
      ...context,
    };

    let processedContent = content;

    // 1. Process Templater functions first
    if (this.config.templaterLite) {
      processedContent = this.resolveTemplaterFunctions(
        processedContent,
        fullContext,
        filePath
      );
    }

    // 2. Handle variable substitution
    processedContent = this.substituteVariables(processedContent, variables);

    return processedContent;
  }

  /**
   * Simple variable substitution for {{variable}} syntax
   */
  private substituteVariables(
    content: string,
    variables: Record<string, any>
  ): string {
    return content.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const [name, defaultValue] = varName.split(':');
      const value = variables[name.trim()];
      return value !== undefined ? String(value) : defaultValue || match;
    });
  }

  /**
   * Create typed variable map from raw variables
   */
  private createVariableMap(
    variables: Record<string, any>
  ): Record<string, TemplateVariable> {
    const variableMap: Record<string, TemplateVariable> = {};

    for (const [name, value] of Object.entries(variables)) {
      variableMap[name] = {
        name,
        value,
        source: 'user',
      };
    }

    return variableMap;
  }

  /**
   * Resolve Templater function calls - Phase 1 implementation
   */
  private resolveTemplaterFunctions(
    content: string,
    context: TemplateContext,
    filePath?: string
  ): string {
    let processedContent = content;

    // 1. Handle tp.date.now() - current date/time
    processedContent = processedContent.replace(
      /tp\.date\.now\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g,
      (match, format1, format2) => {
        const format =
          format1 || format2 || this.config.defaultDateFormat || 'YYYY-MM-DD';
        return this.formatDate(context.currentDate, format);
      }
    );

    // 2. Handle tp.file.title - extract title from file path
    if (filePath) {
      const fileTitle = this.extractFileTitle(filePath);
      processedContent = processedContent.replace(
        /tp\.file\.title/g,
        fileTitle
      );
    }

    // 3. Handle tp.file.folder() - extract folder name
    if (filePath) {
      const folderName = this.extractFolderName(filePath);
      processedContent = processedContent.replace(
        /tp\.file\.folder\(\s*\)/g,
        folderName
      );
    }

    // 4. Handle tp.date.today() - current date without time
    processedContent = processedContent.replace(
      /tp\.date\.today\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g,
      (match, format1, format2) => {
        const format = format1 || format2 || 'YYYY-MM-DD';
        return this.formatDate(context.currentDate, format);
      }
    );

    // 5. Handle tp.date.tomorrow() - tomorrow's date
    processedContent = processedContent.replace(
      /tp\.date\.tomorrow\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g,
      (match, format1, format2) => {
        const format = format1 || format2 || 'YYYY-MM-DD';
        const tomorrow = new Date(context.currentDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return this.formatDate(tomorrow, format);
      }
    );

    return processedContent;
  }

  /**
   * Format date according to common patterns
   */
  private formatDate(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return format.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s/g, token => {
      switch (token) {
        case 'YYYY':
          return String(year);
        case 'YY':
          return String(year).slice(-2);
        case 'MM':
          return month;
        case 'M':
          return String(date.getMonth() + 1);
        case 'DD':
          return day;
        case 'D':
          return String(date.getDate());
        case 'HH':
          return hours;
        case 'H':
          return String(date.getHours());
        case 'mm':
          return minutes;
        case 'm':
          return String(date.getMinutes());
        case 'ss':
          return seconds;
        case 's':
          return String(date.getSeconds());
        default:
          return token;
      }
    });
  }

  /**
   * Extract file title from file path
   */
  private extractFileTitle(filePath: string): string {
    const fileName = basename(filePath);
    // Remove extension and return
    return fileName.replace(/\.[^/.]+$/, '');
  }

  /**
   * Extract folder name from file path
   */
  private extractFolderName(filePath: string): string {
    const parts = filePath.split('/');
    return parts.length > 1 ? parts[parts.length - 2] : '';
  }

  /**
   * Process conditional logic in templates (stub)
   */
  private processConditionals(
    content: string,
    _context: TemplateContext
  ): string {
    console.log('processConditionals: Implementation pending');

    // Implementation will handle:
    // - <% if (condition) { %>content<% } %>
    // - <% for (item of array) { %>content<% } %>
    // - Complex JavaScript expressions

    return content;
  }
}
