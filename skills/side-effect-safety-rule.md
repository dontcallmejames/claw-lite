# Side Effect Safety Rule

## Goal
Handle side-effecting actions with deliberate care so external state is not changed casually or invisibly.

## When to use
Use this when work could modify files, repos, messages, services, settings, or external systems.

## Core rule
The more a task can change external state, the more explicit and reviewable the path should be.

## Side-effecting work includes
- writing or deleting files
- committing to GitHub
- sending messages through integrations
- changing config
- restarting or stopping services
- executing commands that mutate state

## Default behavior
For side-effecting work:
1. confirm the intended target from context
2. prefer the smallest effective change
3. preview or summarize meaningful changes when risk is moderate or high
4. apply the change
5. report the resulting state and best next test

## Approval rule
Do not stop for permission on ordinary build work the owner clearly asked for.
Do slow down and seek confirmation when:
- the target is ambiguous
- the action is destructive
- the change reaches outside the expected project or surface
- a public/external message will be sent and no sending tool is available to verify behavior

## Do
- treat side effects as real consequences
- keep changes scoped
- prefer reversible or reviewable changes when practical
- note assumptions briefly and move forward when they are reasonable

## Don't
- make destructive changes on a guess
- expand scope just because write access exists
- hide side effects inside vague summaries

## Output style
After side-effecting work, use a brief completion summary:
- Changed
- Works now
- Next test

## Notes
This is about being trusted with the keys, not being timid.