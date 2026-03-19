export interface GatewayMessage {
  type: 'chat' | 'tool_execute' | 'status' | 'config' | 'error'
      | 'get_memory' | 'save_memory' | 'get_crons' | 'save_crons'
      | 'save_config';
  payload: any;
}

export interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  tools?: boolean;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  toolUses?: Array<{
    id: string;
    name: string;
    input: Record<string, any>;
  }>;
}

export interface ToolExecuteRequest {
  name: string;
  input: Record<string, any>;
  context?: {
    userId?: string;
    channelId?: string;
  };
}

export interface StatusResponse {
  status: 'online' | 'offline';
  version: string;
  uptime: number;
  activeConnections: number;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;   // cron expression e.g. "0 8 * * *"
  message: string;    // message to send to the assistant
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}
