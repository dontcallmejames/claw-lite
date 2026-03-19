import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { config as loadEnv } from 'dotenv';
import { validateConfig } from './schema.js';

loadEnv();

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'ollama';
  model: string;
  maxTokens: number;
  temperature: number;
  fallback?: string[];
}

export interface GatewayConfig {
  port: number;
  host: string;
  enabled: boolean;
}

export interface DiscordConfig {
  enabled: boolean;
  requireMention: boolean;
  allowedUsers: string[];
  allowedBots: string[];
  allowedChannels: string[];
}

export interface ToolsConfig {
  shell: {
    enabled: boolean;
    allowedCommands: string[];
  };
  files: {
    enabled: boolean;
    basePath: string;
    maxFileSize: number;
  };
  deny?: string[];
  profile?: 'minimal' | 'coding' | 'full';
}

export interface SecurityConfig {
  requireApproval: {
    shell: boolean;
    fileWrite: boolean;
    fileDelete: boolean;
  };
  dmPolicy?: 'pairing' | 'open' | 'off';
}

export interface Config {
  llm: LLMConfig;
  gateway: GatewayConfig;
  channels: {
    discord: DiscordConfig;
  };
  tools: ToolsConfig;
  security: SecurityConfig;
  telegram?: {
    token?: string;
    allowed_chat_ids?: number[];
  };
  heartbeat?: {
    enabled?: boolean;
    schedule?: string;
  };
}

let cachedConfig: Config | null = null;

export function loadConfig(configPath: string = './config.yml'): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const fileContents = readFileSync(configPath, 'utf8');
    const raw = parse(fileContents);
    cachedConfig = validateConfig(raw) as Config;
    return cachedConfig;
  } catch (error) {
    console.error('Failed to load config:', error);
    throw new Error(`Could not load configuration from ${configPath}`);
  }
}

export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

export function reloadConfig(configPath: string = './config.yml'): Config {
  cachedConfig = null;
  return loadConfig(configPath);
}
