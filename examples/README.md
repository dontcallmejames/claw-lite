# Examples

This directory contains example scripts and alternative implementations.

## Files

### Test Clients

**`test-client.js`** - Simple WebSocket test client
- Connects to the gateway
- Sends a test message
- Shows the response
- Usage: `node test-client.js`

**`test-tools.js`** - Test client with tool calling
- Tests tool execution
- Demonstrates file operations
- Usage: `node test-tools.js`

### Web Chat Alternatives

**`web-chat.html`** - Original web chat interface
- Static configuration
- Self-contained
- Edit the file directly to customize

**`web-chat-dynamic.html`** - Dynamic configuration version
- Loads from `assistant-config.json`
- **Note:** Only works when served through a web server (not file://)
- Kept for reference

## Main Web Chat

The main web chat is now **`../index.html`** in the root directory.

## Usage Examples

### Test the Gateway
```bash
cd ..
node examples/test-client.js
```

### Test Tool Calling
```bash
cd ..
node examples/test-tools.js
```

### Use Alternative Web Chat
```bash
# Open from file system
start examples/web-chat.html
```

## Note

These examples are kept for reference and testing purposes. The main web interface is `index.html` in the parent directory.
