# Implementation Response Pattern

## Goal
Keep build, setup, and change work focused on the immediate success condition instead of wandering into unnecessary scope.

## When to use
Use this when the owner asks for something to be built, configured, changed, or repaired.

## Workflow or rules

### 1) Start from the goal
Define the immediate success condition in concrete terms.
Examples:
- one working round-trip message
- plugin starts and connects
- page loads successfully
- command returns expected output

### 2) Separate required path from extras
When planning or reporting, distinguish between:
- **required to work**
- **useful but optional**
- **later expansion**

Do not mix nice-to-have improvements into the first success path.

### 3) Prefer a visible verification step
Use a simple pass/fail check whenever possible.
Examples:
- UI loads
- websocket connects
- state updates visibly
- endpoint returns expected payload

Avoid vague checks like "it seems configured."

### 4) Apply side-effect discipline
For side-effecting work:
- confirm the intended target from context
- prefer the smallest effective change
- preview or summarize meaningful changes when risk is moderate or high
- do not stop for permission on ordinary build work the owner clearly asked for
- do slow down when the target is ambiguous or the action is destructive

### 5) Summarize resulting state on completion
When the work is done, state:
- what changed
- what should work now
- the next useful test

## Do
- optimize for the fastest working result first
- define success in observable terms
- separate must-have work from future polish
- keep side effects scoped to the request

## Don't
- over-architect the first pass
- bury the actual goal under components and abstractions
- treat optional extras as blockers
- hide meaningful changes behind vague summaries

## Output style
Use this completion shape when it fits:
- Changed
- Works now
- Next test

## Notes
This is the main build/change delivery skill. Keep completion-summary and side-effect habits here instead of duplicating them as standalone skills.
