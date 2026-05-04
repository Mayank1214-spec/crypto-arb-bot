import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { ArbitrageEngine } from './ArbitrageEngine';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 7860; // Hugging Face default port

// Serve static frontend files from the 'frontend/dist' directory
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// Handle React routing (send all other requests to index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const server = http.createServer(app);

// Use a separate endpoint or just share the server for WebSockets
const wss = new WebSocketServer({ server });
const engine = new ArbitrageEngine();

wss.on('connection', (ws: any) => {
  console.log('New client connected');
  engine.handleClient(ws);
});

server.listen(port, () => {
  console.log(`Arbitrage Dashboard running on http://localhost:${port}`);
  console.log(`WebSocket server active on the same port`);
});
