import { createHash, randomBytes } from 'crypto';
import { createServer } from 'http';
import { exec } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTH_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const CALLBACK_PORT = 1455;
const SCOPES = 'openid profile email offline_access api.connectors.read api.connectors.invoke';

export const TOKEN_PATH = join(homedir(), '.davos', 'auth.json');

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

// --- PKCE helpers ---

function generateVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// --- Browser ---

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd);
}

// --- Local callback server ---

function waitForCallback(): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url!, `http://127.0.0.1:${CALLBACK_PORT}`);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#e2e2e2">
            <h2 style="color:#10b981">✓ Login successful</h2>
            <p>You can close this tab and return to the terminal.</p>
          </body></html>
        `);

        server.close();

        if (error) {
          reject(new Error(`OAuth error: ${error} — ${url.searchParams.get('error_description') ?? ''}`));
        } else if (code && state) {
          resolve({ code, state });
        } else {
          reject(new Error('Missing code or state in callback'));
        }
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, 'localhost', () => {
      // listening — openBrowser() called externally
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${CALLBACK_PORT} is already in use. Close any other apps using it and try again.`));
      } else {
        reject(err);
      }
    });
  });
}

// --- Token exchange ---

async function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${response.status} — ${err}`);
  }

  const data = await response.json() as any;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

// --- Token refresh ---

async function doRefresh(refreshToken: string): Promise<TokenSet> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token refresh failed: ${response.status} — ${err}`);
  }

  const data = await response.json() as any;
  return {
    access_token: data.access_token,
    // Some providers don't rotate refresh tokens — keep the old one if not returned
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

// --- Storage ---

export function loadTokens(): TokenSet | null {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_PATH, 'utf-8')) as TokenSet;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: TokenSet): void {
  const dir = join(homedir(), '.davos');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // mode 0o600 = owner read/write only
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

// --- Public API ---

/**
 * Run the full PKCE login flow. Opens browser, waits for callback, saves tokens.
 */
export async function login(): Promise<void> {
  const verifier = generateVerifier();
  const challenge = generateChallenge(verifier);
  const state = randomBytes(16).toString('base64url');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
  });

  const authUrl = `${AUTH_URL}?${params}`;

  console.log('\n🔑 Opening browser for OpenAI login...');
  console.log('If browser does not open automatically, visit:\n');
  console.log('  ' + authUrl + '\n');

  // Start the callback listener before opening the browser
  const callbackPromise = waitForCallback();
  openBrowser(authUrl);

  const { code, state: returnedState } = await callbackPromise;

  if (returnedState !== state) {
    throw new Error('State mismatch — possible CSRF, aborting');
  }

  console.log('✓ Received auth code, exchanging for tokens...');
  const tokens = await exchangeCode(code, verifier);
  saveTokens(tokens);

  const expiresIn = Math.round((tokens.expires_at - Date.now()) / 1000 / 60);
  console.log(`✓ Login successful! Token saved to ${TOKEN_PATH} (expires in ~${expiresIn} minutes)`);
}

/**
 * Returns a valid access token, refreshing automatically if near expiry.
 * Returns null if no tokens are stored (not logged in).
 */
export async function getValidToken(): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;

  const FIVE_MINUTES = 5 * 60 * 1000;
  if (tokens.expires_at - Date.now() > FIVE_MINUTES) {
    return tokens.access_token;
  }

  // Token is expired or about to expire — refresh
  console.log('[OAuth] Token near expiry, refreshing...');
  try {
    const refreshed = await doRefresh(tokens.refresh_token);
    saveTokens(refreshed);
    return refreshed.access_token;
  } catch (err) {
    console.error('[OAuth] Refresh failed — run "npm run login" to re-authenticate:', err);
    return null;
  }
}

/**
 * Returns true if a token file exists (regardless of expiry).
 */
export function isLoggedIn(): boolean {
  return existsSync(TOKEN_PATH);
}
