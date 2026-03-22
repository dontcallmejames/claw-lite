import type { ToolDefinition, ToolExecutionResult } from './types.js';
import { wrapExternalContent } from '../security/external-content.js';

const GITHUB_API = 'https://api.github.com';

function getToken(): string | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token === 'your-github-token-here') return null;
  return token;
}

/**
 * Build a safe GitHub API content path, preventing path traversal via
 * owner, repo, or file path segments.
 */
function buildContentPath(owner: string, repo: string, filePath: string): string {
  const safeOwner = encodeURIComponent(owner);
  const safeRepo = encodeURIComponent(repo);
  // filePath may contain forward slashes (it's a file path), so encode only
  // traversal-dangerous sequences: ".." and "." segments and leading slashes.
  const cleanPath = filePath
    .replace(/^\/+/, '')                      // strip leading slashes
    .split('/')
    .map(seg => (seg === '..' || seg === '.') ? encodeURIComponent(seg) : seg)
    .join('/');
  return `/repos/${safeOwner}/${safeRepo}/contents/${cleanPath}`;
}

async function ghRequest(path: string, method = 'GET', body?: any): Promise<any> {
  const token = getToken();
  if (!token) throw new Error('GITHUB_TOKEN not set in .env');

  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'claw-lite-assistant'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API ${res.status}: ${err}`);
  }

  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

export const githubTool: ToolDefinition = {
  name: 'github',
  description: `Read, write, and manage files and repositories on GitHub via the GitHub API.

Use this when: the file or repo is on GitHub (remote). Examples: reading a repo's source, writing a file to a branch, listing repo contents, searching code, creating a repo.
Do NOT use this when: the file is on the local filesystem — use the \`file\` tool instead.
Do NOT use this when: you want to write a local file and git commit in one step — use \`write_and_commit\` instead.

Actions:
- read_file: Read a file from a GitHub repo
- write_file: Create or update a file in a GitHub repo (requires owner, repo, path, content, message)
- delete_file: Delete a file from a GitHub repo
- list_files: List files/directories in a GitHub repo path
- create_repo: Create a new GitHub repository
- search_code: Search for code across GitHub (uses GitHub code search)
- repo_info: Get metadata about a repository (stars, forks, language, description, etc.)`,

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read_file', 'write_file', 'delete_file', 'list_files', 'create_repo', 'search_code', 'repo_info'],
        description: 'The GitHub operation to perform'
      },
      owner: { type: 'string', description: 'GitHub username or org. Example: "dontcallmejames"' },
      repo: { type: 'string', description: 'Repository name. Example: "claw-lite"' },
      path: { type: 'string', description: 'File or directory path within the repo. Example: "src/index.ts" or "" for root' },
      content: { type: 'string', description: 'File content to write (write_file action)' },
      message: { type: 'string', description: 'Commit message (write_file and delete_file actions)' },
      branch: { type: 'string', description: 'Branch name (defaults to repo default branch)' },
      name: { type: 'string', description: 'Repository name for create_repo action' },
      description: { type: 'string', description: 'Repository description for create_repo action' },
      private: { type: 'boolean', description: 'Create as private repo (create_repo action, default: false)' },
      auto_init: { type: 'boolean', description: 'Initialize with a README (create_repo action, default: true)' },
      query: { type: 'string', description: 'Search query (search_code action). Example: "function handleChat language:typescript"' },
      ref: { type: 'string', description: 'Branch, tag, or commit SHA (read_file and list_files actions, default: repo default branch)' },
    },
    required: ['action']
  },

  async execute(input): Promise<ToolExecutionResult> {
    const action = input.action as string;
    try {
      if (action === 'read_file') {
        const { owner, repo, path, ref } = input;
        const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
        const apiPath = buildContentPath(owner, repo, path);
        const data = await ghRequest(`${apiPath}${qs}`);
        if (data.type !== 'file') {
          return { success: false, error: `${path} is not a file (type: ${data.type})` };
        }
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return { success: true, output: wrapExternalContent(content, `github:${owner}/${repo}/${path}`) };
      }

      if (action === 'list_files') {
        const { owner, repo, path = '', ref } = input;
        const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
        const apiPath = buildContentPath(owner, repo, path);
        const data = await ghRequest(`${apiPath}${qs}`);
        if (!Array.isArray(data)) {
          return { success: false, error: 'Path is a file, not a directory' };
        }
        const lines = data.map((f: any) => `${f.type === 'dir' ? '[dir]' : '[file]'} ${f.name}`);
        return { success: true, output: lines.join('\n') };
      }

      if (action === 'write_file') {
        const { owner, repo, path, content, message, branch } = input;
        const apiPath = buildContentPath(owner, repo, path);
        let sha: string | undefined;
        try {
          const qs = branch ? `?ref=${encodeURIComponent(branch)}` : '';
          const existing = await ghRequest(`${apiPath}${qs}`);
          sha = existing.sha;
        } catch (e: any) {
          // Only treat 404 as "file doesn't exist yet". Any other error (auth
          // failure, rate-limit, network issue) must propagate so the caller
          // sees the real cause instead of a confusing 422 from the PUT.
          if (!e.message?.includes('404')) throw e;
        }
        const body: any = {
          message,
          content: Buffer.from(content, 'utf-8').toString('base64'),
        };
        if (sha) body.sha = sha;
        if (branch) body.branch = branch;
        const result = await ghRequest(apiPath, 'PUT', body);
        const url = result?.content?.html_url ?? `https://github.com/${owner}/${repo}/blob/${branch ?? 'main'}/${path}`;
        return { success: true, output: `${sha ? 'Updated' : 'Created'} ${path} — ${url}` };
      }

      if (action === 'delete_file') {
        const { owner, repo, path, message, branch } = input;
        const apiPath = buildContentPath(owner, repo, path);
        const qs = branch ? `?ref=${encodeURIComponent(branch)}` : '';
        const existing = await ghRequest(`${apiPath}${qs}`);
        const body: any = { message, sha: existing.sha };
        if (branch) body.branch = branch;
        await ghRequest(apiPath, 'DELETE', body);
        return { success: true, output: `Deleted ${path}` };
      }

      if (action === 'create_repo') {
        const { name, description = '', private: isPrivate = false, auto_init = true } = input;
        const data = await ghRequest('/user/repos', 'POST', {
          name, description, private: isPrivate, auto_init
        });
        return {
          success: true,
          output: `Created repo: ${data.full_name}\nURL: ${data.html_url}\nClone: ${data.clone_url}`
        };
      }

      if (action === 'search_code') {
        const { owner, repo, query } = input;
        const q = encodeURIComponent(`${query} repo:${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
        const data = await ghRequest(`/search/code?q=${q}&per_page=10`);
        if (!data.items?.length) {
          return { success: true, output: 'No results found.' };
        }
        const lines = data.items.map((item: any) =>
          `${item.path}\n   ${item.html_url}`
        );
        return { success: true, output: lines.join('\n\n') };
      }

      if (action === 'repo_info') {
        const { owner, repo } = input;
        const data = await ghRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
        return {
          success: true,
          output: [
            `Repo: ${data.full_name}`,
            `Description: ${data.description ?? 'none'}`,
            `Default branch: ${data.default_branch}`,
            `Language: ${data.language ?? 'unknown'}`,
            `Stars: ${data.stargazers_count}  Forks: ${data.forks_count}`,
            `URL: ${data.html_url}`
          ].join('\n')
        };
      }

      return { success: false, error: `Unknown action: ${action}` };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};
