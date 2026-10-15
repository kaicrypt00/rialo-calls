# 🏗️ Rialo Calls — Architecture

## Overview

Rialo Calls is an on-chain prediction market built on **Ethereum Sepolia**. Users bet YES or NO on real-world events using RLO tokens. The platform combines smart contracts, a React frontend, Supabase as a real-time display layer, and GitHub Actions automation agents.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                             │
│                                                                 │
│  React + Vite (Vercel)                                         │
│  ┌──────────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │  CallsPage       │  │  ProfilePage  │  │  AdminPage      │ │
│  │  (Bets / Polls)  │  │  (Identity)   │  │  (Predictions   │ │
│  │                  │  │               │  │   Polls         │ │
│  │                  │  │               │  │   🔭 Resolver)  │ │
│  └──────────────────┘  └───────────────┘  └─────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Context Layer                                            │  │
│  │  ProfileContext  SessionWalletContext  DataPrefetchContext│  │
│  │  ToastContext    SoundContext                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  wagmi v2 + viem + RainbowKit                                  │
└─────────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐      ┌────────────────────────────────┐
│  Ethereum Sepolia   │      │  Supabase (PostgreSQL)         │
│                     │      │                                │
│  • RLO Token        │      │  predictions_display           │
│  • BettingPool      │      │  bets                          │
│  • ProfileRegistry  │      │  profiles                      │
│  • Achievement      │      │  leaderboard                   │
│    Registry         │      │  wallet_transactions           │
│  • PollRegistry     │      │  polls / poll_votes            │
│                     │      │  poll_history / templates      │
└─────────────────────┘      │  x_monitor_logs                │
                             └────────────────────────────────┘
                                          ▲
                                          │
┌─────────────────────────────────────────────────────────────┐
│              GitHub Actions Agents                          │
│                                                             │
│  agent/agent.js         — 8AM UTC daily                    │
│  (RialoBot AI Betting)    AI picks YES/NO via Latch proxy  │
│                           Places bet on-chain              │
│                           Records in Supabase              │
│                                                             │
│  agents/x-resolver.js  — Every hour                        │
│  (X Resolver)             Checks X accounts via fxtwitter  │
│                           Calls lockBetting() if triggered │
│                           Logs to x_monitor_logs           │
│                                                             │
│  agent/claim.js         — Weekly                           │
│  (Claim Agent)            Auto-claims RialoBot winnings    │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Tech Stack
| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Routing | React Router v6 |
| Web3 | wagmi v2 + viem + RainbowKit |
| Database client | @supabase/supabase-js |
| Deployment | Vercel |
| Chain | Ethereum Sepolia (Chain ID: 11155111) |

### Context Architecture
```
<WagmiProvider>
  <RainbowKitProvider>
    <DataPrefetchProvider>   ← Pre-fetches all predictions, leaderboard, polls on mount
      <ProfileProvider>      ← Tracks wallet profile, session wallet, app init gate
        <SessionWalletProvider> ← Manages session wallet (gasless UX)
          <ToastProvider>    ← Global tx notifications
            <SoundProvider>  ← Ambient audio & effects
              <App />
```

### Data Flow — Predictions
```
Mount → DataPrefetchContext fetches all predictions (parallel, 300ms delay)
      → Serves from localStorage cache instantly (5min TTL)
      → Pages read from context (zero loading flash)
      → Supabase Realtime subscription busts cache on any DB change
      → window focus / visibilitychange triggers silent refetch
```

### Session Wallet Pattern
```
User connects MetaMask
  → Signs fixed message (no gas, deterministic)
  → keccak256(signature) = deterministic private key
  → privateKeyToAccount(key) = session wallet
  → Stored in localStorage keyed by main wallet address
  → All bets / claims / badges use session wallet silently
  → Same MetaMask = same session wallet always (recoverable)
```

---

## Smart Contracts

All deployed on **Ethereum Sepolia**.

### RLO Token — `0x277C8aDbD292CB75CC5F0172714CF6842F4F90f1`
- Standard ERC-20
- Built-in monthly faucet: 1,000 RLO per claim, 30-day cooldown
- `claim()` — anyone calls, gets free RLO

### BettingPool — `0x16150779747feF42333a8FDD98E58BfE3CFe7cce`
- Core contract. All prediction market logic.
- `createPrediction()`, `lockBetting()`, `unlockBetting()`, `declareWinner()`
- `placeBet(id, side, amount)` — requires prior ERC-20 `approve()`
- `claimWinnings(id)` — proportional share of losing pool
- `claimRefund(id)` — full refund if prediction is refunded
- Statuses: `open → locked → yes_wins | no_wins | refunded | deleted`
- Admin-only: `ADMIN_ONE` and `ADMIN_TWO` addresses

