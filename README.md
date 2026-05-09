---
title: Crypto Arb Bot
emoji: ⚡
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# ARBITRAGEX — Crypto Options Arbitrage Engine

Real-time crypto options arbitrage monitoring dashboard scanning **Deribit** and **Bybit** for cross-exchange spread opportunities.

## Features

- **Live Arbitrage Detection** — Scans BTC/ETH options across exchanges in real-time
- **Paper Trading** — Simulated trade execution with P&L tracking
- **Execution Tracking** — Full backend trade lifecycle monitoring
- **Premium Dashboard** — Tailwind CSS v4 dark trading UI with 5-tab layout

## Architecture

- **Backend**: Node.js + TypeScript WebSocket server (ArbitrageEngine)
- **Frontend**: React + Vite + Tailwind CSS v4
- **Deployment**: Docker multi-stage build on Hugging Face Spaces
