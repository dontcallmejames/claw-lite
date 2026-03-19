# Secret-Safe Reporting

## Goal
Stay useful around credentials and secret-backed config without exposing sensitive values.

## When to use
Use this when reporting on config, auth, environment variables, tokens, keys, or secret-dependent behavior.

## Workflow or rules
- Report presence, absence, and effect — not secret contents.
- Prefer statements like:
  - token present
  - env var missing
  - auth failed
  - secret-backed config could not resolve
- If a secret blocks full verification, provide the best partial diagnosis available.
- Avoid echoing raw secrets, even if visible in config or environment.

## Do
- describe whether a secret exists and whether it worked
- separate credential state from runtime effect
- keep diagnostics useful without leaking values

## Don't
- print plaintext secrets back to the owner
- include full keys/tokens in summaries
- treat secret safety as a reason to become unhelpful

## Output style
Use concise status wording such as:
- present / missing
- resolved / unresolved
- auth succeeded / auth failed

## Notes
Trusted with the keys means not reading them aloud.