# ClawLite

A lightweight, self-hosted AI assistant with multi-channel support, persistent memory, and an extensible tool system. Inspired by [OpenClaw](https://github.com/openclaw/openclaw).

## Features

- **Multi-provider LLM** — OpenAI (API key or OAuth), Anthropic, Ollama (local)
- **Channels** — Discord, Telegram, and a built-in Web UI
- **25+ tools** — GitHub, web search, file operations, shell commands, memory, and more
- **Persistent memory** — SQLite-backed with hierarchical DAG summarization (inspired by [lossless-claw](https://github.com/Martian-Engineering/lossless-claw))
- **Automatic context compaction** — never lose conversation history; old messages are summarized, not dropped
- **Full-text search** — FTS5 search across all past conversations
- **Model failover** — automatic retry with fallback models on API errors
- **Security** — SSRF protection, prompt injection defenses, DM pairing for unknown senders
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

Edit `.env` with your API keys (see "LLM Setup" below for which you need):

```env
BRAVE_SEARCH_API_KEY=your-brave-key
GITHUB_TOKEN=ghp_your-token
DISCORD_BOT_TOKEN=your-discord-bot-token
```

Edit `config.yml` to set your provider and model:

```yaml
llm:
  provider: openai    # openai | anthropic | ollama
  model: gpt-4o       # any model your provider supports
  fallback: []        # optional fallback models
```

### LLM Setup

You have two options for connecting to an LLM:

#### Option A: OpenAI OAuth (ChatGPT subscription — no API credits needed)

If you have a ChatGPT Plus/Pro/Team subscription, you can use OAuth to connect without an API key. This uses your subscription quota instead of paid API credits.

```bash
npm run login
```

This opens a browser window to sign in with your ChatGPT account. Once authenticated, the token is saved to `~/.davos/auth.json` and refreshed automatically. Check status with:

```bash
npm run login:status
```

Then set your model in `config.yml`:

```yaml
llm:
  provider: openai
  model: gpt-4o          # or gpt-4o-mini, etc.
```

No `OPENAI_API_KEY` needed in `.env` when using OAuth.

#### Option B: API Key (OpenAI, Anthropic, or Ollama)

Add your API key to `.env`:

```env
# For OpenAI:
OPENAI_API_KEY=sk-your-key-here

# For Anthropic:
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

For **Ollama** (free, local), just install [Ollama](https://ollama.ai), pull a model (`ollama pull qwen2.5:14b`), and set:

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
2. Copy the token to `config.yml` under `telegram.token`
3. Get your chat ID from [@userinfobot](https://t.me/userinfobot) and add it to `telegram.allowed_chat_ids`

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
| `tools` | `profile` | `full` | `minimal`, `coding`, or `full` |
| `tools` | `deny` | `[]` | Tool names to block |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | For OpenAI (API key mode) | Not needed if using OAuth (`npm run login`) |
| `ANTHROPIC_API_KEY` | For Anthropic | Anthropic API key |
| `BRAVE_SEARCH_API_KEY` | For web search | [Brave Search](https://api.search.brave.com) key |
| `GITHUB_TOKEN` | For GitHub tools | PAT with `repo` scope |
| `DISCORD_BOT_TOKEN` | For Discord | Discord bot token |

## Tools (25+)

| Tool | Description |
|------|-------------|
| `read_file` / `write_file` / `edit_file` | File operations (absolute or relative paths) |
| `web_search` | Brave Search with content wrapping |
| `web_fetch` | Fetch URLs with SSRF protection |
| `execute_shell` | Shell commands (safe/blocked/allowed tiers) |
| `remember` / `recall` | Key-value persistent memory |
| `memory_search` | Full-text search across conversation history |
| `memory_query` | Answer questions from past conversations |
| `github_*` | Read, write, list, search, commit to GitHub repos |
| `send_message` / `schedule_message` | Send or schedule messages to Telegram/Discord (one-shot reminders or recurring) |
| `morning_briefing` | Daily briefing (weather, news, GitHub) |
| `switch_model` | Change LLM model at runtime |

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
  Telegram ┘   (agentic loop)  ├─ Tool Registry (25+ tools)
                               └─ Memory (SQLite + DAG summaries)
```

All conversations persist in SQLite. Old messages are summarized into a hierarchical DAG — leaf summaries from raw messages, condensed summaries from leaves. Context is assembled from recent messages + older summaries within the model's token budget.

## Skills

Drop `.md` files in `skills/` to give your assistant persistent knowledge:

```markdown
# skills/deploy.md
When asked to deploy, always run tests first, then build, then deploy to staging.
```

Skills are injected into every system prompt automatically.

## License

MIT
