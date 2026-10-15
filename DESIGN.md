# 🎨 Rialo Calls — Design System

> Visual language, component patterns, and UX principles

---

## 1. Design Philosophy

**Premium Dark.** Rialo Calls uses a luxury dark aesthetic — not generic dark mode, but a curated palette that feels expensive and intentional. Think high-end fintech meets crypto-native.

**Principles:**
- **Minimal noise** — Dark backgrounds let content breathe
- **Cream over white** — Pure white feels harsh; `#DFDBCF` feels warm and premium
- **Micro-animations everywhere** — The interface feels alive
- **Mobile-aware** — Responsive at all breakpoints
- **Web2 feel, Web3 power** — Users shouldn't feel like they're using a dApp

---

## 2. Color Palette

### Core Colors
| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#0A0A0A` | Page backgrounds |
| `--bg-surface` | `#111111` | Cards, modals |
| `--bg-elevated` | `#1A1A1A` | Inputs, nav, chat surface |
| `--text-primary` | `#DFDBCF` | Headings, primary text |
| `--text-secondary` | `#8B8B8B` | Subtext, labels |
| `--text-dim` | `#555555` | Disabled, placeholders |
| `--border` | `rgba(223,219,207,0.10)` | All card/input borders |
| `--border-hover` | `rgba(223,219,207,0.25)` | Hover states |

### Semantic Colors
| Token | Value | Usage |
|---|---|---|
| `--yes-color` | `#4ADE80` / green | YES side bets, wins |
| `--no-color` | `#F87171` / red-pink | NO side bets, losses |
| `--danger` | `#D94F4F` | Errors, destructive actions |
| `--warning` | `#F59E0B` | Warnings, deadlines close |
| `--locked` | `#F59E0B` | Locked prediction status |

### Gradient Accents
```css
/* Page radial glow — subtle depth */
background-image:
  radial-gradient(circle at 15% 30%, rgba(223,219,207,0.02) 0%, transparent 40%),
  radial-gradient(circle at 85% 70%, rgba(28,28,28,0.5) 0%, transparent 45%);

/* Particle glow */
rgba(223, 219, 207, 0.6)

/* Navbar sweep glow */
linear-gradient(90deg, transparent, rgba(223,219,207,0.08), transparent)
```

---

## 3. Typography

### Fonts
| Font | Usage | Import |
|---|---|---|
| **Cinzel** | Display headings (`--font-display`) | Google Fonts |
| **Inter** | Body text, UI elements (`--font-body`) | Google Fonts |

```css
--font-display: 'Cinzel', serif;
--font-body:    'Inter', sans-serif;
```

### Scale
| Element | Size | Weight |
|---|---|---|
| Page hero | `clamp(28px, 5vw, 48px)` | 700 |
| Section heading | `clamp(20px, 3vw, 28px)` | 700 |
| Card title | `16–18px` | 600 |
| Body text | `14–15px` | 400 |
| Labels / meta | `12–13px` | 400–500 |
| Micro text | `11px` | 400 |

---

## 4. Component Patterns

### Glass Card
The primary surface for all content blocks.
```css
.glass-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(223, 219, 207, 0.10);
  border-radius: 16px;
  backdrop-filter: blur(8px);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.glass-card:hover {
  border-color: rgba(223, 219, 207, 0.20);
  box-shadow: 0 4px 24px rgba(0,0,0,0.3);
}
```

### Primary Button (Cream)
```css
background: #DFDBCF;
color: #0A0A0A;
border: none;
border-radius: 8px;
padding: 12px 24px;
font-weight: 600;
font-size: 14px;
cursor: pointer;
transition: opacity 0.15s, transform 0.1s;
```
Hover: `opacity: 0.9`, subtle `scale(0.98)`

### Ghost Button
```css
background: transparent;
border: 1px solid rgba(223,219,207,0.20);
color: #DFDBCF;
border-radius: 8px;
/* hover: border brightens to 0.35 */
```

### Tab Navigation
Active tab has `background: rgba(223,219,207,0.10)` and cream text. Inactive has transparent bg and `#555555` text. Container has `background: #141414` and `border-radius: 10px`.

### Input Field
```css
background: #0F0F0F;
border: 1px solid rgba(223,219,207,0.10);
border-radius: 8px;
color: #DFDBCF;
padding: 9px 12px;
/* focus: border brightens */
```

### Status Badges
| Status | Color |
|---|---|
| `open` | Green `#4ADE80` |
| `locked` | Amber `#F59E0B` |
| `yes_wins` | Green `#4ADE80` |
| `no_wins` | Red `#F87171` |
| `refunded` | Gray `#8B8B8B` |

