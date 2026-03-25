# ClawLite

A lightweight, self-hosted AI assistant with multi-channel support, persistent memory, and an extensible tool system. Inspired by [OpenClaw](https://github.com/openclaw/openclaw).

## Features

- **Multi-provider LLM** — OpenAI (API key or OAuth), Anthropic, Ollama (local)
- **Channels** — Discord, Telegram, and a built-in Web UI
- **18 tools** — 4 consolidated domain tools + 14 standalones covering files, system, memory, GitHub, web, messaging, and self-management
- **Persistent memory** — SQLite-backed with hierarchical DAG summarization (inspired by [lossless-claw](https://github.com/Martian-Engineering/lossless-claw))
- **Automatic context compaction** — never lose conversation history; old messages are summarized, not dropped
- **Cron job outputs persisted** — scheduled job results are saved to SQLite and searchable via `memory_search`
- **Full-text search** — FTS5 search across all past conversations
- **Model failover** — automatic retry with fallback models on API errors
- **Security hardening** — SSRF protection, 32-pattern prompt injection defenses, requiresConfirmation gate, shell allowlist, file sandbox, path traversal prevention
- **Gateway authentication** — set `GATEWAY_SECRET` to require Bearer token auth on WebSocket connections and `/webhook`
- **Cron scheduler** — run tasks on a schedule with channel notifications
- **Customizable persona** — edit `SOUL.md` and `IDENTITY.md` to give your assistant any personality

## Quick Start

### Prerequisites

- **Node.js 20+**
- An LLM provider: OpenAI API key, Anthropic API key, or [Ollama](https://ollama.ai) running locally

### Install

```bash
git clone https://github.com/dontcallmejames/claw-lite.git
cd claw-lite
npm install
```

### Configure

```bash
cp .env.example .env
cp config.example.yml config.yml
```

Edit `.env` with your API keys:

```env
BRAVE_SEARCH_API_KEY=your-brave-key
GITHUB_TOKEN=ghp_your-token
DISCORD_BOT_TOKEN=your-discord-bot-token
TELEGRAM_TOKEN=your-telegram-bot-token
```

Edit `config.yml` to set your provider and model:

```yaml
llm:
  provider: openai    # openai | anthropic | ollama
  model: gpt-4o       # any model your provider supports
  fallback: []        # optional fallback models
```

### LLM Setup

#### Option A: OpenAI OAuth (ChatGPT subscription — no API credits needed)

If you have a ChatGPT Plus/Pro/Team subscription, you can use OAuth to connect without an API key:

```bash
npm run login
```

This opens a browser window to sign in with your ChatGPT account. Check status with:

```bash
npm run login:status
```

#### Option B: API Key (OpenAI, Anthropic, or Ollama)

Add your API key to `.env`:

```env
# For OpenAI:
OPENAI_API_KEY=sk-your-key-here

# For Anthropic:
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

For **Ollama** (free, local), install [Ollama](https://ollama.ai), pull a model, and set:

```yaml
llm:
  provider: ollama
  model: qwen2.5:14b
```

### Personalize

Edit these files to customize your assistant's personality:

- **`SOUL.md`** — personality, tone, behavioral rules
- **`IDENTITY.md`** — name, capabilities, owner info
- **`USER.md`** — create this file with info about yourself (see `USER.example.md`)

### Run

```bash
npm run build
npm start
```

Open **http://127.0.0.1:8080** in your browser.

For development with auto-reload:

```bash
npm run dev
```

## Channel Setup

### Web UI (built-in)

No setup needed. Available at `http://127.0.0.1:8080` when the server is running.

### Discord

1. Create an application at [discord.com/developers](https://discord.com/developers/applications)
2. Go to **Bot** tab, click **Reset Token**, copy it to `.env` as `DISCORD_BOT_TOKEN`
3. Enable **Message Content Intent** under Bot > Privileged Gateway Intents
4. Go to **OAuth2 > URL Generator**, select `bot` scope with `Send Messages` + `Read Message History` permissions
5. Use the generated URL to invite the bot to your server
6. In `config.yml`, set `channels.discord.enabled: true`

### Telegram

1. Message [@BotFather](https://t.me/BotFather) and create a new bot
2. Copy the token to `.env` as `TELEGRAM_TOKEN`
3. Get your chat ID from [@userinfobot](https://t.me/userinfobot) and add it to `telegram.allowed_chat_ids` in `config.yml`

## Configuration

### config.yml

| Section | Field | Default | Description |
|---------|-------|---------|-------------|
| `llm` | `provider` | `openai` | `openai`, `anthropic`, or `ollama` |
| `llm` | `model` | — | Model name (e.g. `gpt-4o`, `claude-sonnet-4`) |
| `llm` | `temperature` | `0.8` | Response randomness (0.0 - 2.0) |
| `llm` | `fallback` | `[]` | Fallback models on API failure |
| `gateway` | `port` | `8080` | HTTP/WebSocket port |
| `security` | `dmPolicy` | `open` | `open`, `pairing`, or `off` |
| `tools` | `deny` | `[]` | Tool names to block |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | For OpenAI (API key mode) | Not needed if using OAuth (`npm run login`) |
| `ANTHROPIC_API_KEY` | For Anthropic | Anthropic API key |
| `BRAVE_SEARCH_API_KEY` | For web search | [Brave Search](https://api.search.brave.com) key |
| `GITHUB_TOKEN` | For GitHub tools | PAT with `repo` scope |
| `DISCORD_BOT_TOKEN` | For Discord | Discord bot token |
| `TELEGRAM_TOKEN` | For Telegram | Telegram bot token from @BotFather |
| `GATEWAY_SECRET` | Optional | Bearer token required for WebSocket connections and `/webhook` POST requests. Leave unset to allow unauthenticated local access. |

## Tools (18)

### Domain Tools (consolidated, action-based)

| Tool | Actions | Description |
|------|---------|-------------|
| `file` | `read`, `write`, `edit`, `list`, `delete`, `move`, `mkdir` | Local filesystem operations. All paths sandboxed to `basePath`; protected files (`.env`, `config.yml`, etc.) blocked from write/delete. |
| `system` | `monitor`, `shell`, `list_processes`, `process_info`, `kill_process` | System monitoring and process management. Shell uses a SAFE/BLOCKED/allowed-list tier; metacharacter injection blocked. |
| `memory` | `save`, `recall`, `search`, `describe`, `query`, `delete` | Persistent key-value memory + full-text search over conversation history and summaries. |
| `github` | `read_file`, `write_file`, `delete_file`, `list_files`, `create_repo`, `search_code`, `repo_info` | GitHub API operations. All paths encoded to prevent traversal. |

### Standalone Tools (14)

| Tool | Description |
|------|-------------|
| `schedule_message` | Schedule future messages via cron expressions (5-field, per-field range validated). Requires user confirmation. |
| `send_message` | Send an immediate message to Telegram or Discord. |
| `morning_briefing` | Fetch weather (wttr.in) + BBC world headlines + TechCrunch tech news concurrently. |
| `web_fetch` | Fetch and parse a URL. 30s timeout; SSRF protection blocks private/internal addresses. |
| `web_search` | Brave Search API integration. Results wrapped in injection-safe boundaries. |
| `write_and_commit` | Write a file locally and commit it to a GitHub repo in one atomic operation (GitHub first). |
| `write_skill` | Create or update a skill file in `skills/`. Path traversal sanitized. Requires confirmation. |
| `get_config` | Read the current `config.yml` settings. |
| `update_config` | Update a config field by key path (e.g. `llm.model`). Injection-safe regex anchoring. Requires confirmation. |
| `install_dependency` | Install an npm package. Package name validated against npm naming rules; uses `execFile` to avoid shell injection. Requires confirmation. |
| `build_assistant` | Recompile TypeScript source (`npm run build`). |
| `restart_assistant` | Restart the assistant process. Requires confirmation. |
| `switch_model` | Switch LLM model at runtime; updates `config.yml` and restarts. |
| `take_screenshot` | Capture the primary screen on Windows (PowerShell). Filename sanitized to prevent injection. |

## Security Hardening

This release includes a comprehensive security pass across the tool layer:

- **Prompt injection defenses** — External content (web pages, GitHub files, memory, RSS feeds) is wrapped with randomized boundary IDs and filtered through 32 injection pattern regexes before being passed to the model.
- **requiresConfirmation gate** — 5 irreversible tools (`schedule_message`, `restart_assistant`, `update_config`, `install_dependency`, `write_skill`) require `confirmed: true` in the tool input. The registry intercepts unconfirmed calls and instructs the model to ask the user first.
- **Shell safety** — Three-tier command policy: SAFE_COMMANDS always allowed, BLOCKED_COMMANDS always denied, everything else requires explicit listing in `config.yml`. Shell metacharacters (`& | ; < > \` $ () ! { }`) are rejected outright.
- **File sandbox** — All `file` tool operations resolve paths relative to `basePath` and verify the resolved path stays inside it. A protected file set (`.env`, `config.yml`, `package.json`, etc.) blocks write, edit, delete, and move operations.
- **Cron validation** — `schedule_message` validates all 5 cron fields against their numeric ranges before writing. A write lock prevents concurrent calls from losing jobs via interleaved read-modify-write.
- **GitHub path traversal prevention** — `encodeURIComponent` applied to owner, repo, and path-traversal-dangerous segments (`..`, `.`) in all GitHub API requests.
- **Telegram token moved to env var** — Token is no longer stored in `config.yml`; read from `TELEGRAM_TOKEN` environment variable only.
- **SSRF protection** — `web_fetch` validates URLs against a blocklist of private/internal address ranges before making requests.
- **Gateway authentication** — Set `GATEWAY_SECRET` in `.env` to require `Authorization: Bearer <secret>` on all WebSocket connections and `POST /webhook` requests.
- **Cron output persistence** — Scheduled job results are written to the SQLite memory store under the `cron` session, making them searchable via `memory_search`.

## DM Pairing

Set `security.dmPolicy: pairing` in config.yml. Unknown senders get a 6-char code:

```bash
npm run pairing approve <CODE>    # approve a sender
npm run pairing list              # show pending codes
```

## Architecture

```
  Web UI ──┐
  Discord ─┤── Gateway Server ─┬─ LLM Provider (failover)
  Telegram ┘   (agentic loop)  ├─ Tool Registry (18 tools)
                               └─ Memory (SQLite + DAG summaries)
```

All conversations persist in SQLite. Old messages are summarized into a hierarchical DAG — leaf summaries from raw messages, condensed summaries from leaves. Context is assembled from recent messages + older summaries within the model's token budget.

Cron job outputs are also persisted to SQLite under a dedicated `cron` session, so scheduled task results are searchable alongside regular conversation history.

## Skills

Drop `.md` files in `skills/` to give your assistant persistent knowledge:

```markdown
# skills/deploy.md
When asked to deploy, always run tests first, then build, then deploy to staging.
```

Skills are injected into every system prompt automatically. Use the `write_skill` tool to create them from a conversation.

## License

MIT
