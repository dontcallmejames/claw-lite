// Test client with tool calling enabled
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:8080');

ws.on('open', () => {
  console.log('Connected to AI Assistant!\n');

  const message = {
    type: 'chat',
    payload: {
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant with access to tools.' },
        { role: 'user', content: 'Can you list the files in the workspace directory?' }
      ],
      tools: true,  // Enable tool calling
      stream: false
    }
  };

  console.log('Sending message with tools enabled...');
  ws.send(JSON.stringify(message));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());

  if (response.type === 'chat') {
    console.log('\n--- Response ---');
    console.log('Content:', response.payload.content);

    if (response.payload.toolUses) {
      console.log('\nTool Uses:', JSON.stringify(response.payload.toolUses, null, 2));
    }
    console.log('-------------------\n');

    if (!response.payload.streaming) {
      ws.close();
    }
  }
});

ws.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
