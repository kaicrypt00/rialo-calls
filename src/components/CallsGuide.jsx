import { useState, useEffect, useRef, useCallback } from 'react'
import { createPublicClient, http, parseUnits, formatUnits, formatEther } from 'viem'
import { sepolia } from 'viem/chains'
import { useSessionWallet } from '../context/SessionWalletContext'
import { useProfile } from '../context/ProfileContext'
import { supabase } from '../config/supabase'
import {
  CONTRACT_ADDRESSES,
  BETTING_POOL_ABI,
  RLO_ABI,
  ACHIEVEMENT_REGISTRY_ABI,
  POLL_REGISTRY_ADDRESS,
  POLL_REGISTRY_ABI,
} from '../config/contracts'
import { useLocation } from 'react-router-dom'

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
})

const BADGE_INFO = [
  { id: 0, name: 'Starter',  icon: '🔮', threshold: 1   },
  { id: 1, name: 'Caller',   icon: '📡', threshold: 10  },
  { id: 2, name: 'Oracle',   icon: '🌀', threshold: 50  },
  { id: 3, name: 'OG',       icon: '👑', threshold: 100 },
]

// ─── Keyword parser ────────────────────────────────────────────────────────────
function detectIntent(text) {
  const t = text.toLowerCase().trim()

  // SENSITIVE — catch secret/key extraction attempts first, before any other check
  if (/\b(private key|secret key|api key|admin key|resolver key|give me.*key|show.*key|reveal.*key|tell.*key|what.*key|agent key|wallet key|supabase.*key|github.*key|latch.*token|give.*token|show.*token|mnemonic|seed phrase|password|credentials|env|environment variable|github secret|service role|tell me the|give me the|show me the|what is the key|access token|auth token|i am admin|i'm admin|im admin|i am the admin|i'm the admin|im the admin|pretend.*admin|act.*admin|as an admin|as admin)\b/.test(t)) return 'SENSITIVE'

  // GREETING only fires when no action keywords are present
  const hasAction = /\b(faucet|claim|bet|badge|poll|balance|market|refund|rlo|winnings|collect)\b/.test(t)
  if (!hasAction && /\b(hi|hello|hey|sup|yo|gm|good morning|start|begin)\b/.test(t)) return 'GREETING'
  if (/\b(faucet|free rlo|get rlo|claim rlo|rlo faucet|daily|monthly rlo)\b/.test(t)) return 'FAUCET'
  if (/\b(refund|get refund|my refund|claim refund)\b/.test(t)) return 'REFUND'
  if (/\b(claim|winnings|collect|my wins|my rewards|withdraw win)\b/.test(t)) return 'CLAIM'
  if (/\b(how.*bet|how to bet|how do i bet|betting guide|how.*place)\b/.test(t)) return 'HOW_TO_BET'
  if (/\b(bet|place bet|wager|call it|make a call|i want to bet|place a bet)\b/.test(t)) return 'BET'
  if (/\b(badge|badges|achievement|mint badge|my badges|nft)\b/.test(t)) return 'BADGE'
  if (/\b(poll|polls|suggest|submit idea|vote|poll idea|community poll)\b/.test(t)) return 'POLL'
  if (/\b(balance|wallet|how much|my rlo|my eth|funds|tokens)\b/.test(t)) return 'BALANCE'
  if (/\b(markets|open markets|active|what.*bet|show me|list market|all market)\b/.test(t)) return 'MARKETS'
  // X Resolver
  if (/\b(x resolver|resolver|x monitor|twitter monitor|auto lock|auto.*resolve|x account|monitor.*twitter|monitor.*x|fxtwitter|condition.*lock|lock.*condition|x.*condition)\b/.test(t)) return 'INFO_RESOLVER'
  // Architecture / tech
  if (/\b(architecture|tech stack|how.*built|how.*work|technical|contracts|supabase|viem|wagmi|sepolia|blockchain|on.?chain|smart contract|session wallet|how.*session|session.*key|how.*wallet.*work)\b/.test(t)) return 'INFO_ARCHITECTURE'
  // Admin
  if (/\b(admin|create.*prediction|manage.*prediction|declare.*winner|lock.*betting|admin.*panel|admin.*page|admin.*tab|who.*admin)\b/.test(t)) return 'INFO_ADMIN'
  // Security
  if (/\b(secure|security|safe|is it safe|is.*secure|hack|vulnerable|how.*protect|funds.*safe|my.*fund)\b/.test(t)) return 'INFO_SECURITY'
  if (/\b(novel|unique|different|special|innovative|standout|sets it apart|why.*use|why rialo calls|what makes.*special|what makes.*unique|what makes.*different|whats.*different|whats.*special|whats.*unique|how.*different|why.*different|key features?|main features?|best features?|cool features?|what.*doing|what.*built|what.*offer)\b/.test(t)) return 'INFO_NOVEL'
  if (/\b(future|roadmap|whats next|next plan|coming soon|upcoming|plans for|vision|what.*next|next.*plan)\b/.test(t)) return 'INFO_FUTURE'
  if (/\b(what is rialo calls|what.*rialo calls|about rialo calls|explain rialo)\b/.test(t)) return 'INFO_RIALO'
  if (/\b(what is rlo|rlo token|what.*rlo|tell.*rlo|explain rlo)\b/.test(t)) return 'INFO_RLO'
  if (/\b(what is latch|what.*latch|onlatch|latch.*proxy|how.*latch)\b/.test(t)) return 'INFO_LATCH'
  if (/\b(help|commands|what can you do|options|menu)\b/.test(t)) return 'HELP'

  return 'UNKNOWN'
}

