import dns from 'dns/promises';

/**
 * SSRF protection — block requests to private/internal networks.
 * Resolves hostnames to IPs before checking to prevent DNS rebinding.
 */

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.aws.internal',
]);

function isPrivateIP(ip: string): boolean {
  // IPv4
  if (ip.startsWith('127.')) return true;          // loopback
  if (ip.startsWith('10.')) return true;            // class A private
  if (ip.startsWith('192.168.')) return true;       // class C private
  if (ip === '0.0.0.0') return true;               // unspecified
  if (ip === '169.254.169.254') return true;        // cloud metadata

  // 172.16.0.0 - 172.31.255.255
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // 169.254.0.0/16 link-local
  if (ip.startsWith('169.254.')) return true;

  // IPv6
  if (ip === '::1') return true;                    // loopback
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique local
  if (ip.startsWith('fe80')) return true;            // link-local

  return false;
}

export async function validateUrl(url: string): Promise<{ ok: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  // Block non-HTTP protocols
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, reason: `Protocol not allowed: ${parsed.protocol}` };
  }

  // Block known dangerous hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    return { ok: false, reason: `Blocked hostname: ${hostname}` };
  }

  // Resolve hostname to IP and check for private ranges
  try {
    const result = await dns.lookup(hostname);
    if (isPrivateIP(result.address)) {
      return { ok: false, reason: `Blocked: ${hostname} resolves to private IP ${result.address}` };
    }
  } catch {
    // DNS resolution failed — block the request rather than failing open.
    return { ok: false, reason: `DNS resolution failed for ${hostname}` };
  }

  return { ok: true };
}
