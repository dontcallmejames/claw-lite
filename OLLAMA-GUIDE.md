# Using Ollama with Your AI Assistant

Run your AI assistant completely locally with Ollama - no API costs, no internet required!

## What is Ollama?

Ollama lets you run large language models locally on your machine. Models like Llama 3.2, Mistral, Qwen, and many others can run on your own hardware.

## Quick Start (5 minutes)

### 1. Install Ollama

**Windows/Mac/Linux:**
```bash
# Visit https://ollama.ai and download the installer
# Or on Mac/Linux:
curl -fsSL https://ollama.ai/install.sh | sh
```

### 2. Download a Model

```bash
# Recommended: Llama 3.2 (3B parameters - fast, good quality)
ollama pull llama3.2

# Or try others:
ollama pull mistral        # Mistral 7B - very capable
ollama pull qwen2.5        # Qwen 2.5 - excellent for code
ollama pull llama3.1       # Llama 3.1 - larger, more capable
ollama pull phi3           # Phi-3 - small and fast
```

### 3. Configure Your Assistant

Edit `config.yml`:
```yaml
llm:
  provider: ollama
  model: llama3.2          # The model you pulled
  maxTokens: 4096
  temperature: 0.7
```

### 4. Run!

```bash
npm start
```

**That's it!** Your assistant now runs completely locally.

## Available Models

### Small & Fast (Good for most tasks)
| Model | Size | RAM | Speed | Use Case |
|-------|------|-----|-------|----------|
| `llama3.2` | 3B | 4GB | ⚡⚡⚡ | General purpose, fast |
| `phi3` | 3.8B | 4GB | ⚡⚡⚡ | Fast, efficient |
| `tinyllama` | 1.1B | 2GB | ⚡⚡⚡⚡ | Very fast, basic tasks |

### Medium (Better quality)
| Model | Size | RAM | Speed | Use Case |
|-------|------|-----|-------|----------|
| `mistral` | 7B | 8GB | ⚡⚡ | Balanced, capable |
| `qwen2.5` | 7B | 8GB | ⚡⚡ | Excellent for code |
| `llama3.1` | 8B | 8GB | ⚡⚡ | Most capable |

### Large (Best quality, needs powerful hardware)
| Model | Size | RAM | Speed | Use Case |
|-------|------|-----|-------|----------|
| `llama3.1:70b` | 70B | 48GB+ | ⚡ | Maximum capability |
| `qwen2.5:32b` | 32B | 24GB+ | ⚡ | Large context, code |

### Code-Specialized
| Model | Size | RAM | Speed | Use Case |
|-------|------|-----|-------|----------|
| `codellama` | 7B | 8GB | ⚡⚡ | Code generation |
| `qwen2.5-coder` | 7B | 8GB | ⚡⚡ | Code, debugging |
| `deepseek-coder` | 6.7B | 8GB | ⚡⚡ | Code completion |

## Configuration Examples

### For Fast Responses (Development)
```yaml
llm:
  provider: ollama
  model: llama3.2
  maxTokens: 2048
  temperature: 0.7
```

### For Better Quality
```yaml
llm:
  provider: ollama
  model: mistral
  maxTokens: 4096
  temperature: 0.8
```

### For Code Tasks
```yaml
llm:
  provider: ollama
  model: qwen2.5-coder
  maxTokens: 4096
  temperature: 0.3  # Lower temp for code
```

### For Maximum Quality (Needs powerful hardware)
```yaml
llm:
  provider: ollama
  model: llama3.1:70b
  maxTokens: 8192
  temperature: 0.9
```

## Advanced Configuration

### Custom Ollama Host

If running Ollama on another machine or port:

Edit `.env`:
```env
OLLAMA_BASE_URL=http://192.168.1.100:11434
```

Or for remote server:
```env
OLLAMA_BASE_URL=https://my-ollama-server.com
```

### Model Variants

Many models have different sizes:
```bash
ollama pull llama3.1:8b     # 8 billion parameters
ollama pull llama3.1:70b    # 70 billion parameters
ollama pull mistral:7b      # Default 7B
ollama pull mistral:latest  # Latest version
```

## Tool Calling with Ollama

**Note:** Ollama models handle tools differently than Claude:

- Claude has native tool calling support
- Ollama models use JSON in their responses
- Our implementation parses JSON tool calls from the response
- Works well with models like `qwen2.5` and `mistral`

### Tips for Better Tool Usage:
1. Use newer models (llama3.1, qwen2.5, mistral)
2. Be explicit in your prompts: "Use the list_files tool"
3. Lower temperature (0.3-0.5) for more consistent tool usage

## Performance Optimization

### GPU Acceleration

Ollama automatically uses GPU if available:
- **NVIDIA GPU:** Automatically detected
- **AMD GPU:** Supported on Linux
- **Apple Silicon:** Metal acceleration automatic
- **CPU Only:** Still works, just slower

### Speed Up Responses

```bash
# Use smaller models for faster responses
ollama pull llama3.2        # Fast

# Or quantized versions (smaller, faster)
ollama pull llama3.1:8b-q4  # 4-bit quantized
```

### Reduce Memory Usage

```bash
# Pull quantized models
ollama pull mistral:7b-q4    # Uses less RAM

# Or use smaller models
ollama pull phi3             # Only 4GB RAM
```

