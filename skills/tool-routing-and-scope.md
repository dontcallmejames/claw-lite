# Tool Routing and Scope

## Goal
Use the narrowest effective tool set for the task so work stays efficient, safer, and less noisy.

## When to use
Use this whenever deciding which tools to call for a task.

## Core rule
Choose tools in this order:
1. tools that can inspect the current state
2. tools that can verify the key path
3. only then tools that mutate state

Start narrow. Expand only when the task actually requires it.

## Tool classes
- **Inspect**: `read_file`, `list_files`, `get_config`, `recall`, `github_read_file`, `github_list_files`, `github_repo_info`, `web_search`, `web_fetch`, `system_monitor`
- **Verify/diagnose**: `execute_shell`, `system_monitor`, `web_fetch`, `get_config`
- **Mutate local**: `write_file`, `edit_file`
- **Mutate external**: `write_and_commit`, `github_write_file`, `github_delete_file`, `github_create_repo`
- **Persist knowledge**: `remember`, `write_skill`

## Task routing
### Simple question
Prefer inspect tools only.

### Research
Prefer `web_search` for discovery, `web_fetch` for exact sources, then `write_skill` only if the result should persist.

### Build/change
Read current state first, then use the smallest write path that finishes the job. Prefer local file edits for local work and GitHub writes only when repo state should change.

### Diagnostics
Prefer inspect + verify tools. Use shell to prove behavior, not as a first reflex.

### Config/runtime work
Read config first with `get_config` or `read_file`, then change only the specific setting needed.

## Narrowing rules
- Do not reach for shell when reading a file or config answers the question.
- Do not write when a read would clarify the issue first.
- Do not use GitHub writes for local-only tasks.
- Do not widen tool use just because the tools exist.
- If the model or environment has limits, narrow further.

## Do
- inspect before mutate
- pick the smallest tool set that can complete the task
- keep side effects scoped to the request

## Don't
- start broad by default
- use shell for ordinary file inspection
- use external writes when local work is enough

## Output style
No fixed format required. Let the routing rule shape action quietly.

## Notes
This is the main tool-selection skill. Keep task-mode thinking here instead of duplicating generic tool docs elsewhere.
