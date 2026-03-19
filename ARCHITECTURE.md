# Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interfaces                         │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐   ┌───────────────┐  │
│  │   Discord   │    │   WebSocket  │   │  (Future:     │  │
│  │     Bot     │    │    Clients   │   │  Telegram,    │  │
│  │             │    │              │   │  Web UI, etc) │  │
│  └──────┬──────┘    └──────┬───────┘   └───────────────┘  │
│         │                  │                               │
└─────────┼──────────────────┼───────────────────────────────┘
          │                  │
          ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core System                            │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Gateway Server (Optional)             │    │
│  │         WebSocket Server (ws://127.0.0.1:8080)     │    │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────────┐  │    │
│  │  │  Chat    │  │   Tool   │  │     Status      │  │    │
│  │  │ Endpoint │  │ Executor │  │   Monitoring    │  │    │
│  │  └──────────┘  └──────────┘  └─────────────────┘  │    │
│  └────────────────────┬───────────────────────────────┘    │
│                       │                                     │
│  ┌────────────────────┼───────────────────────────────┐    │
│  │         LLM Provider Abstraction Layer             │    │
│  │  ┌─────────────────┴──────────────────┐            │    │
│  │  │     Anthropic (Claude) Provider    │            │    │
│  │  │  - Message API                     │            │    │
│  │  │  - Streaming support               │            │    │
│  │  │  - Tool calling                    │            │    │
│  │  └────────────────────────────────────┘            │    │
│  └─────────────────────────────────────────────────────┘    │
│                       │                                     │
│  ┌────────────────────┼───────────────────────────────┐    │
│  │            Tool Registry & Executor                │    │
│  │  ┌──────────────┬───────────────┬───────────────┐  │    │
│  │  │    Shell     │     Files     │   (Custom)    │  │    │
│  │  │   Executor   │   Operations  │    Tools      │  │    │
│  │  │              │               │               │  │    │
│  │  │ - Allowlist  │ - read_file   │ - Easy to add │  │    │
│  │  │ - Timeout    │ - write_file  │ - Registry    │  │    │
│  │  │ - Sandbox    │ - list_files  │   pattern     │  │    │
│  │  └──────────────┴───────────────┴───────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │          Configuration & Session Management         │    │
│  │  ┌──────────────┐  ┌──────────────────────────┐    │    │
│  │  │  Config      │  │  Session Store           │    │    │
│  │  │  - YAML      │  │  - Per-user history      │    │    │
│  │  │  - .env      │  │  - In-memory (for now)   │    │    │
│  │  └──────────────┘  └──────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
          │                                │
          ▼                                ▼
┌─────────────────────┐         ┌─────────────────────┐
│   External APIs     │         │   Local Resources   │
│                     │         │                     │
│  - Anthropic API    │         │  - Workspace dir    │
│  - (OpenAI future)  │         │  - Config files     │
└─────────────────────┘         └─────────────────────┘
```

## Component Details

### 1. Discord Bot (`src/channels/discord.ts`)

**Responsibilities:**
- Listen for Discord messages
- Filter by prefix and permissions
- Manage conversation history
- Handle multi-turn interactions
- Format responses for Discord

**Flow:**
```
Discord Message
    ↓
Filter (prefix, permissions)
    ↓
Extract user message
    ↓
Get/Create conversation history
    ↓
Call LLM with tools
    ↓
[If tool_use] → Execute tools → Send results → Call LLM again
    ↓
Format & send response
    ↓
Update conversation history
```

### 2. Gateway Server (`src/gateway/server.ts`)

**Responsibilities:**
- WebSocket server management
- Message routing
- Chat request handling
- Tool execution requests
- Status monitoring

**Message Types:**
- `chat` - AI conversation requests
- `tool_execute` - Direct tool invocation
- `status` - Server status query
- `error` - Error responses

**Example Chat Message:**
```json
{
  "type": "chat",
  "payload": {
    "messages": [
      { "role": "user", "content": "Hello" }
    ],
    "tools": true,
    "stream": false
  }
}
```

### 3. LLM Provider (`src/llm/`)

**Interface:**
```typescript
interface LLMProvider {
  chat(messages, tools?) → ChatResponse
  streamChat(messages, tools?) → AsyncGenerator<string>
}
```

**Implementations:**
- ✅ Anthropic (Claude)
- ❌ OpenAI (future)

**Features:**
- System message handling
- Tool calling support
- Streaming responses
- Error handling

### 4. Tool System (`src/tools/`)

**Architecture:**
```
Tool Registry
    ↓
Tool Definition {
  name: string
  description: string
  inputSchema: JSONSchema
  execute: (input, context) → Result
}
    ↓
Tool Executor
    ↓
Tool Result {
  success: boolean
  output?: string
  error?: string
}
```

**Built-in Tools:**

1. **execute_shell**
   - Allowlist-based command execution
   - Timeout protection
   - Output size limits

2. **read_file**
   - Sandboxed to workspace
   - Size limits
   - Path traversal protection

3. **write_file**
   - Sandboxed to workspace
   - Approval configurable

4. **list_files**
   - Directory listing
   - Sandboxed to workspace

### 5. Configuration System (`src/config/`)

**Sources (priority order):**
1. Environment variables (`.env`)
2. YAML config file (`config.yml`)
3. Defaults

**Structure:**
```yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-5-20250929

gateway:
  port: 8080
  enabled: true

channels:
  discord:
    enabled: true
    commandPrefix: "!"

tools:
  shell:
    enabled: true
    allowedCommands: [...]
  files:
    enabled: true
    basePath: ./workspace

security:
  requireApproval:
    shell: true
    fileWrite: true
```

## Data Flow Examples

### Example 1: Simple Question

```
User: "!what is 2+2?"
    ↓
Discord Bot
    ↓
Conversation History: [system, user: "what is 2+2?"]
    ↓
Claude API (no tools needed)
    ↓
Response: "2+2 equals 4"
    ↓
Discord Bot
    ↓
User sees: "2+2 equals 4"
```

### Example 2: Tool Use

```
User: "!list files in workspace"
    ↓
Discord Bot
    ↓
History: [system, user: "list files in workspace"]
    ↓
Claude API with tools
    ↓
Response: tool_use(name: "list_files", input: {})
    ↓
Tool Registry
    ↓
list_files tool executes
    ↓
Result: "config.yml\nhello.txt"
    ↓
History: [system, user, assistant(tool_use), user(tool_result)]
    ↓
Claude API (with tool result)
    ↓
Response: "The workspace contains: config.yml and hello.txt"
    ↓
Discord Bot
    ↓
User sees response
```

### Example 3: Multi-turn Tool Use

```
User: "!create a hello world file"
    ↓
Claude: tool_use(write_file, {path: "hello.txt", content: "Hello World"})
    ↓
Tool executes → Success
    ↓
Claude: "I've created hello.txt with 'Hello World'"
    ↓
History updated
    ↓
User: "!now read it back"
    ↓
Claude: tool_use(read_file, {path: "hello.txt"})
    ↓
Tool executes → "Hello World"
    ↓
Claude: "The file contains: Hello World"
```

## Security Architecture

### Layers of Protection

```
┌─────────────────────────────────────┐
│     User Input Validation           │
│  - Command prefix required          │
│  - User allowlist (optional)        │
│  - Channel allowlist (optional)     │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│     Tool Authorization               │
│  - Tool enabled check               │
│  - Command allowlist                │
│  - Approval requirements            │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│     Execution Sandbox                │
│  - File path validation             │
│  - Command timeout                  │
│  - Output size limits               │
│  - Workspace isolation              │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│     Result Validation                │
│  - Success/error handling           │
│  - Safe error messages              │
└─────────────────────────────────────┘
```

### File Operation Security

```
User requests: read_file("../../etc/passwd")
    ↓
Resolve path: /workspace + ../../etc/passwd
    ↓
Result: /etc/passwd
    ↓
Check: Does NOT start with /workspace
    ↓
REJECT: "Access denied: file path outside of workspace"
```

## Extension Points

### Adding a New Tool

```typescript
// 1. Define tool
export const myTool: ToolDefinition = {
  name: 'my_tool',
  description: '...',
  inputSchema: {...},
  async execute(input, context) {
    // Implementation
    return { success: true, output: '...' };
  }
};

// 2. Register in src/tools/index.ts
registry.registerTool(myTool);

// 3. Tool is now available to Claude
```

### Adding a New Channel

```typescript
// 1. Create src/channels/mychannel.ts
export class MyChannelBot {
  async start() {
    // Connect to platform
    // Listen for messages
    // Use getLLMProvider() for AI
    // Use getToolRegistry() for tools
  }
}

// 2. Update src/index.ts
if (config.channels.mychannel.enabled) {
  await startMyChannel();
}

// 3. Add config to config.yml
channels:
  mychannel:
    enabled: true
    # ... options
```

### Adding a New LLM Provider

```typescript
// 1. Create src/llm/newprovider.ts
export class NewProvider implements LLMProvider {
  async chat(messages, tools) {
    // Call provider API
    return { content: '...', toolUses: [...] };
  }
}

// 2. Update src/llm/index.ts
case 'newprovider':
  providerInstance = new NewProvider();
  break;

// 3. Update config
llm:
  provider: newprovider
```

## Performance Considerations

### Bottlenecks

1. **LLM API Latency** (1-3 seconds)
   - Primary bottleneck
   - Use streaming for UX improvement

2. **Tool Execution** (varies)
   - Shell commands: 10-500ms
   - File operations: 1-10ms
   - Network requests: 100-1000ms

3. **Memory** (minimal impact)
   - Conversation history per user
   - Consider pruning after N messages

### Optimization Strategies

1. **Streaming Responses**
   - Gateway supports streaming
   - Discord needs message chunks

2. **Tool Result Caching**
   - Cache file reads
   - Cache command outputs (carefully)

3. **Conversation Pruning**
   - Keep last N messages
   - Always keep system message

## Deployment Architecture

### Local Development
```
Developer Machine
    ├── Node.js runtime
    ├── Config files
    └── Workspace directory
```

### VPS Deployment
```
VPS (Ubuntu/Debian)
    ├── systemd service
    ├── Node.js 22+
    ├── Config in /etc/my-assistant/
    ├── Workspace in /var/lib/my-assistant/
    └── Logs in /var/log/my-assistant/
```

### Docker Deployment
```
Docker Container
    ├── FROM node:22-alpine
    ├── Config via environment
    ├── Workspace as volume
    └── Exposed ports (8080)
```

## Monitoring & Debugging

### Logging Points

1. **Startup**
   - Configuration loaded
   - Tools registered
   - Services started

2. **Runtime**
   - Incoming messages
   - Tool executions
   - LLM requests/responses
   - Errors

3. **Shutdown**
   - Graceful cleanup
   - Service stops

### Debug Output

```
Registered tool: execute_shell
Registered tool: read_file
Registered tool: write_file
Registered tool: list_files
Initialized 4 tools
Gateway server listening on ws://127.0.0.1:8080
Discord bot logged in as MyBot#1234
✓ Started 2 service(s)
```

## Future Architecture Enhancements

### Planned (Easy)
- Persistent storage (SQLite)
- Logging to file
- Config hot-reload

### Planned (Medium)
- User authentication
- Rate limiting
- Metrics collection
- Health checks

### Planned (Advanced)
- Multi-agent orchestration
- Workflow engine
- Plugin system
- Distributed deployment

---

This architecture provides a solid foundation that's:
- Simple enough to understand
- Robust enough for real use
- Extensible enough to grow
- Secure enough for personal projects
