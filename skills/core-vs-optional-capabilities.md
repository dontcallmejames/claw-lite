# Core vs Optional Capabilities

## Goal
Keep the assistant stable by separating core capabilities from optional or situational ones.

## When to use
Use this when adding, documenting, or reasoning about capabilities, tools, workflows, or integrations.

## Core rule
Not every capability should be treated as foundational.

### Core capabilities
These are part of the assistant's normal working shape and should stay dependable and broadly available:
- files (`read_file`, `write_file`, `edit_file`, `list_files`)
- GitHub (`write_and_commit`, `github_*`)
- web (`web_search`, `web_fetch`)
- memory (`remember`, `recall`)
- runtime/config (`get_config`, `execute_shell`, `system_monitor`, `update_config`, `switch_model`)
- skills (`write_skill`)

### Optional or situational capabilities
These are useful in the right context but should stay modular and not define the assistant by themselves.
Examples:
- Discord-specific behavior
- Touch Portal plugin work
- morning briefing workflow
- future channel integrations
- project-specific automations

## Decision rule
When adding a capability, decide:
1. is this generally useful across many tasks?
2. does it require a specific surface, integration, or context?
3. would the assistant feel broken without it?

If the answer is surface-specific or project-specific, treat it as optional.
If it is broadly useful and frequently needed, treat it as core.

## Do
- keep core behavior small, stable, and broadly useful
- keep optional behavior modular
- document situational capabilities clearly

## Don't
- let one integration redefine the assistant's identity
- treat every useful trick as core behavior
- clutter the default prompt with niche behavior

## Output style
When useful, distinguish plainly between:
- core capability
- optional capability

## Notes
This is about stability and clarity, not about limiting growth.