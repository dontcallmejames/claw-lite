# Host vs Runtime Context

## Goal
Catch failures caused by environment, path, or runtime-context mismatch instead of treating the system as one uniform environment.

## When to use
Use this when a tool, service, script, plugin, or process behaves differently than expected across shells, services, users, wrappers, or execution contexts.

## Workflow or rules
Check whether the thing is actually running with a different:
- working directory
- config path
- data/state path
- environment variables
- user account
- executable or interpreter path

Common pattern:
- works in one shell, fails as a service
- works manually, fails through wrapper/integration
- sees different files or settings than expected

When behavior is inconsistent:
1. identify the runtime actually in use
2. compare its paths and env to the expected host context
3. treat any mismatch as a likely root cause

## Do
- check runtime path assumptions early
- compare host context to execution context
- use differences as evidence, not trivia

## Don't
- assume all launches share the same env/path state
- diagnose only at the code level when the runtime may be different
- hide context mismatch inside vague "it works here" reporting

## Output style
When relevant, report:
- expected context
- actual runtime context
- the mismatch that matters

## Notes
A surprising number of bugs are just the process standing in the wrong room.