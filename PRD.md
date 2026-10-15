# 📋 Rialo Calls — Product Requirements Document (PRD)

> Version 1.1 — Updated post X Resolver launch  
> Network: Ethereum Sepolia  
> Live: [rialocalls.vercel.app](https://rialocalls.vercel.app)

---

## 1. Product Vision

**Rialo Calls** is a community prediction market where users bet YES or NO on real-world events using RLO tokens. Winners split the losing pool proportionally. Every prediction, bet, claim, and badge is enforced on-chain — no custodian, no middleman.

**One-line vision:** Make on-chain prediction markets feel like a consumer app.

---

## 2. Core Problems Solved

| Problem | Solution |
|---|---|
| Web3 apps require a wallet popup for every action | Session Wallet — sign once, all txs fire silently |
| Prediction markets are admin-dependent (manual locking) | X Resolver — auto-locks markets when real-world X conditions are met |
| Dead platforms with no activity | RialoBot AI Agent — bets daily with zero human input |
| Hard to know what to bet on | Community Polls — community votes on what becomes a market |
| Complex UX scares new users | Calls Guide chatbot — just type what you want |

---

## 3. Users

### End User (Caller)
- Connects MetaMask, activates session wallet
- Mints on-chain profile (name, bio, PFP, X username)
- Claims free RLO from faucet (1,000/month)
- Bets YES/NO on open predictions
- Claims winnings or refunds
- Mints achievement badges
- Submits and votes on community poll ideas
- Climbs the leaderboard

### Admin
- Creates and manages predictions
- Activates X Resolver monitoring on predictions
- Declares winners after events resolve
- Manages community polls and rounds
- Has 2 admin wallet slots (ADMIN_ONE, ADMIN_TWO)

### RialoBot (AI Agent)
- Fully automated, no human operator
- Bets daily on open markets using AI decision
- Appears on the leaderboard as "Rialo Agent 001"
- Makes the platform feel alive even with zero users

---

## 4. Features

### 4.1 Session Wallet ⭐ Core Innovation
- User signs one fixed message with MetaMask
- `keccak256(signature)` → deterministic private key → session wallet
- Stored in `localStorage` keyed by main wallet address
- All bets, claims, badges, votes use session wallet — zero popups
- Fully recoverable: same MetaMask always produces same key
- ETH for gas must be funded separately into session wallet

### 4.2 Prediction Markets
- Admin creates predictions with: title, description, banner, deadline, category
- Categories: `community_calls`, `official_calls`
- Statuses: `open → locked → yes_wins | no_wins | refunded | deleted`
- Pool model: all YES bettors vs all NO bettors, proportional payout
- Minimum bet: 10 RLO
- Users bet exactly once per prediction per session wallet

### 4.3 🔭 X Resolver (Auto-Lock System)
- Admin activates X monitoring on any open prediction
- Sets: X handle, condition type, target threshold
- **Supported conditions:**
  - `followers_gte` / `followers_lte` — follower count threshold
  - `tweets_gte` — tweet count milestone
  - `has_new_post` — any new post since activation
  - `pfp_changed` — profile picture changed
  - `post_views_gte` / `post_likes_gte` / `post_reposts_gte` / `post_replies_gte`
- GitHub Actions checks every hour via `api.fxtwitter.com`
- On trigger: calls `lockBetting()` on-chain automatically
- Admin still declares the winner manually after event resolves
- Full log in `x_monitor_logs` Supabase table

### 4.4 RialoBot — AI Betting Agent
- Runs daily at 8AM UTC via GitHub Actions
- Reads open markets from Supabase
- Never bets on the same market twice
- Asks AI (Latch proxy → 4 model fallback chain):
  - `mistralai/mistral-7b-instruct:free`
  - `meta-llama/llama-3.2-3b-instruct:free`
  - `qwen/qwen-2.5-7b-instruct:free`
  - `google/gemma-3-4b-it:free`
- Heuristic crowd-follow fallback if all AI models fail
- Bets 100 RLO per run, records everything in Supabase

### 4.5 On-Chain Profiles
- `mintProfile()` — 0.001 ETH one-time, stores name/bio/PFP hash/X username
- Supabase mirrors chain data with localStorage cache-first loading
- Profile required before placing bets (enforced in frontend)
- `updateProfile()` — free after mint

### 4.6 Achievement Badges
- NFT badges on-chain (AchievementRegistry contract)
- 4 tiers: 🔮 Starter (1 bet), 📡 Caller (10), 🌀 Oracle (50), 👑 OG (100)
- `mintBadge(badgeId)` — 0.001 ETH, minted when eligible
- Calls Guide can check eligibility and mint in-chat

### 4.7 Community Polls
- Anyone with a profile can submit a poll idea on-chain
- Community votes (one vote per wallet)
- Admin closes rounds and selects top 3 — those become real markets
- Full history of past rounds

### 4.8 Leaderboard
- Tracks: total calls, wins, losses, win rate, total volume, PnL
- Updated on every bet and claim
- Includes RialoBot as a real participant
- Top 10 by total PnL

### 4.9 Calls Guide (In-App Chatbot)
- Floating chat bubble on all pages except landing
- Intent detection from natural language
- **Actions it can execute:** bet, claim faucet, claim winnings, claim refund, check balance, view markets, mint badges, submit polls
- **Knowledge topics:** X Resolver, session wallet, architecture, security, admin features, RLO, Latch, roadmap, how betting works
- Personalised greeting using profile name
- All transactions executed on-chain from the chat

### 4.10 Faucet
- Built into RLO Token contract
- 1,000 RLO per claim, 30-day cooldown
- Available via Calls Guide or `/faucet` page

---

## 5. Data Architecture

### On-Chain (source of truth for funds)
- All bet amounts, pool sizes, winners → BettingPool contract
- All profiles → ProfileRegistry contract
- All badges → AchievementRegistry contract
- All polls → PollRegistry contract

### Supabase (display layer, real-time UX)
- Mirrors on-chain state for fast reads
- Real-time subscriptions push updates to all connected clients
- `x_monitor` JSONB column on `predictions_display` stores resolver config
- `x_monitor_logs` table records every hourly resolver check

### Client-Side Caching
- 3-layer: in-memory (React state) → localStorage (5min TTL) → Supabase
- Predictions pre-fetched 300ms after mount, served instantly to pages
- Realtime subscription busts cache immediately on DB change

---

## 6. Security Requirements

- No private keys or API tokens in source code — ever
- All secrets in GitHub Actions Secrets only
- Session wallet stored in user's localStorage only — no server
- Smart contracts enforce all bet/claim/payout rules — Supabase is read-only display
- Admin functions gated by wallet address on-chain
- `.gitignore` blocks `.env`, `*.mjs`, `*.sql`, `*.ps1` from being committed

---

## 7. Performance Requirements

- App initialization: `< 2s` (cache-warm), `< 6s` cold start
- 12s safety timeout prevents infinite hang on slow RPC
- Prediction cards load from cache — no loading flash on tab switch
- Realtime updates: `< 500ms` propagation to all clients after DB change

---

## 8. GitHub Actions Secrets Required

| Secret | Used By |
|---|---|
| `AGENT_PRIVATE_KEY` | RialoBot betting agent |
| `LATCH_TOKEN` | RialoBot AI proxy |
| `RESOLVER_ADMIN_KEY` | X Resolver on-chain locking |
| `SUPABASE_URL` | All agents |
| `SUPABASE_SERVICE_ROLE_KEY` | All agents (full DB access) |
| `SUPABASE_ANON_KEY` | X Resolver (read predictions) |

---

## 9. Roadmap

| Phase | Item | Status |
|---|---|---|
| v1 | Prediction markets, betting, claims, refunds | ✅ Live |
| v1 | Session wallet (gasless UX) | ✅ Live |
| v1 | RialoBot AI agent | ✅ Live |
| v1 | On-chain profiles, badges, leaderboard | ✅ Live |
| v1 | Community polls | ✅ Live |
| v1 | Calls Guide chatbot | ✅ Live |
| v1.1 | X Resolver (auto-lock via X conditions) | ✅ Live |
| v1.1 | Admin Resolver tab | ✅ Live |
| v2 | X Resolver — more condition types | 🔜 |
| v2 | Social layer (follow callers, share predictions) | 🔜 |
| v2 | More market categories (voted by community) | 🔜 |
| v2 | More AI agents with different strategies | 🔜 |
| v3 | Rialo Mainnet launch | 🔜 |
