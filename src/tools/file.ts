import { readFileSync, writeFileSync, existsSync, statSync, readdirSync,
         mkdirSync, unlinkSync, rmSync, renameSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { loadConfig } from '../config/loader.js';
import type { ToolDefinition } from './types.js';

const PROTECTED = new Set([
  '.env', 'config.yml', 'config.yaml',
  'auth.json', 'package.json', 'tsconfig.json',
]);

const PROTECTED_READ = new Set([
  'approved-senders.json',
  'auth.json',
]);

/** Return true if the basename matches a read-protected pattern. */
function isProtectedRead(filePath: string): boolean {
  const name = basename(filePath);
  if (PROTECTED_READ.has(name)) return true;
  if (/pairing/i.test(name) || /approved/i.test(name)) return true;
  return false;
}

/**
 * Resolve an input path relative to basePath, enforcing that the resolved
 * path stays within basePath. Absolute paths (Windows drive letters or UNC)
 * are accepted but still verified to be inside basePath.
 *
 * Throws if the resolved path escapes basePath.
 */
function resolveFilePath(inputPath: string, basePath: string): string {
  let resolved: string;

  if (inputPath.includes(':') || inputPath.startsWith('\\\\')) {
    // Absolute Windows path or UNC — resolve as-is, then sandbox-check below.
    resolved = resolve(inputPath);
  } else {
    // Relative path — always anchor to basePath.
    resolved = resolve(join(basePath, inputPath));
  }

  // Enforce sandbox: resolved path must start with basePath.
  // Use trailing sep to prevent prefix collisions (e.g. /base vs /base-other).
  const normalizedBase = basePath.endsWith('/') || basePath.endsWith('\\')
    ? basePath
    : basePath + '\\';
  const normalizedBaseFwd = normalizedBase.replace(/\\/g, '/');
  const resolvedFwd = resolved.replace(/\\/g, '/');

  if (resolvedFwd !== basePath.replace(/\\/g, '/') &&
      !resolvedFwd.startsWith(normalizedBaseFwd)) {
    throw new Error(`Access denied: path is outside the allowed directory (${basePath})`);
  }

  return resolved;
}

/** Check if a resolved file path is protected. */
function isProtected(filePath: string): boolean {
  return PROTECTED.has(basename(filePath));
}

export const fileTool: ToolDefinition = {
  name: 'file',
  description: `Read, write, edit, list, delete, move, or create local files and directories on this machine.

Use this when: working with files on the local filesystem. Examples: reading source code, writing notes, editing config files, listing a directory.
Do NOT use this when: the file is in a GitHub repository — use the \`github\` tool instead.
Do NOT use this when: you want to write a file AND commit it to git in one step — use \`write_and_commit\` instead.

Actions:
- read: Read the full contents of a file
- write: Create or overwrite a file with new content
- edit: Find and replace text within an existing file (prefer this over write when changing one section)
- list: List files and directories at a given path
- delete: Delete a file or directory
- move: Move or rename a file or directory
- mkdir: Create a directory (including any missing parent directories)`,

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write', 'edit', 'list', 'delete', 'move', 'mkdir'],
        description: 'The file operation to perform'
      },
      path: {
        type: 'string',
        description: 'File or directory path. Absolute (e.g. "C:\\\\Users\\\\user\\\\notes.txt") or relative to workspace (e.g. "./src/index.ts")'
      },
      content: {
        type: 'string',
        description: 'File content for write action'
      },
      find: {
        type: 'string',
        description: 'Text to find (edit action only). Must be unique in the file.'
      },
      replace: {
        type: 'string',
        description: 'Replacement text (edit action only)'
      },
      all: {
        type: 'boolean',
        description: 'Replace all occurrences instead of just the first (edit action only, default: false)'
      },
      destination: {
        type: 'string',
        description: 'Destination path (move action only). Example: "./src/renamed.ts"'
      }
    },
    required: ['action']
  },

  async execute(input, context) {
    const action = input.action as string;
    const config = loadConfig();

    if (!config.tools.files.enabled) {
      return { success: false, error: 'File tools are disabled in configuration' };
    }

    const basePath = resolve(config.tools.files.basePath);

    // --- read ---
    if (action === 'read') {
      const inputPath = input.path as string;
      if (!inputPath) return { success: false, error: 'path is required for read' };
      let filePath: string;
      try {
        filePath = resolveFilePath(inputPath, basePath);
      } catch (e: any) {
        return { success: false, error: e.message };
      }
      // Block reading sensitive auth/config files.
      if (isProtectedRead(filePath) || (isProtected(filePath) && basename(filePath) === '.env')) {
        return { success: false, error: `Read blocked: ${basename(filePath)} is a protected file` };
      }
      try {
        if (!existsSync(filePath)) return { success: false, error: 'File does not exist' };
        const stats = statSync(filePath);
        if (stats.size > config.tools.files.maxFileSize) {
          return { success: false, error: `File too large (max ${config.tools.files.maxFileSize} bytes)` };
        }
        return { success: true, output: readFileSync(filePath, 'utf-8') };
      } catch (e: any) {
        return { success: false, error: `Failed to read file: ${e.message}` };
      }
    }

    // --- write ---
    if (action === 'write') {
      const inputPath = input.path as string;
      const content = input.content as string;
      if (!inputPath) return { success: false, error: 'path is required for write' };
      if (content === undefined) return { success: false, error: 'content is required for write' };
      let filePath: string;
      try {
        filePath = resolveFilePath(inputPath, basePath);
      } catch (e: any) {
        return { success: false, error: e.message };
      }
      if (isProtected(filePath)) {
        return { success: false, error: `Write blocked: ${basename(filePath)} is a protected file` };
      }
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, content, 'utf-8');
        return { success: true, output: `File written: ${input.path}` };
      } catch (e: any) {
        return { success: false, error: `Failed to write file: ${e.message}` };
      }
    }

    // --- edit ---
    if (action === 'edit') {
      const inputPath = input.path as string;
      const find = input.find as string;
      const replace = input.replace as string;
      const all = (input.all as boolean | undefined) ?? false;
      if (!inputPath) return { success: false, error: 'path is required for edit' };
      if (!find) return { success: false, error: 'find is required for edit' };
      if (replace === undefined) return { success: false, error: 'replace is required for edit' };
      let filePath: string;
      try {
        filePath = resolveFilePath(inputPath, basePath);
      } catch (e: any) {
        return { success: false, error: e.message };
      }
      if (isProtected(filePath)) {
        return { success: false, error: `Edit blocked: ${basename(filePath)} is a protected file` };
      }
      try {
        if (!existsSync(filePath)) return { success: false, error: `File does not exist: ${inputPath}` };
        let content = readFileSync(filePath, 'utf-8');
        const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const occurrences = (content.match(new RegExp(escaped, 'g')) || []).length;
        if (occurrences === 0) return { success: false, error: `Text not found in file: "${find}"` };
        // Use a replacer function to prevent $& $' $` $1 etc. being interpreted
        const replacer = () => replace;
        content = all
          ? content.replace(new RegExp(escaped, 'g'), replacer)
          : content.replace(find, replacer);
        writeFileSync(filePath, content, 'utf-8');
        return { success: true, output: `Replaced ${all ? occurrences : 1} occurrence(s) in ${inputPath}` };
      } catch (e: any) {
        return { success: false, error: `Failed to edit file: ${e.message}` };
      }
    }

    // --- list ---
    if (action === 'list') {
      const inputPath = input.path as string;
      let dirPath: string;
      if (!inputPath) {
        dirPath = basePath;
      } else {
        try {
          dirPath = resolveFilePath(inputPath, basePath);
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }
      try {
        if (!existsSync(dirPath)) return { success: false, error: 'Directory does not exist' };
        const files = readdirSync(dirPath, { withFileTypes: true });
        const fileList = files.map(f => f.isDirectory() ? `${f.name}/` : f.name).join('\n');
        return { success: true, output: fileList || '(empty directory)' };
      } catch (e: any) {
        return { success: false, error: `Failed to list directory: ${e.message}` };
      }
    }

    // --- delete ---
    if (action === 'delete') {
      const inputPath = input.path as string;
      if (!inputPath) return { success: false, error: 'path is required for delete' };
      let filePath: string;
      try {
        filePath = resolveFilePath(inputPath, basePath);
      } catch (e: any) {
        return { success: false, error: e.message };
      }
      if (isProtected(filePath)) {
        return { success: false, error: `Delete blocked: ${basename(filePath)} is a protected file` };
      }
      try {
        if (!existsSync(filePath)) return { success: false, error: `Path does not exist: ${inputPath}` };
        const stats = statSync(filePath);
        if (stats.isDirectory()) {
          rmSync(filePath, { recursive: true, force: true });
          return { success: true, output: `Deleted directory: ${inputPath}` };
        }
        unlinkSync(filePath);
        return { success: true, output: `Deleted file: ${inputPath}` };
      } catch (e: any) {
        return { success: false, error: `Failed to delete: ${e.message}` };
      }
    }

    // --- move ---
    if (action === 'move') {
      const from = input.path as string;
      const to = input.destination as string;
      if (!from) return { success: false, error: 'path is required for move' };
      if (!to) return { success: false, error: 'destination is required for move' };
      let fromPath: string;
      let toPath: string;
      try {
        fromPath = resolveFilePath(from, basePath);
        toPath = resolveFilePath(to, basePath);
      } catch (e: any) {
        return { success: false, error: e.message };
      }
      // Block moving protected files (source)
      if (isProtected(fromPath)) {
        return { success: false, error: `Move blocked: ${basename(fromPath)} is a protected file` };
      }
      // Block moving anything to a protected filename (destination)
      if (isProtected(toPath)) {
        return { success: false, error: `Move blocked: destination ${basename(toPath)} is a protected filename` };
      }
      try {
        if (!existsSync(fromPath)) return { success: false, error: `Source does not exist: ${from}` };
        if (existsSync(toPath)) return { success: false, error: `Destination already exists: ${to}` };
        const toDir = dirname(toPath);
        if (!existsSync(toDir)) mkdirSync(toDir, { recursive: true });
        renameSync(fromPath, toPath);
        return { success: true, output: `Moved: ${from} → ${to}` };
      } catch (e: any) {
        return { success: false, error: `Failed to move: ${e.message}` };
      }
    }

    // --- mkdir ---
    if (action === 'mkdir') {
      const inputPath = input.path as string;
      if (!inputPath) return { success: false, error: 'path is required for mkdir' };
      let dirPath: string;
      try {
        dirPath = resolveFilePath(inputPath, basePath);
      } catch (e: any) {
        return { success: false, error: e.message };
      }
      try {
        mkdirSync(dirPath, { recursive: true });
        return { success: true, output: `Created directory: ${inputPath}` };
      } catch (e: any) {
        return { success: false, error: `Failed to create directory: ${e.message}` };
      }
    }

    return { success: false, error: `Unknown action: ${action}` };
  }
};
