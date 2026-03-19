import { z } from 'zod';

const LLMSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'ollama']),
  model: z.string().min(1),
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.8),
  fallback: z.array(z.string()).optional(),
});

const GatewaySchema = z.object({
  port: z.number().int().min(1).max(65535).default(8080),
  host: z.string().default('127.0.0.1'),
  enabled: z.boolean().default(true),
});

const DiscordSchema = z.object({
  enabled: z.boolean().default(false),
  requireMention: z.boolean().default(true),
  allowedUsers: z.array(z.string()).default([]),
  allowedBots: z.array(z.string()).default([]),
  allowedChannels: z.array(z.string()).default([]),
});

const ToolsSchema = z.object({
  shell: z.object({
    enabled: z.boolean().default(true),
    allowedCommands: z.array(z.string()).default([]),
  }),
  files: z.object({
    enabled: z.boolean().default(true),
    basePath: z.string().default('./workspace'),
    maxFileSize: z.number().int().positive().default(10485760),
  }),
  deny: z.array(z.string()).optional(),
  profile: z.enum(['minimal', 'coding', 'full']).optional(),
});

const SecuritySchema = z.object({
  dmPolicy: z.enum(['pairing', 'open', 'off']).default('open'),
  requireApproval: z.object({
    shell: z.boolean().default(true),
    fileWrite: z.boolean().default(true),
    fileDelete: z.boolean().default(true),
  }),
});

const TelegramSchema = z.object({
  token: z.string().optional(),
  allowed_chat_ids: z.array(z.number()).default([]),
}).optional();

const HeartbeatSchema = z.object({
  enabled: z.boolean().default(false),
  schedule: z.string().default('*/30 * * * *'),
}).optional();

export const ConfigSchema = z.object({
  llm: LLMSchema,
  gateway: GatewaySchema,
  channels: z.object({
    discord: DiscordSchema,
  }),
  tools: ToolsSchema,
  security: SecuritySchema,
  telegram: TelegramSchema,
  heartbeat: HeartbeatSchema,
});

export type ValidatedConfig = z.infer<typeof ConfigSchema>;

/**
 * Validate raw parsed config against the schema.
 * Returns typed config or throws with descriptive error messages.
 */
export function validateConfig(raw: unknown): ValidatedConfig {
  const result = ConfigSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }

  const errors = result.error.issues.map(issue => {
    const path = issue.path.join('.');
    return `  - ${path}: ${issue.message}`;
  }).join('\n');

  throw new Error(`Config validation failed:\n${errors}`);
}
