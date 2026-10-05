<div align="center">

# 🔮 Rialo Calls

### Where the Community Calls What Happens Next

**A fully on-chain prediction market dApp**

[![Live App](https://img.shields.io/badge/Live%20App-rialocalls.vercel.app-2DD4A4?style=for-the-badge&logo=vercel&logoColor=white)](https://rialocalls.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-white?style=for-the-badge)](LICENSE)

</div>

---

## 🌐 Live

> **[https://rialocalls.vercel.app](https://rialocalls.vercel.app)**

---

## What is Rialo Calls?

Rialo Calls is a decentralized prediction market dApp where users bet on real events. Every prediction is created on-chain, every bet is a signed transaction, and every payout is trustlessly claimable — no custodian, no middleman.

- 🗳️ **Predict** — Call YES or NO on community-driven events
- 💰 **Win** — Correct callers split the losing pool proportionally
- 🏆 **Climb** — Earn badges and rise the on-chain leaderboard
- 🔮 **Be remembered** — The chain remembers who called it right

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Vanilla CSS (custom design system) |
| Blockchain | Wagmi v2 + Viem + RainbowKit |
| Database | Supabase (PostgreSQL) |
| Wallet | RainbowKit + WalletConnect |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [WalletConnect](https://cloud.walletconnect.com) project ID

### Install

```bash
npm install
```

### Configure

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_RLO_TOKEN_ADDRESS=0x...
VITE_PROFILE_REGISTRY_ADDRESS=0x...
VITE_BETTING_POOL_ADDRESS=0x...
VITE_ACHIEVEMENT_REGISTRY_ADDRESS=0x...
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

### Run

```bash
npm run dev
```

### Build

```bash
npm run build
```

---

## Deploying to Vercel

1. Push this repo to GitHub
2. Import on [vercel.com/new](https://vercel.com/new)
3. Add all `VITE_*` environment variables in Vercel dashboard → Settings → Environment Variables
4. Deploy ✅

---

## License

MIT © Rialo Calls
