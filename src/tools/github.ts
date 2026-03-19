import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';

const GITHUB_API = 'https://api.github.com';

function getToken(): string | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token === 'your-github-token-here') return null;
  return token;
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
      'User-Agent': 'ClawLite'
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

// ── Read file from repo ──────────────────────────────────────────────────────
export const githubReadFileTool: ToolDefinition = {
  name: 'github_read_file',
  description: 'Read a file from a GitHub repository.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner (username or org)' },
      repo:  { type: 'string', description: 'Repository name' },
      path:  { type: 'string', description: 'File path within the repo, e.g. src/index.js' },
      ref:   { type: 'string', description: 'Branch, tag, or commit SHA (default: repo default branch)' }
    },
    required: ['owner', 'repo', 'path']
  },
  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const { owner, repo, path, ref } = input;
      const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const data = await ghRequest(`/repos/${owner}/${repo}/contents/${path}${qs}`);
      if (data.type !== 'file') {
        return { success: false, error: `${path} is not a file (type: ${data.type})` };
      }
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return { success: true, output: content };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};

// ── List files/directories in repo ──────────────────────────────────────────
export const githubListFilesTool: ToolDefinition = {
  name: 'github_list_files',
  description: 'List files and directories in a GitHub repository path.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo:  { type: 'string', description: 'Repository name' },
      path:  { type: 'string', description: 'Directory path (default: root)' },
      ref:   { type: 'string', description: 'Branch, tag, or commit SHA' }
    },
    required: ['owner', 'repo']
  },
  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const { owner, repo, path = '', ref } = input;
      const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const data = await ghRequest(`/repos/${owner}/${repo}/contents/${path}${qs}`);
      if (!Array.isArray(data)) {
        return { success: false, error: 'Path is a file, not a directory' };
      }
      const lines = data.map((f: any) => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`);
      return { success: true, output: lines.join('\n') };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};

// ── Write/create/update file in repo ────────────────────────────────────────
export const githubWriteFileTool: ToolDefinition = {
  name: 'github_write_file',
  description: 'Create or update a file in a GitHub repository. Commits directly to the specified branch.',
  inputSchema: {
    type: 'object',
    properties: {
      owner:   { type: 'string', description: 'Repository owner' },
      repo:    { type: 'string', description: 'Repository name' },
      path:    { type: 'string', description: 'File path within the repo' },
      content: { type: 'string', description: 'File content (plain text)' },
      message: { type: 'string', description: 'Commit message' },
      branch:  { type: 'string', description: 'Branch to commit to (default: repo default branch)' }
    },
    required: ['owner', 'repo', 'path', 'content', 'message']
  },
  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const { owner, repo, path, content, message, branch } = input;

      // Check if file already exists (need its SHA to update)
      let sha: string | undefined;
      try {
        const qs = branch ? `?ref=${encodeURIComponent(branch)}` : '';
        const existing = await ghRequest(`/repos/${owner}/${repo}/contents/${path}${qs}`);
        sha = existing.sha;
      } catch {
        // File doesn't exist yet — that's fine
      }

      const body: any = {
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
      };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;

      const result = await ghRequest(`/repos/${owner}/${repo}/contents/${path}`, 'PUT', body);
      const url = result?.content?.html_url ?? `https://github.com/${owner}/${repo}/blob/${branch ?? 'main'}/${path}`;
      return {
        success: true,
        output: `${sha ? 'Updated' : 'Created'} ${path} — ${url}`
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};

// ── Delete file from repo ────────────────────────────────────────────────────
export const githubDeleteFileTool: ToolDefinition = {
  name: 'github_delete_file',
  description: 'Delete a file from a GitHub repository.',
  inputSchema: {
    type: 'object',
    properties: {
      owner:   { type: 'string', description: 'Repository owner' },
      repo:    { type: 'string', description: 'Repository name' },
      path:    { type: 'string', description: 'File path to delete' },
      message: { type: 'string', description: 'Commit message' },
      branch:  { type: 'string', description: 'Branch (default: repo default branch)' }
    },
    required: ['owner', 'repo', 'path', 'message']
  },
  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const { owner, repo, path, message, branch } = input;
      const qs = branch ? `?ref=${encodeURIComponent(branch)}` : '';
      const existing = await ghRequest(`/repos/${owner}/${repo}/contents/${path}${qs}`);
      const body: any = { message, sha: existing.sha };
      if (branch) body.branch = branch;
      await ghRequest(`/repos/${owner}/${repo}/contents/${path}`, 'DELETE', body);
      return { success: true, output: `Deleted ${path}` };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};

// ── Create repository ────────────────────────────────────────────────────────
export const githubCreateRepoTool: ToolDefinition = {
  name: 'github_create_repo',
  description: 'Create a new GitHub repository under the authenticated user.',
  inputSchema: {
    type: 'object',
    properties: {
      name:        { type: 'string', description: 'Repository name' },
      description: { type: 'string', description: 'Short description' },
      private:     { type: 'boolean', description: 'Make it private (default: false)' },
      auto_init:   { type: 'boolean', description: 'Initialize with a README (default: true)' }
    },
    required: ['name']
  },
  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const { name, description = '', private: isPrivate = false, auto_init = true } = input;
      const data = await ghRequest('/user/repos', 'POST', {
        name, description, private: isPrivate, auto_init
      });
      return {
        success: true,
        output: `Created repo: ${data.full_name}\nURL: ${data.html_url}\nClone: ${data.clone_url}`
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};

// ── Search code in a repo ────────────────────────────────────────────────────
export const githubSearchCodeTool: ToolDefinition = {
  name: 'github_search_code',
  description: 'Search for code within a specific GitHub repository.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo:  { type: 'string', description: 'Repository name' },
      query: { type: 'string', description: 'Search query' }
    },
    required: ['owner', 'repo', 'query']
  },
  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const { owner, repo, query } = input;
      const q = encodeURIComponent(`${query} repo:${owner}/${repo}`);
      const data = await ghRequest(`/search/code?q=${q}&per_page=10`);
      if (!data.items?.length) {
        return { success: true, output: 'No results found.' };
      }
      const lines = data.items.map((item: any) =>
        `📄 ${item.path}\n   ${item.html_url}`
      );
      return { success: true, output: lines.join('\n\n') };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};

// ── Get repo info ────────────────────────────────────────────────────────────
export const githubRepoInfoTool: ToolDefinition = {
  name: 'github_repo_info',
  description: 'Get basic information about a GitHub repository.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo:  { type: 'string', description: 'Repository name' }
    },
    required: ['owner', 'repo']
  },
  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const { owner, repo } = input;
      const data = await ghRequest(`/repos/${owner}/${repo}`);
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
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};
