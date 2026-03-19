import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';

export const morningBriefingTool: ToolDefinition = {
  name: 'morning_briefing',
  description: 'Fetch a morning briefing for Jim: current weather and top news headlines. Call this when Jim asks for a daily briefing, morning update, or wants to know what\'s going on today.',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'Location for weather (default: auto-detect). E.g. "New York" or "10001"'
      },
      topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional news topics to focus on (e.g. ["technology", "world news"])'
      }
    },
    required: []
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const location = input.location || 'New York';
    const topics: string[] = input.topics || ['technology', 'world news', 'US news'];

    const sections: string[] = [];
    const errors: string[] = [];

    // --- Weather via wttr.in ---
    try {
      const weatherUrl = `https://wttr.in/${encodeURIComponent(location)}?format=3`;
      const weatherRes = await fetch(weatherUrl, {
        headers: { 'User-Agent': 'curl/7.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (weatherRes.ok) {
        const weather = (await weatherRes.text()).trim();
        sections.push(`🌤 WEATHER\n${weather}`);
      } else {
        errors.push('weather unavailable');
      }
    } catch {
      errors.push('weather fetch failed');
    }

    // --- Headlines via NewsAPI (free RSS alternative) ---
    try {
      // Use a free RSS/JSON news source - no API key needed
      const newsUrl = 'https://feeds.bbci.co.uk/news/world/rss.xml';
      const newsRes = await fetch(newsUrl, {
        signal: AbortSignal.timeout(8000)
      });

      if (newsRes.ok) {
        const xml = await newsRes.text();
        // Parse titles from RSS XML
        const titleMatches = xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g);
        const headlines: string[] = [];
        let count = 0;
        for (const match of titleMatches) {
          const title = (match[1] || match[2] || '').trim();
          // Skip the feed title itself
          if (title && title !== 'BBC News' && !title.startsWith('BBC') && count < 7) {
            headlines.push(`• ${title}`);
            count++;
          }
        }
        if (headlines.length > 0) {
          sections.push(`📰 WORLD HEADLINES (BBC)\n${headlines.join('\n')}`);
        }
      }
    } catch {
      errors.push('news fetch failed');
    }

    // --- Tech headlines ---
    try {
      const techUrl = 'https://feeds.feedburner.com/TechCrunch';
      const techRes = await fetch(techUrl, {
        signal: AbortSignal.timeout(8000)
      });

      if (techRes.ok) {
        const xml = await techRes.text();
        const titleMatches = xml.matchAll(/<title>(.*?)<\/title>/g);
        const headlines: string[] = [];
        let count = 0;
        for (const match of titleMatches) {
          const title = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim();
          if (title && title !== 'TechCrunch' && count < 5) {
            headlines.push(`• ${title}`);
            count++;
          }
        }
        if (headlines.length > 0) {
          sections.push(`💻 TECH (TechCrunch)\n${headlines.join('\n')}`);
        }
      }
    } catch {
      // Tech headlines optional, skip silently
    }

    // --- Date/time ---
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/New_York'
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/New_York'
    });

    const header = `☀️ MORNING BRIEFING — ${dateStr} ${timeStr} EST`;
    const divider = '─'.repeat(50);

    if (sections.length === 0) {
      return {
        success: false,
        error: `Could not fetch briefing data: ${errors.join(', ')}`
      };
    }

    const output = [header, divider, ...sections].join('\n\n');

    return {
      success: true,
      output
    };
  }
};
