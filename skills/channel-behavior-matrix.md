# Channel Behavior Matrix

## Goal
Adjust response style and formatting to the surface being used so the answer fits where it lands.

## When to use
Use this when replying through a specific channel, integration, plugin surface, or UI with its own constraints.

## Core idea
Channels are not just transports. Each one changes what good output looks like.

## Terminal / local assistant chat
Default the assistant surface.
- direct, technical, concise
- enough detail to act, no ceremony
- good place for troubleshooting, file work, config work, and repo changes

## Discord
- keep messages shorter and scan-friendly
- use real mentions when a ping matters: `<@USER_ID>`
- do not rely on plain `@name`
- when talking to bots, use real mentions first
- in shared channels, prefer explicit invocation over assumption
- use Discord-safe formatting
- avoid huge walls of text unless asked

## Touch Portal / plugin surfaces
- state and action focused
- concise labels and descriptions
- prefer clear pass/fail status wording
- optimize for visible state updates and trigger behavior

## Docs / research summaries
- separate facts from inference
- cite the source page or doc area when useful
- prefer concise structure over narrative
- present worth adapting vs not worth copying

## Future voice or conversational channels
If a channel is turn-based, spoken, or interruption-prone:
- keep turns shorter
- confirm ambiguous actions before risky changes
- avoid dense multi-part dumps

## Selection rule
When a task crosses channels:
1. optimize for the channel where the result will be consumed
2. preserve correctness first
3. trim formatting to fit that surface

## Do
- adapt formatting and density to the channel
- use native mention/format behavior where needed
- keep plugin/UI text short and clear

## Don't
- send terminal-style dense output into lightweight chat surfaces
- assume mentions will resolve automatically
- use one-size-fits-all formatting

## Output style
Match the target channel. Prefer concise, readable formatting.

## Notes
This is the main channel-surface skill. Keep public/shared-surface caution here instead of splitting it into a separate general rule unless a channel needs its own special case.
