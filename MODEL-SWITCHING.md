# Model Switching Guide

Deckard supports multiple models optimized for different tasks.

## Available Models

### Llama 3.3 (Default)
- **Use for:** Casual chat, general questions, everyday tasks
- **Tools:** Disable tools (uncheck "Enable Tools" in web UI)
- **Speed:** Fast
- **Quality:** Good for conversation
- **Temperature:** 0.8 (creative)

### DeepSeek-R1:14b
- **Use for:** Complex problems, reasoning tasks, code analysis
- **Tools:** Keep tools enabled
- **Speed:** Slower (shows reasoning process)
- **Quality:** Excellent for logic and analysis
- **Temperature:** 0.7 (focused)

## How to Switch Models

### Manual Switch
Edit `config.yml`:
```yaml
llm:
  model: llama3.3           # or deepseek-r1:14b
```

Then restart:
```bash
npm start
```

### Automatic Switch (via Deckard)
When using DeepSeek with tools enabled, ask Deckard to switch:

- "Switch to Llama for casual chat"
- "Use DeepSeek for this complex problem"
- "Switch to the reasoning model"

Deckard will update the config and restart automatically.

## Workflow Recommendations

### Everyday Use
1. Run Llama 3.3 (default)
2. Disable tools in web UI
3. Chat normally - fast and conversational

### When You Need Deep Thinking
1. Ask Deckard to switch to DeepSeek
2. Enable tools in web UI
3. Deckard restarts automatically
4. Refresh browser after ~5 seconds
5. Complete your task
6. Switch back to Llama when done

## Tool Support by Model

| Model | Tool Support | Method |
|-------|-------------|--------|
| Llama 3.3 | ❌ No | No native function calling |
| DeepSeek-R1 | ✅ Yes | Native function calling |
| Mistral | ⚠️ Limited | Possible via prompting |
| Qwen 2.5 | ✅ Yes | Native function calling |

## Tips

- Keep both models pulled in Ollama for fast switching
- Llama is better for creative tasks and conversation
- DeepSeek is better for technical tasks and reasoning
- The model switch tool only works when tools are enabled (DeepSeek)
- Update the model name in `index.html` line 243 after switching

## Pulling Models

```bash
ollama pull llama3.3
ollama pull deepseek-r1:14b
```

Both models stay on disk - switching just changes which one runs.
