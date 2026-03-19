import { WebSocket } from 'ws';
import type { Channel } from './base.js';

export class WebSocketChannel implements Channel {
  readonly name = 'websocket';
  private getClients: () => Set<WebSocket>;

  constructor(getClients: () => Set<WebSocket>) {
    this.getClients = getClients;
  }

  async send(_target: string, content: string): Promise<void> {
    let sent = 0;
    for (const client of this.getClients()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'chat',
          payload: { content, isCron: true }
        }));
        sent++;
      }
    }
    if (sent === 0) {
      console.log('[WebSocket] No connected clients — notification not delivered');
    }
  }

  start(): void {
    // No-op: WebSocket server is managed by GatewayServer
  }

  stop(): void {
    // No-op: WebSocket server is managed by GatewayServer
  }
}
