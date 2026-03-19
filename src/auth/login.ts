#!/usr/bin/env node
/**
 * Standalone login command: npm run login
 * Runs the OpenAI PKCE OAuth flow and saves tokens to ~/.davos/auth.json
 */
import { login, isLoggedIn, TOKEN_PATH } from './oauth.js';

const args = process.argv.slice(2);

if (args.includes('--logout')) {
  import('fs').then(({ unlinkSync, existsSync }) => {
    if (existsSync(TOKEN_PATH)) {
      unlinkSync(TOKEN_PATH);
      console.log('✓ Logged out — token file removed');
    } else {
      console.log('Not logged in (no token file found)');
    }
    process.exit(0);
  });
} else if (args.includes('--status')) {
  if (isLoggedIn()) {
    import('fs').then(({ readFileSync }) => {
      try {
        const tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
        const expiresIn = Math.round((tokens.expires_at - Date.now()) / 1000 / 60);
        if (expiresIn > 0) {
          console.log(`✓ Logged in — token expires in ~${expiresIn} minutes`);
        } else {
          console.log('⚠ Token expired — run "npm run login" to refresh');
        }
      } catch {
        console.log('⚠ Token file exists but could not be read');
      }
      process.exit(0);
    });
  } else {
    console.log('Not logged in — run "npm run login" to authenticate');
    process.exit(0);
  }
} else {
  login()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n✗ Login failed:', err.message);
      process.exit(1);
    });
}
