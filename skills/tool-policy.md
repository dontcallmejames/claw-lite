# Tool Policy

## Goal
Use the right tools for the job with less thrashing, fewer risky choices, and clearer model/tool boundaries.

## When to use
Use this whenever deciding which tools to call, especially for build work, research, diagnostics, or messaging.

## Tool groups
Think in capability groups first, then specific tools.

- **fs**: `read_file`, `write_file`, `edit_file`, `list_files`
- **github**: `write_and_commit`, `github_read_file`, `github_list_files`, `github_write_file`, `github_delete_file`, `github_repo_info`, `github_search_code`, `github_create_repo`
- **web**: `web_search`, `web_fetch`
- **memory**: `remember`, `recall`
- **runtime**: `execute_shell`, `system_monitor`, `get_config`, `update_config`, `switch_model`
- **skills**: `write_skill`

## Task-mode profiles
Choose a narrow profile based on the job.

### Minimal
Use for simple questions or checks.
- prefer: `get_config`, `read_file`, `list_files`, `recall`
- avoid writes unless needed

### Build
Use for creating or changing code, configs, or repo files.
- prefer: `read_file`, `edit_file`, `write_file`, `write_and_commit`, `github_*`
- use `execute_shell` only when it verifies behavior or runs the thing

### Research
Use for docs lookup and comparisons.
- prefer: `web_search` for discovery, `web_fetch` for exact pages, `read_file` for local docs/notes, `write_skill` for durable patterns
- avoid speculative answers when source text is available

### Diagnostics
Use for troubleshooting local apps, services, plugins, or gateways.
- prefer: `system_monitor`, `execute_shell`, `get_config`, `read_file`
- inspect before mutate
- verify after each change

### Messaging
Use for channel-specific communication work.
- prefer only the tools actually needed for the target surface
- keep formatting and mention behavior channel-safe

## Provider and model policy
Not every model is fit for tool work.

- prefer tool-capable models for file, shell, config, and GitHub tasks
- treat model/tool reliability as a real constraint, not a theory
- **never switch to DeepSeek-R1 for tool work**
- if a model is weak with tools, narrow to read-only or avoid tool-dependent plans

## Layered narrowing rule
Decide tool access in layers:
1. base task-mode profile
2. model/provider limitations
3. explicit user request or task-specific override

Do not start from full access if a narrow profile will do.

## Do
- choose the smallest tool set that can finish the job
- group tools mentally by capability
- let the task shape the tool choice
- respect model limitations for tool reliability

## Don't
- reach for shell or writes before inspection when reading would answer it
- use broad tool access just because it exists
- switch to models that break tool calling
- guess when a source can be fetched or read

## Output style
No special format required. Let the policy influence action quietly.

## Notes
This is a the assistant-native way to stay effective without becoming a giant all-tools-at-once mess.