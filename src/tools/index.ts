import { getToolRegistry } from './registry.js';
import { fileTool } from './file.js';
import { systemTool } from './system.js';
import { memoryTool } from './memory.js';
import { githubTool } from './github.js';
import { modelSwitchTool } from './model-switch.js';
import { webSearchTool } from './web-search.js';
import { webFetchTool } from './web-fetch.js';
import { restartTool, updateConfigTool, installDependencyTool, buildTool } from './self-management.js';
import { morningBriefingTool } from './morning-briefing.js';
import { writeAndCommitTool } from './write-and-commit.js';
import { writeSkillTool } from './write-skill.js';
import { getConfigTool } from './get-config.js';
import { sendMessageTool } from './send-message.js';
import { scheduleMessageTool } from './schedule-message.js';

export * from './types.js';
export * from './registry.js';
export { setChannelManager } from './send-message.js';

export function initializeTools(): void {
  const registry = getToolRegistry();

  // Consolidated domain tools
  registry.registerTool(fileTool);
  registry.registerTool(systemTool);
  registry.registerTool(memoryTool);
  registry.registerTool(githubTool);

  // Standalone tools
  registry.registerTool(webSearchTool);
  registry.registerTool(webFetchTool);
  registry.registerTool(sendMessageTool);
  registry.registerTool(scheduleMessageTool);
  registry.registerTool(morningBriefingTool);
  registry.registerTool(getConfigTool);
  registry.registerTool(updateConfigTool);
  registry.registerTool(modelSwitchTool);
  registry.registerTool(restartTool);          // was imported but never registered — fixed
  registry.registerTool(installDependencyTool);
  registry.registerTool(buildTool);
  registry.registerTool(writeAndCommitTool);
  registry.registerTool(writeSkillTool);

  console.log(`Initialized ${registry.getAllTools().length} tools`);
}

export function getClaudeTools() {
  const registry = getToolRegistry();
  return registry.getAllTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}
