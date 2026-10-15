<div align="center">

<img src="src/assets/rialo-symbol.png" alt="Rialo Calls" width="72" />

# Rialo Calls

**Where the Community Calls What Happens Next**

[![Live](https://img.shields.io/badge/Live-rialocalls.vercel.app-2DD4A4?style=for-the-badge&logo=vercel&logoColor=white)](https://rialocalls.vercel.app)
[![Network](https://img.shields.io/badge/Network-Ethereum%20Sepolia-627EEA?style=for-the-badge&logo=ethereum&logoColor=white)](https://sepolia.etherscan.io)
[![License](https://img.shields.io/badge/License-MIT-white?style=for-the-badge)](LICENSE)

</div>

---

## 🔮 What is Rialo Calls?

**Rialo Calls** is a fully on-chain prediction market where the community bets YES or NO on real-world events using RLO tokens. Winners split the losing pool proportionally. Every prediction, bet, claim, and badge is enforced on-chain — no custodian, no middleman.

**The key innovation:** You sign once with MetaMask. That creates a session wallet in your browser that handles every transaction silently from there. It feels like a Web2 app — but it's fully on-chain.

Live at → **[rialocalls.vercel.app](https://rialocalls.vercel.app)**

---

## ✨ Features

### ⚡ Session Wallet
Sign once with MetaMask. All bets, claims, badges, and votes fire on-chain silently — zero popups. Same wallet always produces the same session key (deterministic from your signature).

### 🎯 Prediction Markets
Community and official predictions. Bet YES or NO with RLO tokens. Winners split the losing pool proportionally. Markets can be time-gated or open-ended.

### 🔭 X Resolver — Auto-Lock System
Admin sets a Twitter/X condition on a prediction (e.g. *"Will @elonmusk hit 200M followers?"*). GitHub Actions checks every hour via fxtwitter. When the condition is met, `lockBetting()` is called on-chain automatically — no manual admin needed.

### 🤖 RialoBot — AI Betting Agent
A fully autonomous AI that wakes up daily at 8AM UTC, reads open markets, asks an AI model YES or NO (via Latch proxy with 4-model fallback), and places real on-chain bets. Zero human input. The platform is alive even with zero users.

### 🗳️ On-Chain Polls
Community submits prediction ideas on-chain and votes. Top 3 each round become real markets. Admin closes rounds and selects winners.

### 🏆 Achievement Badges
On-chain NFT badges based on bet count: 🔮 Starter (1), 📡 Caller (10), 🌀 Oracle (50), 👑 OG (100).

### 💬 Calls Guide
An in-app chatbot assistant. Type anything — it bets, claims, checks balances, submits polls, and answers any question about the platform. Powered by live on-chain and Supabase data.

### 📊 Leaderboard
Tracks wins, losses, win rate, total volume, and PnL per wallet. Includes RialoBot as a real participant.

---

## How It Works

| Step | Action |
|---|---|
| 🔌 **Connect** | Connect MetaMask + activate session wallet (one-time sign) |
| 👤 **Profile** | Mint your on-chain identity (name, bio, PFP, X handle) |
| 💧 **Faucet** | Claim 1,000 free RLO every 30 days |
| 🗳️ **Call** | Bet YES or NO on open predictions |
| 🔭 **Auto-Lock** | X Resolver locks markets when real-world events happen |
| 💰 **Win** | Correct callers split the losing pool proportionally |
| 🏆 **Badges** | Mint achievement badges as you accumulate bets |
| 📋 **Polls** | Submit ideas and vote — top 3 become real markets |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Blockchain | wagmi v2 · viem · RainbowKit |
| Chain | Ethereum Sepolia |
| Database | Supabase (PostgreSQL + Realtime) |
| Automation | GitHub Actions |
| AI Proxy | OnLatch (Latch) |
| Deployment | Vercel |

---

## Smart Contracts (Ethereum Sepolia)

| Contract | Address |
|---|---|
| RLO Token | `0x277C8aDbD292CB75CC5F0172714CF6842F4F90f1` |
| BettingPool | `0x16150779747feF42333a8FDD98E58BfE3CFe7cce` |
| ProfileRegistry | `0x2DE1Ed07C104E775aE7368b1B8e2AA669b5CE5C8` |
| AchievementRegistry | `0xE33651061F0Cb054A083E6E2C758ac1b81413832` |
| PollRegistry | `0xf49E4AcDc164DB7907E485Ae5cD54D37da994089` |

---

## GitHub Actions Agents

| Agent | Schedule | What it does |
|---|---|---|
| `agent/agent.js` (RialoBot) | 8AM UTC daily | AI picks YES/NO, places on-chain bet |
| `agents/x-resolver.js` | Every hour | Checks X conditions, auto-locks markets |
| `agent/claim.js` | Weekly | Auto-claims RialoBot winnings |

---

## Docs

| Document | Description |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full system architecture, contracts, data flow |
| [PRD.md](PRD.md) | Product requirements, features, roadmap |
| [DESIGN.md](DESIGN.md) | Design system, colors, components, UX patterns |

---

## Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in your values
cp .env.example .env

# Run dev server
npm run dev
```

Required `.env` variables — see [`.env.example`](.env.example) for full list.

---

## License

MIT © Rialo Calls
