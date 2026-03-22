import type { ToolDefinition, ToolExecutionResult } from './types.js';
import fs from 'fs';
import path from 'path';

const PROTECTED_NAMES = new Set([
  '.env', 'config.yml', 'config.yaml',
  'auth.json', 'package.json', 'tsconfig.json',
]);

/**
 * Return true if the resolved path is inside allowedRoot.
 */
function isInsideRoot(resolvedPath: string, allowedRoot: string): boolean {
  const normalRoot = allowedRoot.replace(/\\/g, '/');
  const normalPath = resolvedPath.replace(/\\/g, '/');
  const rootWithSep = normalRoot.endsWith('/') ? normalRoot : normalRoot + '/';
  return normalPath === normalRoot || normalPath.startsWith(rootWithSep);
}

const GITHUB_API = 'https://api.github.com';

function getToken(): string | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token === 'your-github-token-here') return null;
  return token;
}

async function ghPut(owner: string, repo: string, filePath: string, content: string, message: string, branch?: string): Promise<string> {
  const token = getToken();
  if (!token) throw new Error('GITHUB_TOKEN not set');

  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`;
  const qs = branch ? `?ref=${encodeURIComponent(branch)}` : '';

  // Fetch existing SHA if file exists
  let sha: string | undefined;
  try {
    const res = await fetch(url + qs, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      }
    });
    if (res.ok) {
      const data = await res.json() as any;
      sha = data.sha;
    } else if (res.status !== 404) {
      // Only 404 means the file doesn't exist yet — other errors (auth, rate-limit)
      // must propagate so the caller isn't misled about why the PUT fails.
      const errText = await res.text();
      throw new Error(`GitHub ${res.status}: ${errText}`);
    }
  } catch (e) { throw e; }

  const body: any = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
  };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub ${res.status}: ${err}`);
  }

  const result = await res.json() as any;
  return result?.content?.html_url ?? `https://github.com/${owner}/${repo}/blob/${branch ?? 'main'}/${filePath}`;
}

/**
 * Write a file to disk AND commit it to a GitHub repo in one step.
 */
export const writeAndCommitTool: ToolDefinition = {
  name: 'write_and_commit',
  description: `Write a file to the local filesystem and immediately commit it to the git repository with a commit message.

Use this when: you need to create or overwrite a file AND have it committed to git in one step — for example, saving a new skill file, updating a document, or persisting a configuration change with a record.
Do NOT use this when: you just want to write a file without committing — use the \`file\` tool's write action instead. Do NOT use this when: the file is in a GitHub remote repo — use the \`github\` tool.`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path within the repo, e.g. "src/index.js"'
      },
      content: {
        type: 'string',
        description: 'Full file content as a string'
      },
      message: {
        type: 'string',
        description: 'Commit message, e.g. "Add index.js"'
      },
      owner: {
        type: 'string',
        description: 'GitHub repo owner (default: dontcallmejames)'
      },
      repo: {
        type: 'string',
        description: 'GitHub repo name'
      },
      branch: {
        type: 'string',
        description: 'Branch to commit to (default: main)'
      },
      local_path: {
        type: 'string',
        description: 'Optional: also write to this absolute local path'
      }
    },
    required: ['path', 'content', 'message']
  },

  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    const {
      path: filePath,
      content,
      message,
      owner = 'dontcallmejames',
      repo,
      branch = 'main',
      local_path,
    } = input;

    if (!repo) {
      return { success: false, error: 'repo is required' };
    }

    const results: string[] = [];

    // Commit to GitHub FIRST so a GitHub failure doesn't leave the local file
    // modified without a corresponding remote commit.
    try {
      const url = await ghPut(owner, repo, filePath, content, message, branch);
      results.push(`Committed to GitHub: ${url}`);
    } catch (err: any) {
      return { success: false, error: `GitHub commit failed: ${err.message}` };
    }

    // Write to local disk only after the GitHub commit succeeded
    if (local_path) {
      try {
        const resolvedLocal = path.resolve(local_path);
        const allowedRoot = process.cwd();
        // Sandbox: local_path must be within process.cwd()
        if (!isInsideRoot(resolvedLocal, allowedRoot)) {
          return { success: false, error: `local_path is outside the allowed directory (${allowedRoot})` };
        }
        // Block protected filenames
        if (PROTECTED_NAMES.has(path.basename(resolvedLocal))) {
          return { success: false, error: `Write blocked: ${path.basename(resolvedLocal)} is a protected file` };
        }
        fs.mkdirSync(path.dirname(resolvedLocal), { recursive: true });
        fs.writeFileSync(resolvedLocal, content, 'utf-8');
        results.push(`Written locally: ${resolvedLocal}`);
      } catch (err: any) {
        results.push(`Local write failed: ${err.message}`);
      }
    }

    return { success: true, output: results.join('\n') };
  }
};
