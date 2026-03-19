# Capability Packaging Rule

## Goal
When adding a new capability, package it so it is usable, understandable, and durable instead of becoming an orphaned tool or half-remembered trick.

## When to use
Use this when adding tools, integrations, workflows, plugins, or durable operational knowledge.

## Core rule
A new capability should usually arrive as more than just the raw mechanism.

Preferred package:
1. the capability itself
2. a short skill explaining when to use it
3. any important constraints or prerequisites
4. the most useful verification step

## What counts as a capability
- a new tool
- a new integration
- a plugin or plugin action
- a recurring workflow
- a durable troubleshooting pattern

## Minimum packaging standard
For most additions, capture:
- what it is for
- when to use it
- what it assumes
- how to tell if it worked
- what not to do

## Decision rule
If the owner asks for a one-off change, do the change.
If the pattern is likely to repeat, also package the knowledge so the assistant can reuse it later.

## Good examples
- add a Discord-related behavior -> also keep/update a Discord skill
- add a docs workflow -> write the docs research skill
- add a plugin integration -> include usage and verification notes

## Do
- pair new capability with reusable guidance when it will matter again
- include prerequisites when they are real
- include one strong verification step

## Don't
- add tools with no usage guidance
- rely on memory alone for repeatable workflows
- turn every one-off tweak into a big framework

## Output style
No fixed format required, but completion summaries should mention both the new capability and the new reusable knowledge when both were added.

## Notes
The point is modular growth without clutter.