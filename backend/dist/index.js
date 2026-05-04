"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const ArbitrageEngine_1 = require("./ArbitrageEngine");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 7860; // Hugging Face default port
// Serve static frontend files from the 'frontend/dist' directory
const frontendPath = path_1.default.join(__dirname, '../../frontend/dist');
app.use(express_1.default.static(frontendPath));
// Handle React routing (send all other requests to index.html)
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(frontendPath, 'index.html'));
});
const server = http_1.default.createServer(app);
// Use a separate endpoint or just share the server for WebSockets
const wss = new ws_1.WebSocketServer({ server });
const engine = new ArbitrageEngine_1.ArbitrageEngine();
wss.on('connection', (ws) => {
    console.log('New client connected');
    engine.handleClient(ws);
});
server.listen(port, () => {
    console.log(`Arbitrage Dashboard running on http://localhost:${port}`);
    console.log(`WebSocket server active on the same port`);
});
