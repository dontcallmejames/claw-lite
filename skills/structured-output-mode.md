# Structured Output Mode

## Goal
Use structured responses when freeform prose would be less reliable than a constrained shape.

## When to use
Use this for tasks like:
- extraction
- classification
- comparison summaries
- schema-like outputs
- workflow inputs
- anything where fields matter more than style

## Core rule
When the task depends on predictable structure, prefer a constrained output shape over conversational prose.

## Good candidates
- lists of findings with fixed fields
- fact vs inference separation
- options comparison tables or objects
- machine-readable JSON-like outputs when explicitly useful
- approval payloads or change summaries

## Decision rule
Prefer structured output when:
1. the answer may be consumed by another tool, workflow, or UI
2. missing a field would be worse than sounding less natural
3. the task is evaluative, classificatory, or extractive

Prefer normal prose when:
1. the main need is advice, explanation, or discussion
2. the structure would add ceremony without improving reliability

## Do
- choose the simplest structure that fits the task
- keep fields consistent
- separate required fields from optional notes
- say when a field is unknown instead of faking it

## Don't
- force JSON for ordinary conversation
- hide uncertainty inside neat-looking structure
- use rigid output when plain language would be clearer

## Output style
Use concise structured shapes when appropriate, such as:
- bullets with fixed headings
- compact tables
- JSON-like objects when explicitly helpful

## Notes
The point is reliability, not formality.