// Parse "100 YES 1" or "bet 150 no 2" or "200 yes market 3" patterns
function parseBetInput(text) {
  // Strip action words so they don't interfere with number extraction
  const t = text.toLowerCase().replace(/\b(bet|place|wager|on|market|#)\b/g, ' ')
  const sideMatch = t.match(/\b(yes|no)\b/)
  // Get all numbers in order
  const nums = [...t.matchAll(/\b(\d+(\.\d+)?)\b/g)].map(m => parseFloat(m[1]))
  // First number = amount, last number (if different from first) = market index
  const amount = nums.length > 0 ? nums[0] : null
  const lastNum = nums.length > 1 ? nums[nums.length - 1] : null
  // Only use lastNum as index if it looks like a market number (small integer, different from amount)
  const index = (lastNum !== null && Number.isInteger(lastNum) && lastNum !== amount && lastNum <= 20)
    ? lastNum - 1
    : null
  return {
    amount,
    side: sideMatch ? sideMatch[1].toUpperCase() : null,
    index,
  }
}

// ─── Quick action chips shown at menu ─────────────────────────────────────────
const MENU_CHIPS = [
  { label: '🎯 Bet on a market',    intent: 'BET'     },
  { label: '💧 Claim faucet',       intent: 'FAUCET'  },
  { label: '🏆 Claim winnings',     intent: 'CLAIM'   },
  { label: '💰 My balance',         intent: 'BALANCE' },
  { label: '📋 Open markets',       intent: 'MARKETS' },
  { label: '🔮 My badges',          intent: 'BADGE'   },
  { label: '💡 Submit poll idea',   intent: 'POLL'    },
]

// ─── Main component ───────────────────────────────────────────────────────────
function CallsGuideCore() {
  const { sessionWallet, ethBalance, rloBalance, loadBalances } = useSessionWallet()
  const { profile, navState } = useProfile()

  const [open, setOpen]             = useState(false)
  const [messages, setMessages]     = useState([])
  const [input, setInput]           = useState('')
  const [pending, setPending]       = useState(null)  // { action, data } — waiting for confirm
  const [executing, setExecuting]   = useState(false)
  const [pollInput, setPollInput]   = useState(null)  // waiting for poll title from user
  const [betFlow, setBetFlow]       = useState(null)  // { markets } — waiting for user to pick
  const messagesEndRef              = useRef(null)
  const inputRef                    = useRef(null)

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      if (messages.length === 0) greet()
    }
  }, [open])

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function addBot(content, chips = [], isError = false) {
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      role: 'bot', content, chips, isError,
    }])
  }

  function addUser(content) {
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      role: 'user', content,
    }])
  }

  function showMenu() {
    addBot('What else can I help you with?', MENU_CHIPS)
  }

  function requireSessionWallet() {
    if (!sessionWallet) {
      addBot(
        "You need to activate your Rialo Calls Wallet first.\n" +
        "Click \"Activate Rialo Calls Wallet\" in the top right corner — it's a one-time signature, no gas needed. ⚡",
        [{ label: '↩ Back to menu', intent: 'MENU' }]
      )
      return false
    }
    return true
  }

  function requireProfile() {
    if (!profile) {
      addBot(
        "You need a profile to do that.\n" +
        "Head to your Profile page to mint your on-chain identity — costs 0.001 ETH, one time. 🎭",
        [{ label: '↩ Back to menu', intent: 'MENU' }]
      )
      return false
    }
    return true
  }

  async function logToWallet(type, label, amount = null, txHash = null) {
    if (!sessionWallet) return
    try {
      await supabase.from('wallet_transactions').insert({
        wallet_address: sessionWallet.address.toLowerCase(),
        type,
        label: `Calls Guide: ${label}`,
        amount,
        tx_hash: txHash,
      })
    } catch {}
  }

  // ─── Greeting ────────────────────────────────────────────────────────────────

  function greet() {
    const name = profile?.name ? ` ${profile.name}` : ''
    addBot(
      `Hey${name}! I'm Calls Guide 👋\nYour on-chain assistant for Rialo Calls.\n\nI can bet, claim rewards, check your balance, manage badges, submit polls, and answer any question about how Rialo Calls works — including the X Resolver, session wallet, smart contracts, and more.\n\nWhat would you like to do?`,
      MENU_CHIPS
    )
  }

  // ─── Intent handlers ─────────────────────────────────────────────────────────

  async function handleBalance() {
    if (!requireSessionWallet()) return
    await loadBalances()
    addBot(
      `Your Rialo Calls Wallet:\n\n💰 ETH: ${parseFloat(ethBalance).toFixed(4)} (for gas)\n🪙 RLO: ${parseFloat(rloBalance).toFixed(2)}`,
      [
        { label: '🎯 Bet on a market', intent: 'BET'    },
        { label: '💧 Claim faucet',    intent: 'FAUCET' },
        { label: '↩ Menu',             intent: 'MENU'   },
      ]
    )
  }

  async function handleFaucet() {
    if (!requireSessionWallet()) return
    try {
      const lastClaimed = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.RLO_TOKEN,
        abi: RLO_ABI,
        functionName: 'lastClaimed',
        args: [sessionWallet.address],
      })
      const INTERVAL = 30 * 24 * 3600
      const nowSec   = Math.floor(Date.now() / 1000)
      const nextSec  = Number(lastClaimed) + INTERVAL
      if (Number(lastClaimed) > 0 && nowSec < nextSec) {
        const remaining = nextSec - nowSec
        const days  = Math.floor(remaining / 86400)
        const hours = Math.floor((remaining % 86400) / 3600)
        addBot(
          `⏳ Next faucet claim available in ${days}d ${hours}h.\nCome back then to claim your free 1,000 RLO!`,
          [{ label: '↩ Menu', intent: 'MENU' }]
        )
      } else {
        addBot(
          '💧 1,000 RLO is ready to claim for free!\n\nThis is a monthly faucet — confirm to claim now.',
          [],
          false
        )
        setPending({ action: 'FAUCET', data: {} })
      }
    } catch {
      addBot('Could not check faucet status. Try again in a moment.', [{ label: '↩ Menu', intent: 'MENU' }], true)
    }
  }

  async function handleMarkets() {
    try {
      const { data: markets } = await supabase
        .from('predictions_display')
        .select('id, title, yes_pool, no_pool, status')
        .in('status', ['open', 'locked'])
        .order('created_at', { ascending: false })
        .limit(6)

      if (!markets || markets.length === 0) {
        addBot(
          'No open markets right now. Check back soon or ask the admin to create one!',
          [{ label: '↩ Menu', intent: 'MENU' }]
        )
        return
      }

      const lines = markets.map((m, i) => {
        const total  = parseFloat(m.yes_pool || 0) + parseFloat(m.no_pool || 0)
        const yesPct = total > 0 ? Math.round((parseFloat(m.yes_pool || 0) / total) * 100) : 50
        const status = m.status === 'locked' ? ' 🔒' : ''
        return `${i + 1}. ${m.title}${status}\n   YES ${yesPct}% · NO ${100 - yesPct}% · Pool: ${total.toFixed(0)} RLO`
      })

      addBot(
        `📋 Open markets right now:\n\n${lines.join('\n\n')}\n\nType "bet [amount] [YES/NO] [number]" to place a bet.\nExample: bet 100 YES 1`,
        [
          { label: '🎯 Place a bet', intent: 'BET'  },
          { label: '↩ Menu',         intent: 'MENU' },
        ]
      )
      setBetFlow({ markets })
    } catch {
      addBot('Could not load markets right now. Try again.', [{ label: '↩ Menu', intent: 'MENU' }], true)
    }
  }

  async function handleBet(raw = '') {
    if (!requireSessionWallet()) return
    if (!requireProfile()) return

    // Fetch open markets
    const { data: markets } = await supabase
      .from('predictions_display')
      .select('id, title, yes_pool, no_pool, status')
      .in('status', ['open'])
      .order('created_at', { ascending: false })
      .limit(8)

    if (!markets || markets.length === 0) {
      addBot('No open markets to bet on right now.', [{ label: '↩ Menu', intent: 'MENU' }])
      return
    }

    // Try to parse from raw input
    const parsed = parseBetInput(raw)

    if (parsed.amount && parsed.side && parsed.index !== null && markets[parsed.index]) {
      // Full parse success — go straight to confirm
      const market = markets[parsed.index]
      const rlo    = parseFloat(rloBalance)

      if (parsed.amount < 10) {
        addBot(
          `Minimum bet is 10 RLO. You entered ${parsed.amount} RLO.`,
          [{ label: '🎯 Try again', intent: 'BET' }, { label: '↩ Menu', intent: 'MENU' }]
        )
        return
      }
      if (rlo < parsed.amount) {
        addBot(
          `Not enough RLO. You have ${rlo.toFixed(2)} RLO, need ${parsed.amount} RLO.\n\nClaim free RLO from the faucet!`,
          [{ label: '💧 Claim faucet', intent: 'FAUCET' }, { label: '↩ Menu', intent: 'MENU' }]
        )
        return
      }

      setPending({
        action: 'BET',
        data: { market, amount: parsed.amount, side: parsed.side },
      })
      addBot(
        `Confirm bet:\n\n🎯 ${market.title}\n💠 Side: ${parsed.side}\n🪙 Amount: ${parsed.amount} RLO`,
      )
    } else {
      // No full parse — show markets and ask
      const lines = markets.map((m, i) => `${i + 1}. ${m.title}`)
      addBot(
        `Open markets:\n\n${lines.join('\n')}\n\nReply with: [amount] [YES/NO] [number]\nExample: 100 YES 2`,
        [{ label: '↩ Menu', intent: 'MENU' }]
      )
      setBetFlow({ markets })
    }
  }

  async function handleClaim() {
    if (!requireSessionWallet()) return
    try {
      const { data: bets } = await supabase
        .from('bets')
        .select('prediction_id, side, amount, result')
        .eq('wallet_address', sessionWallet.address.toLowerCase())
        .eq('result', 'won')

      // Also check for un-claimed on chain
      const claimable = []
      for (const bet of (bets || [])) {
        try {
          const amt = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.BETTING_POOL,
            abi: BETTING_POOL_ABI,
            functionName: 'getClaimableAmount',
            args: [BigInt(bet.prediction_id), sessionWallet.address],
          })
          if (amt > 0n) {
            const { data: pred } = await supabase
              .from('predictions_display')
              .select('title')
              .eq('id', bet.prediction_id)
              .single()
            claimable.push({
              id: bet.prediction_id,
              title: pred?.title || `Market #${bet.prediction_id}`,
              amount: formatUnits(amt, 18),
            })
          }
        } catch {}
      }

      if (claimable.length === 0) {
        addBot(
          'No claimable winnings right now.\nKeep betting to win! 🎯',
          [{ label: '🎯 Bet on a market', intent: 'BET' }, { label: '↩ Menu', intent: 'MENU' }]
        )
        return
      }

      const total = claimable.reduce((s, c) => s + parseFloat(c.amount), 0).toFixed(2)
      const lines = claimable.map(c => `• ${c.title.slice(0, 40)} → ~${parseFloat(c.amount).toFixed(2)} RLO`)
      addBot(`🏆 You have claimable winnings:\n\n${lines.join('\n')}\n\nTotal: ~${total} RLO`)
      setPending({ action: 'CLAIM', data: { claimable, total } })
    } catch {
      addBot('Could not fetch your winnings. Try again.', [{ label: '↩ Menu', intent: 'MENU' }], true)
    }
  }

  async function handleRefund() {
    if (!requireSessionWallet()) return
    try {
      const { data: preds } = await supabase
        .from('predictions_display')
        .select('id, title')
        .eq('status', 'refunded')

      const refundable = []
      for (const pred of (preds || [])) {
        try {
          const bet = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.BETTING_POOL,
            abi: BETTING_POOL_ABI,
            functionName: 'getUserBet',
            args: [BigInt(pred.id), sessionWallet.address],
          })
          // bet[0]=side, bet[1]=amount, bet[2]=claimed
          if (Number(bet[0]) > 0 && !bet[2] && bet[1] > 0n) {
            refundable.push({
              id: pred.id,
              title: pred.title,
              amount: formatUnits(bet[1], 18),
            })
          }
        } catch {}
      }

      if (refundable.length === 0) {
        addBot(
          'No refunds available right now.',
          [{ label: '↩ Menu', intent: 'MENU' }]
        )
        return
      }

      const total = refundable.reduce((s, r) => s + parseFloat(r.amount), 0).toFixed(2)
      const lines = refundable.map(r => `• ${r.title.slice(0, 40)} → ${parseFloat(r.amount).toFixed(2)} RLO`)
      addBot(`↩ Refundable bets:\n\n${lines.join('\n')}\n\nTotal: ${total} RLO`)
      setPending({ action: 'REFUND', data: { refundable, total } })
    } catch {
      addBot('Could not check refunds. Try again.', [{ label: '↩ Menu', intent: 'MENU' }], true)
    }
  }

  async function handleBadge() {
    if (!requireSessionWallet()) return
    try {
      const [s0, s1, s2, s3, count, eligible] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'hasBadge', args: [sessionWallet.address, 0] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'hasBadge', args: [sessionWallet.address, 1] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'hasBadge', args: [sessionWallet.address, 2] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'hasBadge', args: [sessionWallet.address, 3] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'getBetCount', args: [sessionWallet.address] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'getEligibleBadges', args: [sessionWallet.address] }),
      ])

      const statuses = [!!s0, !!s1, !!s2, !!s3]
      const betCount = Number(count)
      const eligibleIds = (eligible || []).map(n => Number(n))

      const lines = BADGE_INFO.map((b, i) => {
        if (statuses[i]) return `${b.icon} ${b.name} — ✅ Minted`
        if (eligibleIds.includes(i)) return `${b.icon} ${b.name} — 🔓 Eligible! (costs 0.001 ETH)`
        return `${b.icon} ${b.name} — 🔒 Need ${b.threshold} bets (you have ${betCount})`
      })

      const mintable = eligibleIds.filter(id => !statuses[id])

      if (mintable.length > 0) {
        addBot(`Your badges:\n\n${lines.join('\n')}\n\nYou can mint ${mintable.length} badge${mintable.length > 1 ? 's' : ''}!`)
        setPending({
          action: 'BADGE',
          data: { badgeId: mintable[0], badgeName: BADGE_INFO[mintable[0]].name, badgeIcon: BADGE_INFO[mintable[0]].icon },
        })
      } else {
        addBot(
          `Your badges:\n\n${lines.join('\n')}\n\nKeep betting to unlock more! 🎯`,
          [{ label: '🎯 Bet on a market', intent: 'BET' }, { label: '↩ Menu', intent: 'MENU' }]
        )
      }
    } catch {
      addBot('Could not load badge data. Try again.', [{ label: '↩ Menu', intent: 'MENU' }], true)
    }
  }

  async function handlePoll(raw = '') {
    if (!requireSessionWallet()) return
    if (!requireProfile()) return

    // If user typed something after "poll" — treat it as the poll title
    const stripped = raw.replace(/\b(poll|submit|idea|suggest|vote)\b/gi, '').trim()

    if (stripped.length >= 10) {
      addBot(`Submit this poll idea to the community?\n\n💡 "${stripped}"`)
      setPending({ action: 'POLL', data: { title: stripped, description: '' } })
    } else {
      addBot(
        "Tell me your bet idea! Submit it as a poll and the community will vote on it.\n\nJust type your idea title (min 10 characters):\nExample: Will Eric share the SharkCat picture at least 2 times in the next Builders Hub?",
        [{ label: '↩ Menu', intent: 'MENU' }]
      )
      setPollInput(true)
    }
  }

  // ─── Knowledge answers ────────────────────────────────────────────────────────

  function handleInfoRialo() {
    addBot(
      "🌐 Rialo Calls is a community prediction market built on the Rialo ecosystem.\n\n" +
      "Users bet YES or NO on real-world events using RLO tokens. Winners split the losing pool based on how much they bet.\n\n" +
      "Every bet, claim, and badge is recorded on Ethereum Sepolia — fully transparent and verifiable on-chain. 🔗",
      [{ label: '📋 View open markets', intent: 'MARKETS' }, { label: '↩ Menu', intent: 'MENU' }]
    )
  }

  function handleInfoNovel() {
    addBot(
      "🚀 What makes Rialo Calls genuinely different:\n\n" +
      "⚡ Session Wallet — Sign ONCE with MetaMask. That creates a personal in-browser wallet that handles every bet, claim, badge, and vote silently. No popups, no friction. Every transaction is still fully on-chain.\n\n" +
      "🤖 AI Participant (Rialo Agent 001) — A fully autonomous AI that wakes up daily, analyzes open markets, and places real on-chain bets. The platform stays active and engaging around the clock.\n\n" +
      "🔭 X Resolver — Predictions tied to Twitter/X events resolve automatically. The platform monitors the condition and closes betting the moment it's met — no manual step, no delay.\n\n" +
      "🔒 Latch Security — The AI agent's access is protected by Latch (OnLatch), Rialo's own infrastructure product. We don't just build on Rialo — we use their tools too.\n\n" +
      "🗳️ Community Polls — The community votes on what gets bet on. Top ideas each round become real markets. You shape what happens on the platform.\n\n" +
      "💬 Calls Guide — That's me. Just type what you need. No menus to dig through.\n\n" +
      "One line: Rialo Calls makes on-chain prediction markets feel like a consumer app. 🎯",
      [
        { label: '🔭 X Resolver',       intent: 'INFO_RESOLVER' },
        { label: '🔮 Future plans',     intent: 'INFO_FUTURE'   },
        { label: '🎯 Bet on a market',  intent: 'BET'           },
        { label: '↩ Menu',              intent: 'MENU'          },
      ]
    )
  }

  function handleInfoFuture() {
    addBot(
      "🔮 What's next for Rialo Calls:\n\n" +
      "🏗️ Rialo Mainnet — The biggest step. Once Rialo mainnet launches, Rialo Calls ships there. Real value, real stakes, real community.\n\n" +
      "🔭 X Resolver Expansion — More condition types, multiple handles per prediction, webhook notifications when conditions trigger.\n\n" +
      "🧠 Community Roadmap — The poll system is how the community votes on what gets built and what categories expand. The community literally decides.\n\n" +
      "📱 More Market Categories — Crypto, tech, sports, real-world events. Community-voted categories grow over time.\n\n" +
      "👥 Social Layer — Following top callers, sharing predictions, public reputation scores. The place where the sharpest minds compete.\n\n" +
      "🤖 More AI Agents — Rialo Agent 001 is first. More agents with different strategies join the market.\n\n" +
      "🌍 Vision: Rialo Calls becomes the home of community prediction on Rialo — where the community calls what happens next and the best callers earn. 🎯",
      [
        { label: '🚀 What makes it unique', intent: 'INFO_NOVEL'    },
        { label: '🔭 X Resolver',           intent: 'INFO_RESOLVER' },
        { label: '🎯 Bet on a market',      intent: 'BET'           },
        { label: '↩ Menu',                  intent: 'MENU'          },
      ]
    )
  }

  function handleInfoRLO() {
    addBot(
      "🪙 RLO is the token used inside Rialo Calls for betting.\n\n" +
      "• Claim 1,000 RLO free every 30 days from the faucet\n" +
      "• Minimum bet is 10 RLO\n" +
      "• RLO lives on Ethereum Sepolia — all transactions on-chain\n" +
      "• You need Sepolia ETH in your Rialo Calls Wallet to pay gas",
      [{ label: '💧 Claim faucet', intent: 'FAUCET' }, { label: '↩ Menu', intent: 'MENU' }]
    )
  }

  function handleInfoLatch() {
    addBot(
      "🔒 Latch is a product by OnLatch (part of the Rialo ecosystem) that acts as a secure proxy for AI.\n\n" +
      "Rialo Calls uses Latch to protect the AI agent that bets on markets daily. The agent's API key is shielded behind Latch's rules, so it's never exposed anywhere — not in the code, not anywhere.\n\n" +
      "Think of Latch as a firewall between the AI model and our infrastructure. It enforces exactly what the AI is allowed to do and nothing more.\n\n" +
      "Learn more at onlatch.com 🔗",
      [{ label: '↩ Menu', intent: 'MENU' }]
    )
  }

  function handleInfoResolver() {
    addBot(
      "🔭 The X Resolver — Rialo Calls' automatic prediction lock system.\n\n" +
      "When a prediction is connected to a real-world Twitter/X event, the platform monitors it automatically. For example: \"Will @elonmusk reach 200M followers?\"\n\n" +
      "How it works from your side:\n" +
      "• The prediction runs as normal — you bet YES or NO\n" +
      "• The platform checks the X condition automatically, around the clock\n" +
      "• The moment the condition is met, betting closes on-chain instantly\n" +
      "• No manual step needed — the market reacts to reality in real time\n\n" +
      "Supported conditions include: follower counts, tweet milestones, new posts, profile changes, post engagement, and more.\n\n" +
      "The whole process is automated and on-chain — fair, transparent, and tamper-proof. ⚡",
      [
        { label: '🚀 What makes it unique', intent: 'INFO_NOVEL' },
        { label: '↩ Menu',                  intent: 'MENU'       },
      ]
    )
  }

  function handleInfoArchitecture() {
    addBot(
      "🏗️ How Rialo Calls is built:\n\n" +
      "The frontend is a React app deployed on Vercel. It connects to Ethereum Sepolia via your MetaMask wallet.\n\n" +
      "📜 Smart Contracts (on-chain, public) — All the real logic lives here. Bets, payouts, profiles, badges, and polls are all enforced on-chain. The blockchain is the single source of truth for your funds.\n\n" +
      "⚡ Session Wallet — When you activate your Rialo Calls Wallet, a secure in-browser wallet is created from your MetaMask signature. It handles all transactions silently after that one sign. Nothing is sent to any server.\n\n" +
      "📊 Supabase — Used as a fast, real-time display layer. Prediction pools, leaderboards, and history load instantly. The blockchain remains the authority for all funds.\n\n" +
      "🤖 Automation — Background agents handle the AI daily bet and the X Resolver checks. Both act entirely on-chain.",
      [
        { label: '🔭 X Resolver',   intent: 'INFO_RESOLVER' },
        { label: '🔐 Is it safe?',   intent: 'INFO_SECURITY'  },
        { label: '↩ Menu',         intent: 'MENU'            },
      ]
    )
  }

  function handleInfoAdmin() {
    addBot(
      "Rialo Calls is run by the Rialo Calls team. 🎯\n\n" +
      "The team curates high-quality predictions, declares outcomes when events resolve, manages community polls, and keeps the platform running smoothly.\n\n" +
      "The important part: once an outcome is declared, your winnings are claimable directly on-chain. No one in between, no delays, no approval needed. The smart contract handles it. 🔒",
      [
        { label: '🔐 Is it safe?',   intent: 'INFO_SECURITY' },
        { label: '🎯 Bet now',       intent: 'BET'            },
        { label: '↩ Menu',          intent: 'MENU'           },
      ]
    )
  }

  function handleInfoSecurity() {
    addBot(
      "🔐 Your funds and assets are safe on Rialo Calls.\n\n" +
      "💎 Smart contract protected — All bet amounts, payouts, and refunds are enforced entirely by the smart contract. No person — not even the team — can move your funds. Claiming is always available directly to you on-chain.\n\n" +
      "🔑 Your session wallet — Your session key lives only in your own browser. It never touches any server. If you clear your browser data, just sign once with MetaMask to restore it instantly.\n\n" +
      "🔒 All backend secrets — Private keys and API tokens are stored securely in our deployment environment, never in the source code. The codebase has been verified clean.\n\n" +
      "✅ Bottom line: your RLO is safe in the contract, your session key is safe in your browser, and nothing about your funds depends on trusting us — it's all on-chain. 🎯",
      [
        { label: '🏗️ How it works', intent: 'INFO_ARCHITECTURE' },
        { label: '↩ Menu',          intent: 'MENU'               },
      ]
    )
  }

  function handleSensitive() {
    addBot(
      "I can't help with that. 🔒\n\nCalls Guide is here to help you bet, claim, explore markets, and learn about Rialo Calls — not to share internal configuration or credentials.\n\nIf you have a security concern, reach out to the team directly.",
      [{ label: '↩ Menu', intent: 'MENU' }]
    )
  }

  function handleHowToBet() {
    addBot(
      "🎯 How to bet on Rialo Calls:\n\n" +
      "1. Make sure you have RLO in your Rialo Calls Wallet\n" +
      "2. Pick an open market\n" +
      "3. Choose YES or NO\n" +
      "4. Enter your amount (min 10 RLO)\n" +
      "5. Confirm — transaction fires on-chain silently\n\n" +
      "Winners get a proportional share of the losing pool. The more you bet relative to the winning side, the more you earn. 🏆",
      [{ label: '📋 View open markets', intent: 'MARKETS' }, { label: '🎯 Bet now', intent: 'BET' }, { label: '↩ Menu', intent: 'MENU' }]
    )
  }

  function handleHelp() {
    addBot(
      "Here's what I can do for you:\n\n" +
      "🎯 Bet on open markets\n" +
      "💧 Claim free RLO (every 30 days)\n" +
      "🏆 Claim your winnings\n" +
      "↩  Claim a refund\n" +
      "💰 Check your wallet balance\n" +
      "📋 View open markets\n" +
      "🔮 Check and mint badges\n" +
      "💡 Submit a poll idea\n\n" +
      "You can also ask me anything about Rialo Calls — how it works, what makes it different, the X Resolver, your session wallet, security, the roadmap, and more.\n\n" +
      "Just type naturally!",
      MENU_CHIPS
    )
  }

  function handleUnknown() {
    addBot(
      "I'm not sure I caught that. Here's what I can help with:\n\n" +
      "You can ask about how Rialo Calls works, what the X Resolver is, how your session wallet works, whether it's safe, what RLO is, the roadmap, and more. Or just pick something below.",
      MENU_CHIPS
    )
  }

  // ─── Main message handler ─────────────────────────────────────────────────────

  async function handleMessage(text, fromChip = false) {
    if (!text.trim()) return
    if (!fromChip) addUser(text)
    setInput('')
    setBetFlow(null)

    const intent = fromChip ? text : detectIntent(text)

    switch (intent) {
      case 'GREETING':          greet();                        break
      case 'MENU':              showMenu();                     break
      case 'BALANCE':           await handleBalance();          break
      case 'FAUCET':            await handleFaucet();           break
      case 'MARKETS':           await handleMarkets();          break
      case 'BET':               await handleBet(text);          break
      case 'CLAIM':             await handleClaim();            break
      case 'REFUND':            await handleRefund();           break
      case 'BADGE':             await handleBadge();            break
      case 'POLL':              await handlePoll(text);         break
      case 'INFO_NOVEL':        handleInfoNovel();              break
      case 'INFO_FUTURE':       handleInfoFuture();             break
      case 'INFO_RIALO':        handleInfoRialo();              break
      case 'INFO_RLO':          handleInfoRLO();                break
      case 'INFO_LATCH':        handleInfoLatch();              break
      case 'INFO_RESOLVER':     handleInfoResolver();           break
      case 'INFO_ARCHITECTURE': handleInfoArchitecture();       break
      case 'INFO_ADMIN':        handleInfoAdmin();              break
      case 'INFO_SECURITY':     handleInfoSecurity();           break
      case 'SENSITIVE':         handleSensitive();              break
      case 'HOW_TO_BET':        handleHowToBet();               break
      case 'HELP':              handleHelp();                   break
      default:
        // Check if user is in a bet flow and typed amount/side/number
        if (betFlow?.markets) {
          await handleBet(text)
        } else if (pollInput) {
          if (text.trim().length >= 10) {
            setPollInput(false)
            addBot(`Submit this poll idea to the community?\n\n💡 "${text.trim()}"`)
            setPending({ action: 'POLL', data: { title: text.trim(), description: '' } })
          } else {
            addBot('Idea title is too short. Please write at least 10 characters.', [{ label: '↩ Menu', intent: 'MENU' }])
          }
        } else {
          handleUnknown()
        }
    }
  }

  // ─── Confirm / Cancel ─────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!pending || executing) return
    setExecuting(true)
    setPending(null)
    setBetFlow(null)
    setPollInput(false)

    try {
      // Check ETH for gas
      const ethBal = await publicClient.getBalance({ address: sessionWallet.address })
      if (ethBal < BigInt('500000000000000')) { // 0.0005 ETH minimum
        addBot(
          "⛽ Not enough ETH for gas.\n\nSend Sepolia ETH to your Rialo Calls Wallet:\n" +
          `${sessionWallet.address.slice(0, 10)}...${sessionWallet.address.slice(-6)}\n\n` +
          "Get free Sepolia ETH at:\ncloud.google.com/application/web3/faucet/ethereum/sepolia",
          [{ label: '↩ Menu', intent: 'MENU' }],
          true
        )
        setExecuting(false)
        return
      }

      const { action, data } = pending

      if (action === 'FAUCET') {
        addBot('⏳ Claiming your 1,000 RLO...')
        const txHash = await sessionWallet.client.writeContract({
          address: CONTRACT_ADDRESSES.RLO_TOKEN,
          abi: RLO_ABI,
          functionName: 'claim',
        })
        await logToWallet('faucet', 'Claimed 1,000 RLO from Faucet', 1000, txHash)
        await loadBalances()
        addBot(`✅ 1,000 RLO claimed!\nTx: ${txHash.slice(0, 10)}...`, [{ label: '💰 My balance', intent: 'BALANCE' }, { label: '↩ Menu', intent: 'MENU' }])
      }

      else if (action === 'BET') {
        const { market, amount, side } = data
        addBot(`⏳ Placing bet — ${amount} RLO on ${side}...`)
        const amountWei = parseUnits(amount.toString(), 18)

        // Check RLO allowance — approve first if needed (prevents Arithmetic revert)
        const allowance = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.RLO_TOKEN,
          abi: RLO_ABI,
          functionName: 'allowance',
          args: [sessionWallet.address, CONTRACT_ADDRESSES.BETTING_POOL],
        })
        if (allowance < amountWei) {
          addBot('⏳ Approving RLO spend...')
          const MAX = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
          const approveHash = await sessionWallet.client.writeContract({
            address: CONTRACT_ADDRESSES.RLO_TOKEN,
            abi: RLO_ABI,
            functionName: 'approve',
            args: [CONTRACT_ADDRESSES.BETTING_POOL, MAX],
          })
          const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
          if (approveReceipt.status === 'reverted') {
            throw new Error('RLO approval failed. Please try again.')
          }
        }

        const txHash = await sessionWallet.client.writeContract({
          address: CONTRACT_ADDRESSES.BETTING_POOL,
          abi: BETTING_POOL_ABI,
          functionName: 'placeBet',
          args: [BigInt(market.id), side === 'YES' ? 1 : 2, amountWei],
        })
        // Wait for on-chain confirmation before touching Supabase
        const betReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (betReceipt.status === 'reverted') {
          throw new Error('Bet failed on-chain. You may have already bet on this market, or the market is locked.')
        }

        // Update Supabase
        const yesPool = side === 'YES'
          ? parseFloat(market.yes_pool || 0) + amount
          : parseFloat(market.yes_pool || 0)
        const noPool = side === 'NO'
          ? parseFloat(market.no_pool || 0) + amount
          : parseFloat(market.no_pool || 0)

        await supabase.from('predictions_display').update({
          yes_pool: yesPool,
          no_pool: noPool,
        }).eq('id', market.id)

        await supabase.from('bets').insert({
          prediction_id: market.id,
          wallet_address: sessionWallet.address.toLowerCase(),
          side,
          amount,
          result: 'pending',
          tx_hash: txHash,
        })

        // Leaderboard
        const { data: lb } = await supabase.from('leaderboard').select('*').eq('wallet_address', sessionWallet.address.toLowerCase()).single()
        if (lb) {
          await supabase.from('leaderboard').update({
            total_calls: (lb.total_calls || 0) + 1,
            total_volume: parseFloat(lb.total_volume || 0) + amount,
            updated_at: new Date().toISOString(),
          }).eq('wallet_address', sessionWallet.address.toLowerCase())
        } else {
          await supabase.from('leaderboard').insert({
            wallet_address: sessionWallet.address.toLowerCase(),
            name: profile?.name || null,
            pfp_url: profile?.pfp_url || null,
            total_calls: 1,
            wins: 0,
            losses: 0,
            win_rate: 0,
            total_pnl: 0,
            total_volume: amount,
          })
        }

        await logToWallet('bet', `Bet ${side} ${amount} RLO — ${market.title.slice(0, 50)}`, amount, txHash)
        await loadBalances()
        // Signal PredictionCards to re-read chain data (hides YES/NO buttons, shows bet)
        window.dispatchEvent(new CustomEvent('rialo-bet-placed', { detail: { predictionId: market.id } }))
        addBot(
          `✅ Bet placed!\n\n🎯 ${market.title.slice(0, 60)}\n💠 ${side} — ${amount} RLO\nTx: ${txHash.slice(0, 10)}...`,
          [{ label: '📋 View markets', intent: 'MARKETS' }, { label: '↩ Menu', intent: 'MENU' }]
        )
      }

      else if (action === 'CLAIM') {
        const { claimable } = data
        let totalClaimed = 0
        addBot(`⏳ Claiming ${claimable.length} market${claimable.length > 1 ? 's' : ''}...`)
        for (const c of claimable) {
          try {
            const txHash = await sessionWallet.client.writeContract({
              address: CONTRACT_ADDRESSES.BETTING_POOL,
              abi: BETTING_POOL_ABI,
              functionName: 'claimWinnings',
              args: [BigInt(c.id)],
            })
            const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
            if (claimReceipt.status === 'reverted') throw new Error('claimWinnings reverted')
            await supabase.from('bets').update({ result: 'claimed' }).eq('prediction_id', c.id).eq('wallet_address', sessionWallet.address.toLowerCase())
            await logToWallet('claim', `Claimed winnings — ${c.title.slice(0, 50)}`, parseFloat(c.amount), txHash)
            totalClaimed += parseFloat(c.amount)
          } catch {}
        }
        await loadBalances()
        addBot(
          `✅ Claimed ~${totalClaimed.toFixed(2)} RLO in winnings!`,
          [{ label: '💰 My balance', intent: 'BALANCE' }, { label: '↩ Menu', intent: 'MENU' }]
        )
      }

      else if (action === 'REFUND') {
        const { refundable } = data
        let total = 0
        addBot(`⏳ Claiming refunds...`)
        for (const r of refundable) {
          try {
            const txHash = await sessionWallet.client.writeContract({
              address: CONTRACT_ADDRESSES.BETTING_POOL,
              abi: BETTING_POOL_ABI,
              functionName: 'claimRefund',
              args: [BigInt(r.id)],
            })
            const refundReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
            if (refundReceipt.status === 'reverted') throw new Error('claimRefund reverted')
            await supabase.from('bets').update({ result: 'refunded' }).eq('prediction_id', r.id).eq('wallet_address', sessionWallet.address.toLowerCase())
            await logToWallet('refund', `Refund — ${r.title.slice(0, 50)}`, parseFloat(r.amount), txHash)
            total += parseFloat(r.amount)
          } catch {}
        }
        await loadBalances()
        addBot(
          `✅ Refunded ${total.toFixed(2)} RLO to your wallet.`,
          [{ label: '💰 My balance', intent: 'BALANCE' }, { label: '↩ Menu', intent: 'MENU' }]
        )
      }

      else if (action === 'BADGE') {
        const { badgeId, badgeName, badgeIcon } = data
        addBot(`⏳ Minting ${badgeIcon} ${badgeName} badge...`)
        const txHash = await sessionWallet.client.writeContract({
          address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY,
          abi: ACHIEVEMENT_REGISTRY_ABI,
          functionName: 'mintBadge',
          args: [badgeId],
          value: BigInt('1000000000000000'),
        })
        const badgeReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (badgeReceipt.status === 'reverted') throw new Error('mintBadge reverted on-chain.')
        await logToWallet('admin_action', `Minted ${badgeName} badge`, null, txHash)
        addBot(
          `✅ ${badgeIcon} ${badgeName} badge minted on-chain!\nTx: ${txHash.slice(0, 10)}...`,
          [{ label: '🔮 My badges', intent: 'BADGE' }, { label: '↩ Menu', intent: 'MENU' }]
        )
      }

      else if (action === 'POLL') {
        const { title, description } = data
        addBot(`⏳ Submitting your poll idea on-chain...`)
        const txHash = await sessionWallet.client.writeContract({
          address: POLL_REGISTRY_ADDRESS,
          abi: POLL_REGISTRY_ABI,
          functionName: 'submitPoll',
          args: [title, description],
        })
        const pollReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (pollReceipt.status === 'reverted') throw new Error('Poll submission reverted on-chain.')
        await logToWallet('poll_submit', `Submitted poll: ${title.slice(0, 60)}`, null, txHash)
        addBot(
          `✅ Poll idea submitted!\n\n💡 "${title}"\n\nThe community can now vote on it in The Poll tab.`,
          [{ label: '↩ Menu', intent: 'MENU' }]
        )
      }

    } catch (e) {
      const msg = e?.shortMessage || e?.message || 'Transaction failed'
      if (msg.toLowerCase().includes('gas') || msg.toLowerCase().includes('insufficient')) {
        addBot(
          "⛽ Gas error — make sure your Rialo Calls Wallet has Sepolia ETH.\n\n" +
          "Get free ETH at:\ncloud.google.com/application/web3/faucet/ethereum/sepolia",
          [{ label: '↩ Menu', intent: 'MENU' }],
          true
        )
      } else if (msg.toLowerCase().includes('already claimed')) {
        addBot('Already claimed this period. Come back in 30 days.', [{ label: '↩ Menu', intent: 'MENU' }], true)
      } else if (msg.toLowerCase().includes('already placed') || msg.toLowerCase().includes('already bet')) {
        addBot("You've already bet on this market.", [{ label: '📋 Other markets', intent: 'MARKETS' }, { label: '↩ Menu', intent: 'MENU' }], true)
      } else if (msg.toLowerCase().includes('bets are lo') || msg.toLowerCase().includes('locked') || msg.toLowerCase().includes('betting is')) {
        addBot('🔒 Betting is closed on this prediction. It has already been locked.', [{ label: '📋 Other markets', intent: 'MARKETS' }, { label: '↩ Menu', intent: 'MENU' }], true)
      } else {
        addBot(`Something went wrong: ${msg.slice(0, 80)}`, [{ label: '↩ Menu', intent: 'MENU' }], true)
      }
    }

    setExecuting(false)
  }

  function handleCancel() {
    setPending(null)
    setBetFlow(null)
    setPollInput(false)
    addBot('Cancelled.', MENU_CHIPS)
  }

  // ─── UI ───────────────────────────────────────────────────────────────────────

  const C = {
    bg:       '#111111',
    surface:  '#1A1A1A',
    border:   'rgba(223,219,207,0.10)',
    cream:    '#DFDBCF',
    gray:     '#8B8B8B',
    dim:      '#555555',
    danger:   '#D94F4F',
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          width: '52px', height: '52px', borderRadius: '50%',
          background: open ? '#272727' : C.cream,
          color: open ? C.cream : '#0A0A0A',
          border: 'none', cursor: 'pointer',
          fontSize: '22px', zIndex: 9998,
          boxShadow: `0 4px 20px rgba(223,219,207,${open ? '0.1' : '0.25'})`,
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Calls Guide"
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '86px', right: '24px',
          width: '360px', height: '520px',
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: '16px',
          display: 'flex', flexDirection: 'column',
          zIndex: 9997,
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', gap: '10px',
            background: C.surface,
          }}>
            <div>
              <div style={{ color: C.cream, fontSize: '14px', fontWeight: '600' }}>Calls Guide</div>
              <div style={{ color: C.dim, fontSize: '11px' }}>Rialo Calls assistant</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            {messages.map(msg => (
              <div key={msg.id}>
                {msg.role === 'user' ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                      background: 'rgba(223,219,207,0.12)',
                      border: `1px solid rgba(223,219,207,0.15)`,
                      color: C.cream, borderRadius: '12px 12px 2px 12px',
                      padding: '8px 12px', maxWidth: '85%',
                      fontSize: '13px', lineHeight: '1.5',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{
                      background: msg.isError ? 'rgba(217,79,79,0.08)' : C.surface,
                      border: `1px solid ${msg.isError ? 'rgba(217,79,79,0.2)' : C.border}`,
                      color: msg.isError ? '#D94F4F' : C.cream,
                      borderRadius: '12px 12px 12px 2px',
                      padding: '10px 12px', maxWidth: '90%',
                      fontSize: '13px', lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>
                    {/* Action chips */}
                    {msg.chips && msg.chips.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', maxWidth: '90%' }}>
                        {msg.chips.map((chip, i) => (
                          <button
                            key={i}
                            onClick={() => handleMessage(chip.intent, true)}
                            disabled={executing}
                            style={{
                              background: 'rgba(223,219,207,0.07)',
                              border: `1px solid rgba(223,219,207,0.15)`,
                              color: C.gray, borderRadius: '20px',
                              padding: '5px 12px', fontSize: '12px',
                              cursor: executing ? 'not-allowed' : 'pointer',
                              opacity: executing ? 0.5 : 1,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (!executing) { e.target.style.color = C.cream; e.target.style.borderColor = 'rgba(223,219,207,0.35)' }}}
                            onMouseLeave={e => { e.target.style.color = C.gray; e.target.style.borderColor = 'rgba(223,219,207,0.15)' }}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Confirm card */}
            {pending && !executing && (
              <div style={{
                background: 'rgba(223,219,207,0.05)',
                border: `1px solid rgba(223,219,207,0.2)`,
                borderRadius: '12px', padding: '12px',
                display: 'flex', gap: '8px', marginTop: '4px',
              }}>
                <button
                  onClick={handleConfirm}
                  style={{
                    flex: 1, background: C.cream, color: '#0A0A0A',
                    border: 'none', borderRadius: '8px',
                    padding: '10px', fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Confirm ✅
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    flex: 1, background: 'transparent',
                    border: `1px solid ${C.border}`, color: C.gray,
                    borderRadius: '8px', padding: '10px',
                    fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  Cancel ✗
                </button>
              </div>
            )}

            {/* Executing indicator */}
            {executing && (
              <div style={{ color: C.dim, fontSize: '12px', padding: '4px 2px', animation: 'pulse 1.5s infinite' }}>
                Processing on-chain...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex', gap: '8px',
            background: C.surface,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !executing) { e.preventDefault(); handleMessage(input) }}}
              placeholder={pending ? 'Confirm or cancel above...' : 'Type or pick an option...'}
              disabled={executing || !!pending}
              style={{
                flex: 1, background: '#0F0F0F',
                border: `1px solid ${C.border}`,
                borderRadius: '8px', padding: '9px 12px',
                color: C.cream, fontSize: '13px',
                outline: 'none',
                opacity: (executing || pending) ? 0.5 : 1,
              }}
            />
            <button
              onClick={() => { if (!executing && !pending) handleMessage(input) }}
              disabled={executing || !!pending || !input.trim()}
              style={{
                background: input.trim() && !executing && !pending ? C.cream : '#272727',
                color: input.trim() && !executing && !pending ? '#0A0A0A' : C.dim,
                border: 'none', borderRadius: '8px',
                padding: '9px 14px', fontSize: '13px',
                cursor: (executing || pending || !input.trim()) ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Wrapper — only reads location, renders nothing on landing page.
// This prevents the Rules of Hooks violation that occurred when the early
// return was placed after useState/useRef but before useEffect declarations.
export default function CallsGuide() {
  const location = useLocation()
  if (location.pathname === '/') return null
  return <CallsGuideCore />
}
