# Simplest Interface First

## Goal

Verify or troubleshoot a system through the most direct known-good interface before using more integrated or failure-prone paths.

## When to use

Use this when a service, plugin, API, gateway, or integration may be broken and there are multiple ways to interact with it.

## Workflow or rules

### 1) Identify the simplest test path
Pick the interface with the fewest moving parts.
Examples:
- local UI before external integration
- direct HTTP request before automation layer
- foreground/manual run before service wrapper
- minimal command before full workflow

### 2) Use the simple path to prove the core works
First verify the base system is alive and responsive.
Only then move outward to more integrated paths.

### 3) Treat differences as clues
If the simple path works but the integrated path fails, the fault is likely in:
- auth
- environment
- transport
- wrapper logic
- runtime context

### 4) Escalate one layer at a time
Do not jump from "service exists" to "full end-to-end automation" if a direct probe is available.

## Do
- choose the path with the fewest dependencies first
- prove the core before blaming everything around it
- use layer differences to narrow the failure class

## Don't
- start with the most integrated path
- test five moving parts at once
- call the whole system broken before checking the core interface

## Output style

When reporting back, say:
- Simplest check
- Result
- What that rules in or out

## Notes

This works for local apps, gateways, APIs, plugins, scripts, and background services.