### Skeleton Loaders
```css
.skeleton {
  background: linear-gradient(90deg, #1A1A1A 25%, #222222 50%, #1A1A1A 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

---

## 5. Motion & Animation

### Principles
- All transitions: `0.15s–0.2s ease` for micro-interactions
- Page-level animations: `0.3s ease` for entrances
- Never animate layout — only `opacity`, `transform`, `color`, `border-color`
- Use `will-change: transform` only when animating frequently

### Key Animations
```css
/* Particle float */
@keyframes float {
  0%, 100% { transform: translateY(0px) }
  50%       { transform: translateY(-20px) }
}

/* Navbar sweep glow */
@keyframes sweep {
  0%   { transform: translateX(-100%) }
  100% { transform: translateX(100%) }
}

/* Skeleton shimmer */
@keyframes shimmer {
  0%   { background-position: -200% 0 }
  100% { background-position: 200% 0 }
}

/* Toast slide in */
@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0 }
  to   { transform: translateX(0);    opacity: 1 }
}

/* Pulse for loading indicator */
@keyframes pulse {
  0%, 100% { opacity: 1 }
  50%       { opacity: 0.4 }
}
```

---

## 6. Layout System

### Page Wrapper
```css
min-height: 100vh;
background: #0A0A0A;
display: flex;
flex-direction: column;
position: relative;
```

### Content Container
```css
max-width: 1120px;
margin: 0 auto;
padding: 40px 24px 80px;
width: 100%;
```

### Prediction Grid
```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
gap: 24px;
```

### Responsive Breakpoints
| Breakpoint | Max Width | Changes |
|---|---|---|
| Desktop | `> 768px` | Full grid, side-by-side layouts |
| Tablet | `≤ 768px` | Single column, stacked nav |
| Mobile | `≤ 480px` | Compressed padding, smaller type |

---

## 7. Key UX Patterns

### AppLoader
Full-screen branded loading screen that covers until:
1. wagmi resolves connection state
2. Session wallet derived (if stored)
3. `hasProfile` contract read completes
4. Supabase profile fetch completes (or 12s timeout)

Shows Rialo logo + animated progress indicator.

### Toast Notifications
- `showPending(msg)` — amber, top-right slide-in
- `showConfirmed(txHash)` — green with Etherscan link
- `showFailed(error)` — red with truncated error message
- Auto-dismiss after 5s

### Prediction Card States
```
Open     → YES/NO bet buttons, countdown timer, pool bars
Locked   → 🔒 badge, no bet buttons, shows user's position
Won      → ✅ Claim button (if winner), shows winning side
Refunded → ↩ Refund button (if user bet)
Deleted  → Renders null (hidden from grid)
```

### YES/NO Pool Bars
Gradient progress bars showing current split:
- YES: green gradient left-to-right
- NO: red gradient, fills from right
- Percentage labels update in real-time via Supabase realtime

### Calls Guide Chat
- Floating `💬` button — bottom-right, fixed position
- Opens `360×520px` dark chat panel
- Intent chips (quick action buttons) on bot messages
- Confirm/Cancel card for destructive actions
- Input disabled during transaction execution
- Smooth auto-scroll to latest message

---

## 8. Particle Background

`ParticleBackground` component renders `~30` CSS-animated particles:
- Sizes: `2–6px` circles
- Colors: cream variants at `0.2–0.6` opacity
- Float animation: randomised duration `4–8s`, random delays
- Fixed position, `z-index: 0`, pointer-events none
- Persists across all page navigations (renders in `App.jsx`)

---

## 9. Navbar Design

- Fixed top, `height: 64px`
- Dark background with subtle `backdrop-filter: blur`
- Sweep glow animation below navbar (separate `div.navbar-sweep-glow`)
- Left: Rialo logo + wordmark
- Right: wallet connect button, session wallet status
- Mobile: hamburger menu

---

## 10. Page-Specific Notes

### Landing Page `/`
- Hero section with logo, headline, CTA
- Stats ticker (total calls, callers, volume)
- No Calls Guide (hidden on landing)
- Particle background prominent

### Calls Page `/calls`
- Tab bar: All Calls / Community / Official / The Poll
- Prediction grid with `ErrorBoundary` per card
- Load More pagination (8 at a time)
- Music toggle button in header

### Profile Page `/profile`
- Session wallet card with balances + transaction history
- On-chain profile display
- Badge showcase
- Leaderboard position

### Admin Page `/admin`
- Tab bar: Predictions / Polls / 🔭 Resolver
- Full CRUD for predictions
- Resolver tab: configure X monitoring, view active/triggered
- Only accessible to `ADMIN_ONE` / `ADMIN_TWO` wallets
