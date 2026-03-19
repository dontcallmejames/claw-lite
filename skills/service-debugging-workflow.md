# Service Debugging Workflow

Use this when a local app, plugin, gateway, server, or background process is failing, flaky, or behaving differently than expected.

## Goal

Find the fault quickly without guesswork.

Prefer the shortest path to identifying whether the problem is:
- startup
- config
- environment/path
- connectivity
- auth
- runtime logic

## Core Rule

Run the thing in the simplest observable mode first.

If a service can run both:
- as a background/service process
- in the foreground/manual mode

then normal use belongs in the background, but troubleshooting belongs in the foreground.

The logs are usually where the truth finally stops hiding.

## Workflow

### 1) Confirm what is actually failing
Establish:
- what the owner expected to happen
- what actually happened
- whether the failure is total, partial, or intermittent

Separate:
- process won’t start
- process starts but won’t connect
- process connects but behaves wrong
- process works once then dies

### 2) Check basic status
Look for:
- is the process running
- is the expected port open
- is the expected executable/path being used
- are required files/config present

Do not assume “installed” means “running.”

### 3) Run in foreground/manual mode
If possible, start it directly in a terminal instead of through the service wrapper.

Use this to catch:
- startup errors
- missing dependencies
- bad paths
- permission problems
- config parse failures
- immediate disconnect reasons

### 4) Verify runtime paths
When behavior is confusing, check whether the process is using the wrong:
- config file
- working directory
- data/state directory
- environment variables
- user account context

Many bugs are really two different runtimes pretending to be one system.

### 5) Narrow the class of failure
Classify the issue:

#### Startup
- crashes immediately
- missing module/binary
- syntax/config error

#### Connectivity
- wrong port
- host unreachable
- websocket/http failure
- firewall or binding mismatch

#### Auth
- bad token
- missing secret
- wrong account/context

#### Runtime logic
- action triggers wrong behavior
- reconnect loop
- stale state
- event handling bug

### 6) Verify with a simple known-good test
Use the smallest possible test that proves the path works.
Examples:
- hit the health endpoint
- connect to the websocket
- send one minimal command
- load one known-good config

Do not test five things at once unless you enjoy mud.

### 7) Only then fix and retest
Change one thing at a time.
After each change, verify:
- did startup succeed
- did connection succeed
- did the expected behavior happen
- did anything new break

## Output Style When Reporting Back

Keep it tight:
- **What failed**
- **What I checked**
- **What I found**
- **Next fix**

## Standing Habits

- Fastest working path first
- Foreground for truth, service for convenience
- Check paths before inventing exotic theories
- Verify after each change
- Prefer evidence over hunches

## Notes

This workflow is the assistant-native.
It borrows the useful discipline of service/foreground troubleshooting without depending on any one product’s daemon model.