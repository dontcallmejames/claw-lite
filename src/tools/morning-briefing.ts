import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import { wrapExternalContent, sanitizeInjectionPatterns } from '../security/external-content.js';

export const morningBriefingTool: ToolDefinition = {
  name: 'morning_briefing',
  description: 'Generate and send a personalized morning briefing with weather, schedule, tasks, news, and stock updates.\n\nUse this when: the user asks for a morning briefing, or the scheduled morning briefing cron fires.\nDo NOT use this when: the user just wants one specific piece of information (weather only, news only, etc.) — answer that directly instead.',
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

    // Run all three fetches concurrently — each has its own 8s timeout, so
    // sequential worst-case would be 24s; concurrent worst-case is 8s.
    const [weatherResult, newsResult, techResult] = await Promise.allSettled([

      // --- Weather via wttr.in ---
      (async () => {
        const weatherUrl = `https://wttr.in/${encodeURIComponent(location)}?format=3`;
        const weatherRes = await fetch(weatherUrl, {
          headers: { 'User-Agent': 'curl/7.0' },
          signal: AbortSignal.timeout(8000)
        });
        if (weatherRes.ok) {
          return (await weatherRes.text()).trim();
        }
        throw new Error('weather unavailable');
      })(),

      // --- World headlines via BBC RSS ---
      (async () => {
        const newsUrl = 'https://feeds.bbci.co.uk/news/world/rss.xml';
        const newsRes = await fetch(newsUrl, {
          signal: AbortSignal.timeout(8000)
        });
        if (!newsRes.ok) throw new Error('news feed returned non-OK status');
        const xml = await newsRes.text();
        const titleMatches = xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g);
        const headlines: string[] = [];
        let count = 0;
        for (const match of titleMatches) {
          const title = sanitizeInjectionPatterns((match[1] || match[2] || '').trim());
          if (title && title !== 'BBC News' && !title.startsWith('BBC') && count < 7) {
            headlines.push(`• ${title}`);
            count++;
          }
        }
        return headlines;
      })(),

      // --- Tech headlines via TechCrunch RSS ---
      (async () => {
        const techUrl = 'https://feeds.feedburner.com/TechCrunch';
        const techRes = await fetch(techUrl, {
          signal: AbortSignal.timeout(8000)
        });
        if (!techRes.ok) throw new Error('tech feed returned non-OK status');
        const xml = await techRes.text();
        const titleMatches = xml.matchAll(/<title>(.*?)<\/title>/g);
        const headlines: string[] = [];
        let count = 0;
        for (const match of titleMatches) {
          const title = sanitizeInjectionPatterns(match[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim());
          if (title && title !== 'TechCrunch' && count < 5) {
            headlines.push(`• ${title}`);
            count++;
          }
        }
        return headlines;
      })(),
    ]);

    // Collect results
    if (weatherResult.status === 'fulfilled') {
      sections.push(`WEATHER\n${weatherResult.value}`);
    } else {
      errors.push('weather fetch failed');
    }

    if (newsResult.status === 'fulfilled') {
      if (newsResult.value.length > 0) {
        sections.push(`WORLD HEADLINES (BBC)\n${newsResult.value.join('\n')}`);
      }
    } else {
      errors.push('news fetch failed');
    }

    if (techResult.status === 'fulfilled') {
      if (techResult.value.length > 0) {
        sections.push(`TECH (TechCrunch)\n${techResult.value.join('\n')}`);
      }
    } else {
      // Tech is optional but report the failure so the user knows why it's missing
      errors.push('tech news fetch failed');
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

    const header = `MORNING BRIEFING — ${dateStr} ${timeStr} EST`;
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
      output: wrapExternalContent(output, 'morning-briefing/rss')
    };
  }
};
