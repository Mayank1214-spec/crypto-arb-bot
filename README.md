# Crypto Options Arbitrage App

A real-time arbitrage detection dashboard for BTC and ETH options across Deribit and Binance, powered by Cloudflare Workers and a premium React dashboard.

## Project Structure

- `/backend`: Cloudflare Workers & Durable Objects (Arbitrage Engine)
- `/frontend`: React + Vite + Framer Motion (Real-time Dashboard)

## How to Run

### 1. Backend (Cloudflare Worker)
```bash
cd backend
npm install
npm run dev
```
*Note: Requires a Cloudflare account with Durable Objects enabled for production.*

### 2. Frontend (Dashboard)
```bash
cd frontend
npm install
npm run dev
```

## Features

- **Real-time Feed:** Sub-second updates via WebSockets.
- **Durable Engine:** Cloudflare Durable Objects maintain exchange connections and calculate spreads.
- **Premium UI:** Glassmorphic design with smooth animations.
- **Multi-Exchange:** Integration with Deribit and Binance Options.

## Deployment

To deploy the backend:
```bash
cd backend
npx wrangler deploy
```

To deploy the frontend:
```bash
cd frontend
npm run build
# Deploy to Cloudflare Pages or Vercel
```
