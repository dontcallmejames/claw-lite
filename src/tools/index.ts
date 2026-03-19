import { getToolRegistry } from './registry.js';
import { shellTool } from './shell.js';
import { readFileTool, writeFileTool, listFilesTool } from './files.js';
import { editFileTool, deleteFileTool, createDirectoryTool, moveFileTool } from './file-operations.js';
import { modelSwitchTool } from './model-switch.js';
import { systemMonitorTool } from './system-monitor.js';
import { webScraperTool } from './web-scraper.js';
import { webSearchTool } from './web-search.js';
import { webFetchTool } from './web-fetch.js';
import { processListTool, processKillTool, processInfoTool } from './process-manager.js';
import { restartTool, updateConfigTool, installDependencyTool, buildTool } from './self-management.js';
import { memorySaveTool, memoryRecallTool, memoryForgetTool, memorySearchTool, memoryDescribeTool, memoryQueryTool } from './memory.js';
import { morningBriefingTool } from './morning-briefing.js';
import { githubReadFileTool, githubListFilesTool, githubWriteFileTool, githubDeleteFileTool, githubCreateRepoTool, githubSearchCodeTool, githubRepoInfoTool } from './github.js';
import { writeAndCommitTool } from './write-and-commit.js';
import { writeSkillTool } from './write-skill.js';
import { getConfigTool } from './get-config.js';

export * from './types.js';
export * from './registry.js';

export function initializeTools(): void {
  const registry = getToolRegistry();

  // Core tools only - small models struggle with too many choices
  registry.registerTool(readFileTool);
  registry.registerTool(writeFileTool);
  registry.registerTool(editFileTool);
  registry.registerTool(listFilesTool);
  registry.registerTool(webSearchTool);
  registry.registerTool(webFetchTool);
  registry.registerTool(systemMonitorTool);
  registry.registerTool(memorySaveTool);
  registry.registerTool(memoryRecallTool);
  registry.registerTool(memorySearchTool);
  registry.registerTool(memoryDescribeTool);
  registry.registerTool(memoryQueryTool);
  registry.registerTool(morningBriefingTool);
  registry.registerTool(shellTool);
  registry.registerTool(updateConfigTool);
  registry.registerTool(modelSwitchTool);
  registry.registerTool(getConfigTool);
  registry.registerTool(writeAndCommitTool);
  registry.registerTool(writeSkillTool);
  registry.registerTool(githubReadFileTool);
  registry.registerTool(githubListFilesTool);
  registry.registerTool(githubWriteFileTool);
  registry.registerTool(githubDeleteFileTool);
  registry.registerTool(githubCreateRepoTool);
  registry.registerTool(githubSearchCodeTool);
  registry.registerTool(githubRepoInfoTool);

  console.log(`Initialized ${registry.getAllTools().length} tools`);
}

// Convert our tool definitions to Claude's format
export function getClaudeTools() {
  const registry = getToolRegistry();
  return registry.getAllTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}
