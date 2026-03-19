# Quick Start Guide

Get your AI assistant running in 5 minutes!

## Step 1: Install Dependencies

```bash
cd my-assistant
npm install
```

## Step 2: Get Your API Keys

### Anthropic (Required)
1. Go to https://console.anthropic.com/
2. Sign in or create account
3. Click "API Keys"
4. Create new key
5. Copy the key (starts with `sk-ant-`)

### Discord (Optional, but recommended)
1. Go to https://discord.com/developers/applications
2. Click "New Application" → Name it
3. Go to "Bot" tab → "Add Bot"
4. Click "Reset Token" → Copy it
5. Enable "MESSAGE CONTENT INTENT" (under Privileged Gateway Intents)
6. Go to "OAuth2" → "URL Generator"
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Read Messages/View Channels`, `Read Message History`
7. Copy generated URL and open in browser to invite bot to your server

## Step 3: Configure

```bash
cp .env.example .env
```

Edit `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
DISCORD_BOT_TOKEN=your-bot-token-here
```

Create workspace:
```bash
mkdir workspace
```

## Step 4: Run

```bash
npm start
```

You should see:
```
Registered tool: execute_shell
Registered tool: read_file
Registered tool: write_file
Registered tool: list_files
Initialized 4 tools
Gateway server listening on ws://127.0.0.1:8080
Discord bot logged in as YourBot#1234

✓ Started 2 service(s)
Press Ctrl+C to stop
```

## Step 5: Test on Discord

In your Discord server, type:
```
!hello
```

The bot should respond!

Try:
```
!what files are in the workspace?
!execute command: date
!help me write a hello world file
```

## Common Issues

**Bot doesn't respond:**
- Make sure MESSAGE CONTENT INTENT is enabled
- Check bot has read/send permissions
- Verify you're using `!` prefix

**"Missing API key":**
- Double-check `.env` file exists and has correct keys
- No spaces around the `=` sign
- Keys should NOT be in quotes

**"Command not allowed":**
- Edit `config.yml` and add the command to `tools.shell.allowedCommands`

## What's Next?

- Read [README.md](README.md) for detailed documentation
- Customize `config.yml` to your needs
- Add more tools in `src/tools/`
- Check out [OpenClaw](https://github.com/openclaw/openclaw) for inspiration

## Example Interactions

```
User: !can you list files in the workspace?
Bot: I'll check the workspace directory for you.
     (empty directory)

User: !write a hello world message to hello.txt
Bot: I'll create that file for you.
     File written successfully: hello.txt

User: !read hello.txt
Bot: Here's the content of hello.txt:
     Hello World!

User: !what's today's date?
Bot: Let me check for you.
     Sunday, February 16, 2026
```

Enjoy your AI assistant! 🤖