## Comparing Providers

### Ollama (Local)
**Pros:**
- ✅ Completely free
- ✅ No internet required
- ✅ Privacy - data never leaves your machine
- ✅ No rate limits
- ✅ No API costs

**Cons:**
- ❌ Requires good hardware
- ❌ Slower than cloud APIs
- ❌ Models not as capable as Claude/GPT-4
- ❌ Tool calling less reliable

### Claude (Cloud)
**Pros:**
- ✅ Most capable models
- ✅ Fast responses
- ✅ Excellent tool calling
- ✅ Works on any hardware

**Cons:**
- ❌ Costs money ($3-20/month typical)
- ❌ Requires internet
- ❌ Rate limits
- ❌ Data sent to Anthropic

### When to Use Which

**Use Ollama when:**
- ✅ You have decent hardware (8GB+ RAM)
- ✅ Privacy is important
- ✅ You want zero ongoing costs
- ✅ Internet is unreliable
- ✅ Learning/experimenting

**Use Claude when:**
- ✅ You need best quality responses
- ✅ Complex tasks requiring reasoning
- ✅ Reliable tool calling needed
- ✅ You're okay with API costs

## Troubleshooting

### "Failed to connect to Ollama"

**Solution 1:** Make sure Ollama is running
```bash
# Check if Ollama is running
curl http://127.0.0.1:11434

# If not, start it (Mac/Linux)
ollama serve

# Windows: Ollama runs as a service automatically
```

**Solution 2:** Check the URL
```env
# In .env
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

### Model Not Found

```bash
# List installed models
ollama list

# Pull the model
ollama pull llama3.2
```

### Out of Memory

**Solutions:**
1. Use smaller model: `ollama pull llama3.2`
2. Use quantized version: `ollama pull mistral:7b-q4`
3. Close other applications
4. Increase swap space (Linux)

### Slow Responses

**Solutions:**
1. Use smaller model
2. Reduce maxTokens in config
3. Use GPU acceleration
4. Try quantized models

### Tools Not Working

**Solutions:**
1. Use better models (qwen2.5, mistral, llama3.1)
2. Lower temperature (0.3-0.5)
3. Be explicit: "Use the read_file tool to read config.yml"
4. Check model supports tool calling

## Example Workflows

### Development Setup (Fast iteration)
```yaml
llm:
  provider: ollama
  model: llama3.2
  maxTokens: 2048
  temperature: 0.7
```

### Production Setup (Best quality)
```yaml
llm:
  provider: ollama
  model: llama3.1
  maxTokens: 4096
  temperature: 0.8
```

### Code Assistant
```yaml
llm:
  provider: ollama
  model: qwen2.5-coder
  maxTokens: 4096
  temperature: 0.3
```

### Privacy-First Setup
```yaml
llm:
  provider: ollama
  model: mistral
  maxTokens: 4096
  temperature: 0.8

# In .env - no API keys needed!
# OLLAMA_BASE_URL=http://127.0.0.1:11434
```

## Testing Your Setup

### 1. Test Ollama Connection

```bash
curl http://127.0.0.1:11434/api/tags
```

Should return list of installed models.

### 2. Test Model Response

```bash
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Why is the sky blue?",
  "stream": false
}'
```

### 3. Test in Your Assistant

On Discord:
```
!hello, can you introduce yourself?
!what's 2+2?
!list files in the workspace
```

## Hardware Requirements

### Minimum (Basic usage)
- **CPU:** Modern quad-core
- **RAM:** 8GB
- **Model:** llama3.2, phi3

### Recommended (Good experience)
- **CPU:** 6+ core or
- **GPU:** NVIDIA with 6GB+ VRAM
- **RAM:** 16GB
- **Model:** mistral, qwen2.5, llama3.1

### Optimal (Best experience)
- **CPU:** 8+ core or
- **GPU:** NVIDIA with 12GB+ VRAM
- **RAM:** 32GB+
- **Model:** llama3.1:70b, qwen2.5:32b

## Commands Reference

```bash
# Install/Update Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# List available models online
ollama list

# Pull a model
ollama pull llama3.2

# Remove a model
ollama rm llama3.2

# Run Ollama server
ollama serve

# Test a model
ollama run llama3.2

# Get model info
ollama show llama3.2

# Update a model
ollama pull llama3.2
```

## Switching Between Providers

You can easily switch between Ollama and Claude:

### Use Ollama (Local)
```yaml
llm:
  provider: ollama
  model: llama3.2
```

### Use Claude (Cloud)
```yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-5-20250929
```

Just change the config and restart!

## Resources

- **Ollama Website:** https://ollama.ai
- **Model Library:** https://ollama.ai/library
- **GitHub:** https://github.com/ollama/ollama
- **Discord:** https://discord.gg/ollama

## Summary

✅ **Free Forever** - No API costs
✅ **Private** - Data never leaves your machine
✅ **No Internet** - Works offline
✅ **Easy Setup** - 5 minutes to running
✅ **Multiple Models** - Choose what fits your hardware

Perfect for learning, development, and privacy-focused deployments!

---

**Get Started Now:**
```bash
ollama pull llama3.2
# Edit config.yml: provider: ollama, model: llama3.2
npm start
```
