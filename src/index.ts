#!/usr/bin/env node

// Suppress node-cron missed-execution spam (fires on startup after downtime)
const _origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('missed execution')) return;
  _origWarn(...args);
};

import { initializeTools } from './tools/index.js';
import { GatewayServer } from './gateway/server.js';
import { loadConfig } from './config/loader.js';
import { login } from './auth/oauth.js';
import { migrateMemoryJson } from './memory/migrate.js';

// Initialize tools on startup
initializeTools();

// Auto-migrate memory.json → SQLite on first run
try { migrateMemoryJson(); } catch (err: any) {
  console.warn('[Migration] memory.json migration skipped:', err.message);
}

export async function startGateway(): Promise<GatewayServer> {
  const config = loadConfig();
  if (!config.gateway.enabled) {
    throw new Error('Gateway is disabled in configuration');
  }
  return new GatewayServer();
}

export async function startAll(): Promise<void> {
  console.log('Starting AI Assistant...\n');

  const config = loadConfig();
  const services: Array<{ name: string; stop: () => Promise<void> }> = [];

  // Start gateway if enabled
  if (config.gateway.enabled) {
    const gateway = await startGateway();
    services.push({
      name: 'Gateway',
      stop: () => gateway.close()
    });
  }

  if (services.length === 0) {
    console.log('No services are enabled. Check your config.yml');
    process.exit(1);
  }

  console.log(`\n✓ Started ${services.length} service(s)`);
  console.log('Press Ctrl+C to stop\n');

  // Handle shutdown
  const shutdown = async () => {
    console.log('\nShutting down services...');
    for (const service of services) {
      try {
        await service.stop();
        console.log(`✓ Stopped ${service.name}`);
      } catch (error) {
        console.error(`✗ Error stopping ${service.name}:`, error);
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run if this is the main module
// Check if this file is being run directly (not imported)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('index.js') ||
  process.argv[1].endsWith('index.ts')
);

if (isMainModule) {
  const command = process.argv[2];

  if (command === 'login') {
    login()
      .then(() => process.exit(0))
      .catch(err => { console.error('Login failed:', err.message); process.exit(1); });
  } else {
    startAll().catch((error) => {
      console.error('Failed to start:', error);
      process.exit(1);
    });
  }
}
