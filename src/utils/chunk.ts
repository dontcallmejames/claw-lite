/**
 * Code-block-aware message chunking.
 * Never splits inside a fenced code block. Prefers paragraph boundaries.
 */
export function chunkMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';
  let inCodeBlock = false;
  let codeFence = '';  // e.g. "```typescript"

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Track code block boundaries
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeFence = line;
      } else {
        inCodeBlock = false;
        codeFence = '';
      }
    }

    const candidate = current ? current + '\n' + line : line;

    if (candidate.length > maxLen) {
      if (inCodeBlock && current.length > 0) {
        // Close the code block at the split point, push chunk
        chunks.push(current + '\n```');
        // Reopen in next chunk
        current = codeFence + '\n' + line;
      } else if (current.length > 0) {
        chunks.push(current);
        current = line;
      } else {
        // Single line exceeds maxLen — hard split
        let remaining = line;
        while (remaining.length > maxLen) {
          chunks.push(remaining.slice(0, maxLen));
          remaining = remaining.slice(maxLen);
        }
        current = remaining;
      }
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.filter(c => c.trim().length > 0);
}