### ProfileRegistry — `0x2DE1Ed07C104E775aE7368b1B8e2AA669b5CE5C8`
- `mintProfile(name, bio, pfpHash, xUsername)` — costs 0.001 ETH, one-time
- `updateProfile()` — free updates after mint
- `hasProfile(address)` → bool

### AchievementRegistry — `0xE33651061F0Cb054A083E6E2C758ac1b81413832`
- NFT badges based on bet count: Starter(1), Caller(10), Oracle(50), OG(100)
- `mintBadge(badgeId)` — costs 0.001 ETH per badge
- `getEligibleBadges(address)` → which badges user can mint now

### PollRegistry — `0xf49E4AcDc164DB7907E485Ae5cD54D37da994089`
- `submitPoll(title, description)` — on-chain submission
- `vote(pollId)` — one vote per wallet
- `closeRound(winnerIds[3])` — admin selects top 3

---

## Database Schema (Supabase)

| Table | Purpose |
|---|---|
| `predictions_display` | Mirror of on-chain predictions + pool sizes + `x_monitor` JSONB |
| `bets` | All placed bets (wallet, side, amount, result, tx_hash) |
| `profiles` | User profiles mirrored from chain |
| `leaderboard` | Win/loss stats, total volume, PnL per wallet |
| `wallet_transactions` | Full tx log per wallet (bets, claims, faucets, badges) |
| `polls` | Active community poll submissions |
| `poll_votes` | Who voted on what |
| `poll_history` | Closed rounds and winners |
| `templates` | Admin prediction templates for quick creation |
| `x_monitor_logs` | Hourly resolver check log (triggered, condition, values) |

### `x_monitor` column (on `predictions_display`)
```json
{
  "handle": "elonmusk",
  "condition": "followers_gte",
  "target": 200000000,
  "active": true
}
```

---

## GitHub Actions Agents

### RialoBot — `agent/agent.js`
- **Schedule**: `0 8 * * *` (8AM UTC daily)
- Gets open markets from Supabase
- Deduplicates: never bets on same market twice
- Asks 4 AI models via Latch proxy (mistral → llama → qwen → gemma)
- Heuristic fallback if all models fail
- Places bet on-chain, records in Supabase

### X Resolver — `agents/x-resolver.js`
- **Schedule**: `0 * * * *` (every hour)
- Queries `predictions_display` for rows where `x_monitor.active = true`
- Fetches X account data via `api.fxtwitter.com` (no API key)
- Supported conditions: `followers_gte/lte`, `tweets_gte`, `has_new_post`, `pfp_changed`, `post_views_gte/likes_gte/reposts_gte/replies_gte`
- On trigger: calls `lockBetting(id)` on-chain, updates Supabase status, logs to `x_monitor_logs`

### Claim Agent — `agent/claim.js`
- **Schedule**: Weekly
- Checks RialoBot's claimable winnings
- Auto-claims and re-invests back to betting

---

## Security Model

| Asset | Protection |
|---|---|
| Admin private keys | GitHub Actions Secrets — never in code |
| RialoBot private key | GitHub Actions Secrets |
| X Resolver key | GitHub Actions Secrets (`RESOLVER_ADMIN_KEY`) |
| Latch token | GitHub Actions Secrets |
| Supabase service key | GitHub Actions Secrets |
| Supabase anon key | Public by design (in Vite bundle) |
| Session wallet key | User's `localStorage` only — never on any server |
| Funds | Smart contract enforced — Supabase is display only |
| Admin page | On-chain wallet check + frontend `isAdmin()` guard |

---

## RPC & External Services

| Service | URL | Purpose |
|---|---|---|
| Sepolia RPC | `ethereum-sepolia-rpc.publicnode.com` | Chain reads/writes |
| Supabase | `ftpweltnuwhwtqteydgi.supabase.co` | Database + realtime |
| Vercel | `rialocalls.vercel.app` | Frontend hosting |
| Latch (OnLatch) | `onlatch.com/proxy/api/v1` | AI proxy for RialoBot |
| fxtwitter | `api.fxtwitter.com` | X/Twitter data (no auth) |
| WalletConnect | Cloud project | Wallet connection |
