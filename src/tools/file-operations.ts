import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, renameSync, rmSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { loadConfig } from '../config/loader.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';

/**
 * Edit/modify file contents - find and replace text
 */
export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: 'Edit a file by finding and replacing text. Can make precise modifications to existing files.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit (can be absolute or relative)'
      },
      find: {
        type: 'string',
        description: 'Text to find in the file'
      },
      replace: {
        type: 'string',
        description: 'Text to replace it with'
      },
      all: {
        type: 'boolean',
        description: 'Replace all occurrences (default: false, replaces first only)'
      }
    },
    required: ['path', 'find', 'replace']
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { path: filePath, find, replace, all = false } = input;

    try {
      const resolvedPath = resolve(filePath);

      if (!existsSync(resolvedPath)) {
        return {
          success: false,
          error: `File does not exist: ${filePath}`
        };
      }

      let content = readFileSync(resolvedPath, 'utf-8');

      // Count occurrences
      const occurrences = (content.match(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

      if (occurrences === 0) {
        return {
          success: false,
          error: `Text not found in file: "${find}"`
        };
      }

      // Perform replacement
      if (all) {
        content = content.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
      } else {
        content = content.replace(find, replace);
      }

      writeFileSync(resolvedPath, content, 'utf-8');

      return {
        success: true,
        output: `Replaced ${all ? occurrences : 1} occurrence(s) in ${filePath}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

/**
 * Delete a file
 */
export const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: 'Delete a file from the filesystem',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to delete'
      }
    },
    required: ['path']
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { path: filePath } = input;

    try {
      const resolvedPath = resolve(filePath);

      if (!existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Path does not exist: ${filePath}`
        };
      }

      // Check if it's a directory
      const stats = statSync(resolvedPath);
      if (stats.isDirectory()) {
        rmSync(resolvedPath, { recursive: true, force: true });
        return {
          success: true,
          output: `Deleted directory: ${filePath}`
        };
      } else {
        unlinkSync(resolvedPath);
        return {
          success: true,
          output: `Deleted file: ${filePath}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

/**
 * Create a new directory
 */
export const createDirectoryTool: ToolDefinition = {
  name: 'create_directory',
  description: 'Create a new directory (folder). Creates parent directories if needed.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the directory to create'
      }
    },
    required: ['path']
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { path: dirPath } = input;

    try {
      const resolvedPath = resolve(dirPath);

      if (existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Directory already exists: ${dirPath}`
        };
      }

      mkdirSync(resolvedPath, { recursive: true });

      return {
        success: true,
        output: `Created directory: ${dirPath}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

/**
 * Move or rename a file/directory
 */
export const moveFileTool: ToolDefinition = {
  name: 'move_file',
  description: 'Move or rename a file or directory',
  inputSchema: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Current path to the file/directory'
      },
      to: {
        type: 'string',
        description: 'New path for the file/directory'
      }
    },
    required: ['from', 'to']
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { from, to } = input;

    try {
      const fromPath = resolve(from);
      const toPath = resolve(to);

      if (!existsSync(fromPath)) {
        return {
          success: false,
          error: `Source does not exist: ${from}`
        };
      }

      if (existsSync(toPath)) {
        return {
          success: false,
          error: `Destination already exists: ${to}`
        };
      }

      // Create destination directory if needed
      const toDir = dirname(toPath);
      if (!existsSync(toDir)) {
        mkdirSync(toDir, { recursive: true });
      }

      renameSync(fromPath, toPath);

      return {
        success: true,
        output: `Moved: ${from} → ${to}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to move file: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
