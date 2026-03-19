# Morning Briefing

When the owner asks for a morning briefing or daily briefing, gather and present:

1. **Weather** — use `web_fetch` with `https://wttr.in/Halifax,NS?format=3` (the owner is in Halifax, NS, Canada)
2. **News headlines** — use `web_search` for "today's top news headlines"
3. **GitHub activity** — use `github_repo_info` or `github_list_files` on the assistantTPplugin to check recent activity if relevant

## Format

Present as a brief, scannable summary. No filler. Lead with weather, then headlines, then anything GitHub-related if there's something worth noting.

Example structure:
```
🌤 Halifax: +4°C, partly cloudy

Top headlines:
- [headline 1]
- [headline 2]
- [headline 3]
```

Keep it under 200 words. If a source fails, skip it and continue with the rest.
