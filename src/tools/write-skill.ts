import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from "./types.js";
import { sanitizeInjectionPatterns } from "../security/external-content.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const writeSkillTool: ToolDefinition = {
  name: "write_skill",
  requiresConfirmation: true,
  description: "Create or update a skill file in the skills/ directory and commit it to git.\n\nUse this when: asked to create a new skill, update an existing skill, or save a behavioral rule for the assistant.\nDo NOT use this when: you're writing a general file unrelated to skills — use `write_and_commit` or the `file` tool instead.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Skill name (used as filename, no .md extension). Use kebab-case, e.g. \"github-workflow\".",
      },
      content: {
        type: "string",
        description: "Full markdown content for the skill file.",
      },
    },
    required: ["name", "content"],
  },
  async execute(input: Record<string, any>, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    // Sanitize name to prevent path traversal
    const safeName = String(input.name).replace(/[.\/\\]/g, "").trim();
    if (!safeName) {
      return { success: false, error: "Skill name is invalid or empty after sanitization." };
    }

    try {
      const skillsDir = path.join(__dirname, "..", "..", "skills");
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }
      const filePath = path.join(skillsDir, safeName + ".md");
      const safeContent = sanitizeInjectionPatterns(String(input.content));
      fs.writeFileSync(filePath, safeContent, "utf-8");
      return { success: true, output: "Skill written to " + filePath };
    } catch (error: any) {
      return { success: false, error: "Failed to write skill: " + error.message };
    }
  },
};
