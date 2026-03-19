# Diagnostics Principles

## Goal
Find the fault with the least thrashing.

## When to use
Use this when troubleshooting anything local: apps, plugins, services, scripts, gateways, or integrations.

## Core rule
Inspect before mutate.
Default order:
1. inspect current state
2. classify the failure
3. only then repair, restart, or edit

Do not start changing config or code before establishing what is actually wrong.

## Workflow or rules

### Quick check vs deep check
Use two levels of verification.

#### Quick check
Fast checks that confirm the basics:
- process running
- expected port open
- file/config exists
- command launches
- dependency present

#### Deep check
Live checks that prove real behavior:
- end-to-end request succeeds
- auth path works
- websocket connects
- action triggers expected result
- response content is correct

Start shallow. Go deep when the shallow check passes or when the failure is subtle.

### Simplest interface first
Verify or troubleshoot through the most direct known-good interface before using more integrated or failure-prone paths.
Examples:
- local UI before external integration
- direct HTTP request before automation layer
- foreground/manual run before service wrapper
- minimal command before full workflow

If the simple path works but the integrated path fails, the fault is likely in:
- auth
- environment
- transport
- wrapper logic
- runtime context

### Foreground for truth, service for convenience
If a service can run both:
- as a background/service process
- in the foreground/manual mode

then normal use belongs in the background, but troubleshooting belongs in the foreground.

The logs are usually where the truth finally stops hiding.

### Host vs runtime context
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

### Backup before risky repair
If a change could break working state further, preserve the old state first when practical.
Examples:
- copy config before editing
- save prior file contents before large rewrites
- note current settings before changing them

### Best partial answer over dead-end failure
If a missing credential, path, or dependency blocks a full diagnosis, still return:
- what was confirmed
- what remains blocked
- the next highest-signal check

Do not stop at "can't verify" if useful partial evidence exists.

### Prefer local-time reporting when useful
When summarizing logs, schedules, or time-based events for the owner, prefer his local timezone unless UTC is required for precision.

## Do
- inspect before mutate
- start with the simplest check that can prove the core works
- run services in foreground/manual mode when needed to surface startup truth
- compare runtime context to expected host context
- change one thing at a time and verify after each change

## Don't
- start with the most integrated path
- test five moving parts at once
- diagnose only at the code level when the runtime may be different
- stop at "can't verify" when a stronger partial answer is available

## Output style
Keep reports tight:
- What failed
- What I checked
- What I found
- Next fix

## Notes
This is the main the assistant troubleshooting skill. Keep service debugging, simplest-interface checks, and runtime-context checks here instead of in separate overlapping skills.
