import type { ToolDefinition, ToolExecutionResult } from './types.js';
import fs from 'fs';
import path from 'path';

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
    }
  } catch { /* new file */ }

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
 * Use this whenever asked to create or update a file in a project.
 *
 * owner and repo are required — no defaults.
 * Default branch: main
 */
export const writeAndCommitTool: ToolDefinition = {
  name: 'write_and_commit',
  description: `Write a file to a GitHub repository AND optionally to local disk in a single step.
Use this when asked to create or update files in a project.
The 'owner' and 'repo' fields are required. Default branch: main.
The 'content' field is the full file content as a string.`,
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
        description: 'GitHub repo owner (username or org)'
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
    required: ['path', 'content', 'message', 'owner', 'repo']
  },

  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    const {
      path: filePath,
      content,
      message,
      owner,
      repo,
      branch = 'main',
      local_path,
    } = input;

    const results: string[] = [];

    // Write to local disk if requested
    if (local_path) {
      try {
        fs.mkdirSync(path.dirname(local_path), { recursive: true });
        fs.writeFileSync(local_path, content, 'utf-8');
        results.push(`Written locally: ${local_path}`);
      } catch (err: any) {
        results.push(`Local write failed: ${err.message}`);
      }
    }

    // Commit to GitHub
    try {
      const url = await ghPut(owner, repo, filePath, content, message, branch);
      results.push(`Committed to GitHub: ${url}`);
    } catch (err: any) {
      return { success: false, error: `GitHub commit failed: ${err.message}\n${results.join('\n')}` };
    }

    return { success: true, output: results.join('\n') };
  }
};
