// Simple WebSocket test client for the AI Assistant
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:8080');

ws.on('open', () => {
  console.log('Connected to AI Assistant!\n');

  // Send a test message
  const message = {
    type: 'chat',
    payload: {
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: 'Hello! What is 2+2? Please explain your reasoning.' }
      ],
      tools: false,
      stream: false
    }
  };

  console.log('Sending message...');
  ws.send(JSON.stringify(message));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('\nReceived response:');
  console.log(JSON.stringify(response, null, 2));

  if (response.type === 'chat' && response.payload.content) {
    console.log('\n--- AI Response ---');
    console.log(response.payload.content);
    console.log('-------------------\n');
  }

  // Close after receiving response
  if (response.type === 'chat' && !response.payload.streaming) {
    ws.close();
  }
});

ws.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
  process.exit(1);
});
