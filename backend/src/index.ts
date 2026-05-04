import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { Request, Response } from 'express';
import WebSocket, { WebSocketServer } from 'ws';
import { ArbitrageEngine } from './ArbitrageEngine.js';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 7860; // Hugging Face default port

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static frontend files from the 'frontend/dist' directory
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// Handle React routing (send all other requests to index.html)
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const server = http.createServer(app);

// Use a separate endpoint or just share the server for WebSockets
const wss = new WebSocketServer({ server });
const engine = new ArbitrageEngine();

wss.on('connection', (ws: WebSocket) => {
  console.log('New client connected');
  engine.handleClient(ws);
});

server.listen(port, () => {
  console.log(`Arbitrage Dashboard running on http://localhost:${port}`);
  console.log(`WebSocket server active on the same port`);
});
