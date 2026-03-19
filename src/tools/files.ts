import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { loadConfig } from '../config/loader.js';
import type { ToolDefinition } from './types.js';

// Protected files — never allow writes regardless of path
const PROTECTED = new Set([
  '.env', 'config.yml', 'config.yaml',
  'auth.json', 'package.json', 'tsconfig.json',
]);

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file. Use this when the user asks about file contents, configuration settings, source code, or wants to see what\'s in a file. IMPORTANT: Always use this tool instead of guessing what a file contains. Accepts absolute paths (e.g. C:\\Users\\you\\...) or paths relative to workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read. Can be absolute (e.g. C:\\Users\\you\\file.txt) or relative to workspace.'
      }
    },
    required: ['path']
  },
  async execute(input) {
    const config = loadConfig();

    if (!config.tools.files.enabled) {
      return { success: false, error: 'File tools are disabled in configuration' };
    }

    const basePath = resolve(config.tools.files.basePath);
    const inputPath = input.path as string;
    const normalizedPath = inputPath.replace(/^\.[\\/]/, '');

    let filePath: string;

    if (inputPath.includes(':') || inputPath.startsWith('\\\\')) {
      filePath = resolve(inputPath);
    } else if (['config.yml', 'package.json', 'tsconfig.json', '.env'].includes(normalizedPath)) {
      const rootPath = resolve(process.cwd(), normalizedPath);
      filePath = existsSync(rootPath) ? rootPath : resolve(join(basePath, normalizedPath));
    } else {
      filePath = resolve(join(basePath, inputPath));
    }

    // Enforce workspace restriction for relative paths to non-common files
    const isCommonFile = ['config.yml', 'package.json', 'tsconfig.json', '.env'].includes(normalizedPath);
    if (!inputPath.includes(':') && !inputPath.startsWith('\\\\') &&
        !isCommonFile && !filePath.startsWith(basePath)) {
      return { success: false, error: 'Access denied: file path outside of workspace' };
    }

    try {
      if (!existsSync(filePath)) {
        return { success: false, error: 'File does not exist' };
      }

      const stats = statSync(filePath);
      if (stats.size > config.tools.files.maxFileSize) {
        return { success: false, error: `File too large (max ${config.tools.files.maxFileSize} bytes)` };
      }

      return { success: true, output: readFileSync(filePath, 'utf-8') };
    } catch (error: any) {
      return { success: false, error: `Failed to read file: ${error.message}` };
    }
  }
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write content to a file. Accepts absolute paths (e.g. C:\\Users\\you\\...) or paths relative to workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write. Can be absolute (e.g. C:\\Users\\you\\file.txt) or relative to workspace.'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      }
    },
    required: ['path', 'content']
  },
  async execute(input, context) {
    const config = loadConfig();

    if (!config.tools.files.enabled) {
      return { success: false, error: 'File tools are disabled in configuration' };
    }

    if (config.security.requireApproval.fileWrite && context.requireApproval) {
      return { success: false, error: 'File write requires user approval (not yet implemented)' };
    }

    const basePath = resolve(config.tools.files.basePath);
    const inputPath = input.path as string;

    const filePath = (inputPath.includes(':') || inputPath.startsWith('\\\\'))
      ? resolve(inputPath)
      : resolve(join(basePath, inputPath));

    if (PROTECTED.has(basename(filePath))) {
      return {
        success: false,
        error: `Write blocked: ${basename(filePath)} is a protected file and cannot be modified by tools.`
      };
    }

    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, input.content as string, 'utf-8');
      return { success: true, output: `File written successfully: ${input.path}` };
    } catch (error: any) {
      return { success: false, error: `Failed to write file: ${error.message}` };
    }
  }
};

export const listFilesTool: ToolDefinition = {
  name: 'list_files',
  description: 'List files in a directory. Accepts absolute paths (e.g. C:\\Users\\you\\...) or paths relative to workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the directory. Can be absolute (e.g. C:\\Users\\you\\Documents) or relative to workspace. Defaults to workspace root.'
      }
    }
  },
  async execute(input) {
    const config = loadConfig();

    if (!config.tools.files.enabled) {
      return { success: false, error: 'File tools are disabled in configuration' };
    }

    const basePath = resolve(config.tools.files.basePath);
    const inputPath = input.path as string;

    const dirPath = inputPath && (inputPath.includes(':') || inputPath.startsWith('\\\\'))
      ? resolve(inputPath)
      : (inputPath ? resolve(join(basePath, inputPath)) : basePath);

    if (inputPath && !inputPath.includes(':') && !inputPath.startsWith('\\\\') && !dirPath.startsWith(basePath)) {
      return { success: false, error: 'Access denied: directory path outside of workspace' };
    }

    try {
      if (!existsSync(dirPath)) {
        return { success: false, error: 'Directory does not exist' };
      }

      const files = readdirSync(dirPath, { withFileTypes: true });
      const fileList = files.map(f => f.isDirectory() ? `${f.name}/` : f.name).join('\n');
      return { success: true, output: fileList || '(empty directory)' };
    } catch (error: any) {
      return { success: false, error: `Failed to list directory: ${error.message}` };
    }
  }
};
