import { WebSocketServer, WebSocket } from 'ws';
import { loadConfig, reloadConfig } from '../config/loader.js';
import { getLLMProvider } from '../llm/index.js';
import { getToolRegistry, getClaudeTools, setChannelManager } from '../tools/index.js';
import type { GatewayMessage, ChatRequest, ToolExecuteRequest, StatusResponse } from './types.js';
import type { Message } from '../llm/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CronRunner } from '../cron/runner.js';
import http from 'http';
import { ChannelManager } from '../channels/manager.js';
import { WebSocketChannel } from '../channels/websocket.js';
import { TelegramChannel } from '../channels/telegram.js';
import { DiscordChannel } from '../channels/discord.js';
import { HeartbeatRunner } from '../heartbeat/runner.js';
import { guardContext } from '../llm/context-guard.js';
import { chatWithFailover } from '../llm/failover.js';
import { wrapExternalContent } from '../security/external-content.js';
import { getDb } from '../memory/db.js';
import * as memStore from '../memory/store.js';
import { assembleContext } from '../memory/assembler.js';
import { needsCompaction, runCompaction } from '../memory/compaction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadMarkdownFile(filename: string): string {
  try {
    const filePath = path.join(__dirname, '..', '..', filename);
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8').trim();
  } catch {
    return '';
  }
}

/**
 * Build the full system prompt server-side from identity files + memory.
 * The browser sends no system prompt - this owns it entirely.
 * Follows the OpenClaw pattern: identity files injected fresh every turn.
 */
function buildSystemPrompt(): string {
  const parts: string[] = [];

  // Core identity files - order matters
  const soul = loadMarkdownFile('SOUL.md');
  const identity = loadMarkdownFile('IDENTITY.md');
  const user = loadMarkdownFile('USER.md');

  if (soul) parts.push(soul);
  if (identity) parts.push(identity);
  if (user) parts.push(user);

  // Skills - inject all skill files from skills/ directory
  try {
    const skillsDir = path.join(__dirname, '..', '..', 'skills');
    if (fs.existsSync(skillsDir)) {
      const skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md')).sort();
      if (skillFiles.length > 0) {
        const skillParts: string[] = ['## Skills'];
        for (const file of skillFiles) {
          const skillName = file.replace(/.md$/, '');
          const skillContent = fs.readFileSync(path.join(skillsDir, file), 'utf-8').trim();
          skillParts.push(`### ${skillName}\n\n${skillContent}`);
        }
        parts.push(skillParts.join('\n\n'));
      }
    }
  } catch { /* ignore */ }

  // Inject live config so the assistant always knows current model/settings without a tool call
  try {
    const config = reloadConfig();
    parts.push([
      '## Current Runtime Config',
      `- Model: ${config.llm.model}`,
      `- Provider: ${config.llm.provider}`,
      `- Temperature: ${config.llm.temperature}`,
      `- Gateway port: ${config.gateway.port}`,
    ].join('\n'));
  } catch { /* ignore */ }

  // Memory recall instructions
  parts.push([
    '## Memory & History Recall',
    'All conversations are persisted in a SQLite database with hierarchical summaries.',
    'When asked about past conversations, decisions, or context:',
    '1. Use `memory_search` to find relevant messages/summaries by keyword',
    '2. Use `memory_describe` to inspect a specific summary in detail',
    '3. Use `memory_query` to answer complex questions from conversation history',
    'Use `remember`/`recall` for key-value facts and preferences.',
    'If a [Context Summary] appears in the conversation, it represents compacted older messages. Use memory tools to drill into details if needed.',
  ].join('\n'));

  // Memory - inject with keys so the model knows what each value means
  try {
    const memoryFile = path.join(__dirname, '..', '..', 'memory.json');
    if (fs.existsSync(memoryFile)) {
      const memory = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
      const lines: string[] = ['## What I Know'];

      function flattenMemory(obj: Record<string, any>, prefix = ''): void {
        for (const [k, v] of Object.entries(obj)) {
          if (!v) continue;
          const label = prefix ? `${prefix}.${k}` : k;
          if (typeof v === 'object' && !Array.isArray(v)) {
            flattenMemory(v, label);
          } else {
            lines.push(`- ${label}: ${v}`);
          }
        }
      }

      flattenMemory(memory.facts || {});
      flattenMemory(memory.preferences || {});

      if (lines.length > 1) {
        parts.push(lines.join('\n'));
      }

      // Notes — last 20
      const notes: Array<{ id: string; content: string; timestamp: string }> = memory.notes || [];
      if (notes.length > 0) {
        const recent = notes.slice(-20);
        const noteLines = ['## Notes'];
        for (const n of recent) {
          const date = n.timestamp ? n.timestamp.split('T')[0] : '';
          noteLines.push(`- ${n.content}${date ? ` (${date})` : ''}`);
        }
        parts.push(noteLines.join('\n'));
      }

      // Events — last 20 sorted by date ascending
      const events: Array<{ id: string; date: string; description: string; timestamp: string }> = memory.events || [];
      if (events.length > 0) {
        const recent = [...events].sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
        const eventLines = ['## Upcoming & Past Events'];
        for (const e of recent) {
          eventLines.push(`- ${e.date}: ${e.description}`);
        }
        parts.push(eventLines.join('\n'));
      }
    }
  } catch { /* ignore */ }

  return parts.join('\n\n---\n\n');
}

export class GatewayServer {
  private wss: WebSocketServer;
  private llmProvider = getLLMProvider();
  private toolRegistry = getToolRegistry();
  private startTime = Date.now();
  private activeConnections = new Set<WebSocket>();
  private cronRunner: CronRunner;
  private agentQueue: Promise<unknown> = Promise.resolve();
  private server: http.Server;
  private channelManager: ChannelManager;
  private heartbeatRunner?: HeartbeatRunner;

  constructor(port?: number, host?: string) {
    const config = loadConfig();
    const serverPort = port ?? config.gateway.port;
    const serverHost = host ?? config.gateway.host;

    this.server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        const killCmd = process.platform === 'win32'
          ? 'Get-Process node | Stop-Process -Force'
          : `lsof -ti:${serverPort} | xargs kill -9`;
        console.error(`[Gateway] ERROR: Port ${serverPort} is already in use. Kill it with:`);
        console.error(`[Gateway]   ${killCmd}`);
      } else {
        console.error('[Gateway] Server error:', err);
      }
      process.exit(1);
    });

    this.wss = new WebSocketServer({ server: this.server });
    this.server.listen(serverPort, serverHost, () => {
      console.log(`[Gateway] HTTP server bound to ${serverHost}:${serverPort}`);
    });

    this.setupEventHandlers();

    // Channel manager — fan-out notifications to all channels
    this.channelManager = new ChannelManager();
    this.channelManager.register(new WebSocketChannel(() => this.activeConnections));
    setChannelManager(this.channelManager);

    // Telegram token is read from TELEGRAM_TOKEN env var — not hardcoded in config
    const telegramToken = process.env.TELEGRAM_TOKEN || config.telegram?.token;
    if (telegramToken) {
      const allowedChatIds = config.telegram?.allowed_chat_ids ?? [];
      const telegramChannel = new TelegramChannel(telegramToken, allowedChatIds);
      telegramChannel.onMessage((_from, message) =>
        this.enqueue(() => this.runCronJobImpl(message))
      );
      this.channelManager.register(telegramChannel);
    }
    if (config.channels.discord.enabled) {
      const discord = new DiscordChannel(config.channels.discord);
      discord.onMessage((_from, message) =>
        this.enqueue(() => this.runCronJobImpl(message))
      );
      this.channelManager.register(discord);
    }
    this.channelManager.start();

    // Cron runner
    const cronPath = path.join(__dirname, '..', '..', 'crons.json');
    this.cronRunner = new CronRunner(
      cronPath,
      (message) => this.runCronJob(message),
      (content, jobName, channel) => {
        if (channel) {
          // Send to specific channel only
          this.channelManager.sendTo(channel, '', `[⏳ ${jobName}]\n\n${content}`);
        } else {
          // Broadcast to all channels
          this.channelManager.notify(content, jobName);
        }
      }
    );
    try {
      this.cronRunner.start();
    } catch (err) {
      console.error('[Cron] Failed to start CronRunner:', err);
    }

    // Heartbeat runner
    if (config.heartbeat?.enabled) {
      const heartbeatPath = path.join(__dirname, '..', '..', 'HEARTBEAT.md');
      const heartbeatSchedule = config.heartbeat?.schedule ?? '*/30 * * * *';
      this.heartbeatRunner = new HeartbeatRunner(
        heartbeatSchedule,
        heartbeatPath,
        (message) => this.runCronJob(message),
        this.channelManager
      );
      try {
        this.heartbeatRunner.start();
      } catch (err) {
        console.error('[Heartbeat] Failed to start:', err);
      }
    }

    // Initialize SQLite memory database
    getDb();

    console.log(`Gateway server listening on ws://${serverHost}:${serverPort} (HTTP webhook: POST /webhook)`);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.agentQueue.then(() => task()) as Promise<T>;
    this.agentQueue = result.catch(() => {});
    return result;
  }

  private proxyTo(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    targetPath: string,
    targetBase: string,
    errorMsg: string
  ): void {
    const targetUrl = `${targetBase}${targetPath}`;
    const targetHost = targetBase.replace(/^https?:\/\//, '');
    const proxyReq = http.request(targetUrl, {
      method: req.method,
      headers: { ...req.headers, host: targetHost },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: errorMsg }));
    });
    req.pipe(proxyReq);
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    // Serve index.html for GET /
    if (req.method === 'GET' && req.url === '/') {
      const indexPath = path.join(__dirname, '..', '..', 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(indexPath));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // POST /webhook
    if (req.method === 'POST' && req.url === '/webhook') {
      let body = '';
      let size = 0;
      req.on('error', () => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request error' }));
      });
      req.on('data', chunk => {
        size += chunk.length;
        if (size > 1_000_000) { req.destroy(); return; }
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const message = payload.message;
          if (!message || typeof message !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required field: message' }));
            return;
          }
          console.log(`[Webhook] Received: "${message}"`);
          const wrappedMessage = wrapExternalContent(message, 'webhook');
          const response = await this.runCronJob(wrappedMessage);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response }));
        } catch (err: any) {
          console.error('[Webhook] Error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
        }
      });
      return;
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New client connected');
      this.activeConnections.add(ws);

      ws.on('message', async (data: Buffer) => {
        await this.handleMessage(ws, data);
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.activeConnections.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.activeConnections.delete(ws);
      });

      this.sendMessage(ws, {
        type: 'status',
        payload: { message: 'Connected to assistant', version: '1.0.0' }
      });
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  private async handleMessage(ws: WebSocket, data: Buffer): Promise<void> {
    try {
      const message: GatewayMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'chat':
          await this.enqueue(() => this.handleChat(ws, message.payload as ChatRequest));
          break;
        case 'tool_execute':
          await this.handleToolExecute(ws, message.payload as ToolExecuteRequest);
          break;
        case 'status':
          await this.handleStatus(ws);
          break;
        case 'config':
          await this.handleConfig(ws);
          break;
        case 'save_config':
          await this.handleSaveConfig(ws, message.payload);
          break;
        case 'get_memory':
          await this.handleGetMemory(ws);
          break;
        case 'save_memory':
          await this.handleSaveMemory(ws, message.payload);
          break;
        case 'get_crons':
          await this.handleGetCrons(ws);
          break;
        case 'save_crons':
          await this.handleSaveCrons(ws, message.payload);
          break;
        default:
          this.sendError(ws, `Unknown message type: ${message.type}`);
      }
    } catch (error: any) {
      console.error('Error handling message:', error);
      this.sendError(ws, error.message);
    }
  }

  /**
   * Detect requests that should bypass the LLM entirely and call a tool directly.
   * Used for high-confidence intent matches where the model reliably fails to pick the right tool.
   */
  private detectDirectToolIntent(messages: any[]): { tool: string; input: Record<string, any> } | null {
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');
    if (!lastUser) return null;
    const text = lastUser.content.trim().toLowerCase();

    if (/\b(morning briefing|daily briefing|what'?s? (going on|happening) today|morning update|today'?s? (news|headlines|weather))\b/.test(text)) {
      return { tool: 'morning_briefing', input: {} };
    }

    return null;
  }

  /**
   * Returns true for messages that are pure conversation - no tools needed.
   */
  private isConversational(messages: any[]): boolean {
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');
    if (!lastUser) return false;
    const text = lastUser.content.trim().toLowerCase();

    const alwaysNeedTools = [
      /briefing/, /weather/, /headline/, /\bnews\b/,
      /\bsearch\b/, /read.*file/, /show.*file/,
      /what.*(config|temperature|temp\b)/, /what.*memory/,
      /list.*file/, /check.*(system|cpu|disk|ram)/,
      /\bexecute\b/, /switch.*model/, /\bfetch\b/, /look up/,
      /what('s| is) (going on|happening|today)/,
    ];
    if (alwaysNeedTools.some(p => p.test(text))) return false;

    const conversational = [
      /^(hi|hello|hey|yo|sup|howdy)[\s!?.]?$/,
      /^(thanks|thank you|thx|ty)[\s!?.]?$/,
      /^(ok|okay|got it|sure|yes|no|yeah|nope|cool|great|nice|awesome)[\s!?.]?$/,
      /^who are you\??$/,
      /^what('s| is) your name\??$/,
      /^what are you\??$/,
      /^how are you\??$/,
      /^what can you do\??$/,
      /^tell me about yourself\.?$/,
      /^introduce yourself\.?$/,
      /what models? (do you|can you|are available|do you have)/,
      /which models?.*available/,
      /what (llm|ai) models?/,
      /what are your (tools|capabilities|skills)/,
      /what model (are you|do you)/,
      /which model (are you|do you)/,
      /what.*model.*using/,
      /what.*model.*running/,
      /what (build|version) (are you|do you)/,
      /are you using/,
      /are you running/,
      /what provider/,
    ];

    return conversational.some(p => p.test(text));
  }

  /**
   * Return all tools minus any on the deny list.
   */
  private getAllowedTools() {
    const config = reloadConfig();
    const denyList = new Set(config.tools?.deny ?? []);
    const tools = getClaudeTools().filter(t => !denyList.has(t.name));
    console.log(`[Gateway] Tools (${tools.length}): ${tools.map(t => t.name).join(', ')}`);
    return tools;
  }

  /**
   * Check whether a model response is fabricating a completed action.
   */
  private verifyResponse(
    content: string,
    seenToolSignatures: string[]
  ): { ok: boolean; reason?: string } {
    if (!content) return { ok: true };

    const lower = content.toLowerCase();

    const claimPatterns = [
      /i(?:'ve| have) (?:added|created|written|updated|committed|pushed|uploaded|saved|made the changes)/,
      /(?:the file|the changes|the update|the commit|the readme|the plugin) (?:has been|have been|is now|are now) (?:added|created|written|updated|committed|pushed|uploaded|saved)/,
      /(?:added|created|written|updated|committed|pushed|uploaded|saved) (?:the file|the changes|the update|the commit|the readme|the plugin)/,
      /you can (?:check|view|see) it (?:at|on|in) (?:github|the repo)/,
      /(?:check it out|view it) (?:here|at|on)/,
    ];

    const isClaiming = claimPatterns.some(p => p.test(lower));
    if (!isClaiming) return { ok: true };

    const mutatingTools = [
      'write_and_commit', 'github_write_file', 'github_delete_file',
      'github_create_repo', 'write_file', 'edit_file', 'execute_shell',
    ];

    const toolsFired = seenToolSignatures.some(sig =>
      mutatingTools.some(t => sig.startsWith(t + ':'))
    );

    if (!toolsFired) {
      return { ok: false, reason: 'model claimed action without calling a mutating tool' };
    }

    return { ok: true };
  }

  private async handleChat(ws: WebSocket, request: ChatRequest): Promise<void> {
    const systemPrompt = buildSystemPrompt();
    const { model } = reloadConfig().llm;

    const conversationId = memStore.getOrCreateConversation('webchat');

    const userMessages = request.messages.filter((m: any) => m.role !== 'system');
    const lastUserMsg = [...userMessages].reverse().find((m: any) => m.role === 'user');
    if (lastUserMsg?.content) {
      memStore.insertMessage(conversationId, 'user', lastUserMsg.content);
    }

    const assembled = assembleContext(conversationId, systemPrompt, model);
    let baseMessages = assembled.messages;

    const guard = guardContext(baseMessages, model);
    baseMessages = guard.messages;
    if (guard.trimmed) {
      console.log(`[Gateway] Context trimmed: ~${guard.estimatedTokens}/${guard.contextLimit} tokens`);
    }

    const directIntent = this.detectDirectToolIntent(request.messages);
    if (directIntent) {
      console.log(`[Gateway] Direct tool intent: ${directIntent.tool}`);
      try {
        const result = await this.toolRegistry.executeTool(directIntent.tool, directIntent.input, {});
        if (result.success) {
          const lastUser = [...request.messages].reverse().find((m: any) => m.role === 'user');
          const userMsg = lastUser?.content || 'the request';
          const presentMessages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `The user asked: "${userMsg}"\n\nHere is the data retrieved:\n\n${result.output}\n\nRespond naturally and concisely based on this data.` }
          ];
          const response = await chatWithFailover(this.llmProvider, presentMessages, undefined);
          this.sendMessage(ws, { type: 'chat', payload: { content: response.content || result.output } });
        } else {
          this.sendMessage(ws, { type: 'chat', payload: { content: `Couldn't complete that: ${result.error}` } });
        }
      } catch (err: any) {
        this.sendMessage(ws, { type: 'chat', payload: { content: `Failed: ${err.message}` } });
      }
      return;
    }

    const conversational = this.isConversational(request.messages);
    const tools = conversational ? undefined : this.getAllowedTools();

    if (conversational) {
      console.log('[Gateway] Conversational - no tools');
    }

    const conversationMessages: Message[] = [...baseMessages];
    let maxTurns = 5;
    let turn = 0;
    let lastContent = '';
    let lastToolResult = '';
    const seenToolSignatures: string[] = [];

    while (turn < maxTurns) {
      turn++;
      console.log(`[Gateway] Turn ${turn}`);

      const response = await chatWithFailover(this.llmProvider, conversationMessages, tools);

      if (response.content) lastContent = response.content;

      if (response.toolUses && response.toolUses.length > 0) {
        console.log(`[Gateway] Tool calls: ${response.toolUses.map(t => t.name).join(', ')}`);

        const sig = response.toolUses.map(t => `${t.name}:${JSON.stringify(t.input)}`).join('|');
        if (seenToolSignatures.includes(sig)) {
          console.log('[Gateway] Repeated tool call - breaking loop');
          break;
        }
        seenToolSignatures.push(sig);

        conversationMessages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolUses,
        });

        for (const toolUse of response.toolUses) {
          console.log(`[Gateway] Executing: ${toolUse.name}`, toolUse.input);
          const result = await this.toolRegistry.executeTool(toolUse.name, toolUse.input, {});

          if (result.success) {
            const toolContent = result.output || '';
            lastToolResult = toolContent;
            conversationMessages.push({ role: 'tool', content: toolContent, tool_call_id: toolUse.id });
          } else {
            const errContent = `Tool error: ${result.error}\n\nDo not retry the same tool with the same arguments. Either try a different approach or answer directly from what you already know.`;
            lastToolResult = errContent;
            conversationMessages.push({ role: 'tool', content: errContent, tool_call_id: toolUse.id });
          }
        }
        continue;
      }

      const verified = this.verifyResponse(response.content || '', seenToolSignatures);
      if (!verified.ok) {
        console.warn(`[Gateway] Fabricated claim detected: "${verified.reason}" — forcing tool use`);
        conversationMessages.push({ role: 'assistant', content: response.content || '' });
        conversationMessages.push({
          role: 'user',
          content: `CORRECTION: You claimed to have completed an action but no tool was called. You MUST call the appropriate tool now. Do not describe the action — execute it.`
        });
        continue;
      }

      console.log(`[Gateway] Done after ${turn} turn(s)`);

      if (response.content) {
        memStore.insertMessage(conversationId, 'assistant', response.content);
      }

      if (needsCompaction(conversationId)) {
        runCompaction(conversationId, this.llmProvider).catch(err =>
          console.error('[Compaction] Background error:', err)
        );
      }

      this.sendMessage(ws, {
        type: 'chat',
        payload: { content: response.content, stopReason: response.stopReason }
      });
      return;
    }

    console.warn(`[Gateway] Loop ended after ${turn} turns`);
    if (lastContent) {
      this.sendMessage(ws, { type: 'chat', payload: { content: lastContent, stopReason: 'max_turns' } });
      return;
    }
    if (lastToolResult) {
      try {
        const lastUser = [...request.messages].reverse().find((m: any) => m.role === 'user');
        const synthesizeMessages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[] = [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: `The user asked: "${lastUser?.content || ''}"\n\nHere is the result:\n\n${lastToolResult}\n\nRespond naturally and concisely.` }
        ];
        const synth = await chatWithFailover(this.llmProvider, synthesizeMessages, undefined);
        this.sendMessage(ws, { type: 'chat', payload: { content: synth.content || lastToolResult, stopReason: 'max_turns' } });
      } catch {
        this.sendMessage(ws, { type: 'chat', payload: { content: lastToolResult, stopReason: 'max_turns' } });
      }
      return;
    }
    this.sendMessage(ws, { type: 'chat', payload: { content: "I got stuck on that one. Try rephrasing.", stopReason: 'max_turns' } });
  }

  public async runCronJob(message: string): Promise<string> {
    return this.enqueue(() => this.runCronJobImpl(message));
  }

  private async runCronJobImpl(message: string): Promise<string> {
    const systemPrompt = buildSystemPrompt();
    const conversationMessages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ];

    const tools = this.getAllowedTools();
    const maxTurns = 5;
    let turn = 0;
    let lastContent = '';
    let lastToolResult = '';
    const seenToolSignatures: string[] = [];

    while (turn < maxTurns) {
      turn++;
      const response = await chatWithFailover(this.llmProvider, conversationMessages, tools);
      if (response.content) lastContent = response.content;

      if (response.toolUses && response.toolUses.length > 0) {
        const sig = response.toolUses.map(t => `${t.name}:${JSON.stringify(t.input)}`).join('|');
        if (seenToolSignatures.includes(sig)) break;
        seenToolSignatures.push(sig);

        conversationMessages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolUses,
        });

        for (const toolUse of response.toolUses) {
          const result = await this.toolRegistry.executeTool(toolUse.name, toolUse.input, {});
          const toolContent = result.success ? (result.output || '') : `Tool error: ${result.error}`;
          if (result.success) lastToolResult = toolContent;
          conversationMessages.push({ role: 'tool', content: toolContent, tool_call_id: toolUse.id });
        }
        continue;
      }

      return response.content || lastContent || lastToolResult || 'Done.';
    }

    if (lastContent) return lastContent;
    if (lastToolResult) {
      try {
        const synth = await chatWithFailover(this.llmProvider, [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: `Summarize this result concisely:\n\n${lastToolResult}` },
        ], undefined);
        return synth.content || lastToolResult;
      } catch {
        return lastToolResult;
      }
    }
    return 'Job completed.';
  }

  private async handleToolExecute(ws: WebSocket, request: ToolExecuteRequest): Promise<void> {
    const result = await this.toolRegistry.executeTool(
      request.name,
      request.input,
      request.context || {}
    );
    this.sendMessage(ws, { type: 'tool_execute', payload: result });
  }

  private async handleStatus(ws: WebSocket): Promise<void> {
    const status: StatusResponse = {
      status: 'online',
      version: '1.0.0',
      uptime: Date.now() - this.startTime,
      activeConnections: this.activeConnections.size
    };
    this.sendMessage(ws, { type: 'status', payload: status });
  }

  private async handleConfig(ws: WebSocket): Promise<void> {
    const config = loadConfig();
    this.sendMessage(ws, {
      type: 'config',
      payload: {
        model: config.llm.model,
        provider: config.llm.provider,
        temperature: config.llm.temperature
      }
    });
  }

  private async handleSaveConfig(ws: WebSocket, payload: any): Promise<void> {
    try {
      const configPath = path.join(__dirname, '..', '..', 'config.yml');
      const existing = fs.readFileSync(configPath, 'utf-8');
      let updated = existing;
      if (payload.model !== undefined) {
        updated = updated.replace(/^(\s*model:\s*).*$/m, `$1${payload.model}`);
      }
      if (payload.temperature !== undefined) {
        updated = updated.replace(/^(\s*temperature:\s*).*$/m, `$1${payload.temperature}`);
      }
      if (payload.maxTokens !== undefined) {
        updated = updated.replace(/^(\s*maxTokens:\s*).*$/m, `$1${payload.maxTokens}`);
      }
      fs.writeFileSync(configPath, updated, 'utf-8');
      this.sendMessage(ws, { type: 'save_config', payload: { success: true } });
    } catch (err: any) {
      this.sendMessage(ws, { type: 'save_config', payload: { success: false, error: err.message } });
    }
  }

  private async handleGetMemory(ws: WebSocket): Promise<void> {
    try {
      const memPath = path.join(__dirname, '..', '..', 'memory.json');
      const memory = JSON.parse(fs.readFileSync(memPath, 'utf-8'));
      this.sendMessage(ws, { type: 'get_memory', payload: memory });
    } catch (err: any) {
      this.sendMessage(ws, { type: 'get_memory', payload: { facts: {}, preferences: {}, notes: [], events: [], history: [] } });
    }
  }

  private async handleSaveMemory(ws: WebSocket, payload: any): Promise<void> {
    try {
      const memPath = path.join(__dirname, '..', '..', 'memory.json');
      fs.writeFileSync(memPath, JSON.stringify(payload, null, 2), 'utf-8');
      this.sendMessage(ws, { type: 'save_memory', payload: { success: true } });
    } catch (err: any) {
      this.sendMessage(ws, { type: 'save_memory', payload: { success: false, error: err.message } });
    }
  }

  private async handleGetCrons(ws: WebSocket): Promise<void> {
    try {
      const cronsPath = path.join(__dirname, '..', '..', 'crons.json');
      if (!fs.existsSync(cronsPath)) {
        fs.writeFileSync(cronsPath, JSON.stringify({ jobs: [] }, null, 2), 'utf-8');
      }
      const crons = JSON.parse(fs.readFileSync(cronsPath, 'utf-8'));
      this.sendMessage(ws, { type: 'get_crons', payload: crons });
    } catch (err: any) {
      this.sendMessage(ws, { type: 'get_crons', payload: { jobs: [] } });
    }
  }

  private async handleSaveCrons(ws: WebSocket, payload: any): Promise<void> {
    try {
      const cronsPath = path.join(__dirname, '..', '..', 'crons.json');
      fs.writeFileSync(cronsPath, JSON.stringify(payload, null, 2), 'utf-8');
      this.sendMessage(ws, { type: 'save_crons', payload: { success: true } });
    } catch (err: any) {
      this.sendMessage(ws, { type: 'save_crons', payload: { success: false, error: err.message } });
    }
  }

  private sendMessage(ws: WebSocket, message: GatewayMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, { type: 'error', payload: { error } });
  }

  async close(): Promise<void> {
    this.heartbeatRunner?.stop();
    this.cronRunner.stop();
    this.channelManager.stop();
    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
    console.log('Gateway server closed');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new GatewayServer();

  process.on('SIGINT', async () => {
    console.log('\nShutting down gateway...');
    await server.close();
    process.exit(0);
  });
}
