// agent/agent.js
// RialoBot — Daily AI Betting Agent
// Triggered by GitHub Actions at 8AM UTC daily.
// Places 1 AI-decided bet per day on an open prediction market.
// AI calls go through Latch (governance proxy) — NEVER direct to OpenRouter.
// DO NOT log the private key. GitHub Actions masks secrets automatically.

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createClient } from '@supabase/supabase-js'

// ─── ENVIRONMENT (GitHub Secrets) ─────────────────────────────────────────────
const AGENT_PRIVATE_KEY    = process.env.AGENT_PRIVATE_KEY
const LATCH_TOKEN          = process.env.LATCH_TOKEN
const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const BET_AMOUNT_RLO = '100'    // 100 RLO per bet (min is 10 RLO per contract)
const BETS_PER_RUN   = 1        // 1 bet per daily run
const RPC_URL        = 'https://ethereum-sepolia-rpc.publicnode.com'

// ─── CONTRACT ADDRESSES (Ethereum Sepolia) ────────────────────────────────────
const RLO_TOKEN    = '0x277C8aDbD292CB75CC5F0172714CF6842F4F90f1'
const BETTING_POOL = '0x16150779747feF42333a8FDD98E58BfE3CFe7cce'

// ─── SIDE CONSTANTS — must match contract (1=YES, 2=NO, 0=unset) ─────────────
const SIDE = { YES: 1, NO: 2 }

// ─── MINIMAL ABIs — verified against deployed contracts.js ───────────────────
const RLO_ABI = [
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'claim', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [],
  },
  {
    name: 'lastClaimed', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'CLAIM_INTERVAL', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
]

const BETTING_POOL_ABI = [
  {
    name: 'placeBet', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'id',     type: 'uint256' },
      { name: 'side',   type: 'uint8'   },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'isBettingLocked', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
]

// ─── VALIDATE ENV VARS ────────────────────────────────────────────────────────
if (!AGENT_PRIVATE_KEY || !LATCH_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing GitHub Secrets. Required:')
  console.error('   AGENT_PRIVATE_KEY, LATCH_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ─── CLIENTS — address logged, private key never logged ───────────────────────
const account        = privateKeyToAccount(`0x${AGENT_PRIVATE_KEY}`)
const publicClient   = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
const walletClient   = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) })
const supabase       = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const BET_AMOUNT_WEI = parseUnits(BET_AMOUNT_RLO, 18)

console.log('\n🤖 RialoBot — daily bet run')
console.log(`   Wallet:   ${account.address}`)
console.log(`   Bet size: ${BET_AMOUNT_RLO} RLO`)
console.log()

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Ensure RLO balance (faucet fallback if running low)
  await ensureRloBalance()

  // 2. Fetch open markets from Supabase predictions_display table
  const markets = await getOpenMarkets()
  console.log(`📊 Open eligible markets: ${markets.length}`)
  if (markets.length === 0) { console.log('No open markets. Exiting.'); return }

  // 3. Filter out markets agent already bet on (never bet twice on same market)
  const alreadyBetIds = await getAlreadyBetMarketIds()
  const eligible = markets.filter(m => !alreadyBetIds.has(String(m.id)))
  console.log(`   Already bet: ${alreadyBetIds.size} | New eligible: ${eligible.length}`)
  if (eligible.length === 0) { console.log('All open markets already have agent bets. Done.'); return }

  // 4. Pick 1 market (earliest deadline first, already sorted)
  const tobet = eligible.slice(0, BETS_PER_RUN)

  // 5. Place bet
  for (const market of tobet) {
    try {
      await placeBetOnMarket(market)
    } catch (err) {
      console.error(`❌ Bet failed for market ${market.id}: ${err.message}`)
    }
  }

  console.log('\n🏁 RialoBot run complete.')
}

// ─── ENSURE RLO BALANCE ───────────────────────────────────────────────────────
async function ensureRloBalance() {
  const balance = await publicClient.readContract({
    address: RLO_TOKEN, abi: RLO_ABI,
    functionName: 'balanceOf', args: [account.address],
  })
  const needed = BET_AMOUNT_WEI * BigInt(BETS_PER_RUN)
  console.log(`💰 RLO balance: ${formatUnits(balance, 18)} (need ${formatUnits(needed, 18)})`)

  if (balance >= needed) return

  console.log('⚠️ Balance low. Checking RLO faucet...')
  try {
    const lastClaimed   = await publicClient.readContract({
      address: RLO_TOKEN, abi: RLO_ABI,
      functionName: 'lastClaimed', args: [account.address],
    })
    const claimInterval = await publicClient.readContract({
      address: RLO_TOKEN, abi: RLO_ABI,
      functionName: 'CLAIM_INTERVAL', args: [],
    })
    const now      = BigInt(Math.floor(Date.now() / 1000))
    const nextTime = lastClaimed + claimInterval

    if (now < nextTime) {
      const hoursLeft = Number(nextTime - now) / 3600
      console.log(`⏳ Faucet cooldown: ${hoursLeft.toFixed(1)}h left. Proceeding with current balance.`)
      return
    }

    console.log('💧 Claiming from RLO faucet...')
    const hash = await walletClient.writeContract({
      address: RLO_TOKEN, abi: RLO_ABI,
      functionName: 'claim', args: [], gas: 100000n,
    })
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`✅ Faucet claimed. Tx: ${hash}`)
  } catch (err) {
    console.warn(`⚠️ Faucet unavailable: ${err.message}`)
  }
}

// ─── GET OPEN MARKETS ─────────────────────────────────────────────────────────
async function getOpenMarkets() {
  const { data, error } = await supabase
    .from('predictions_display')
    .select('id, title, description, status, yes_pool, no_pool, deadline, no_deadline')
    .eq('status', 'open')
    .order('deadline', { ascending: true })
    .limit(50)

  if (error) throw new Error(`Supabase error: ${error.message}`)

  const now    = Date.now()
  const active = (data || []).filter(m => {
    if (m.no_deadline) return true
    if (!m.deadline)   return true
    return new Date(m.deadline).getTime() > now
  })

  const verified = []
  for (const m of active.slice(0, 15)) {
    try {
      const locked = await publicClient.readContract({
        address: BETTING_POOL, abi: BETTING_POOL_ABI,
        functionName: 'isBettingLocked', args: [BigInt(m.id)],
      })
      if (!locked) verified.push(m)
    } catch {
      verified.push(m)
    }
  }
  return verified
}

// ─── GET ALREADY-BET MARKET IDs ───────────────────────────────────────────────
async function getAlreadyBetMarketIds() {
  const { data } = await supabase
    .from('bets')
    .select('prediction_id')
    .eq('wallet_address', account.address.toLowerCase())

  return new Set((data || []).map(b => String(b.prediction_id)))
}

// ─── ASK AI VIA LATCH ─────────────────────────────────────────────────────────
async function askAI(market) {
  const yesPool = parseFloat(market.yes_pool || 0)
  const noPool  = parseFloat(market.no_pool  || 0)
  const total   = yesPool + noPool
  const yesPct  = total > 0 ? ((yesPool / total) * 100).toFixed(1) : '50.0'
  const noPct   = total > 0 ? ((noPool  / total) * 100).toFixed(1) : '50.0'

  const deadline = market.no_deadline
    ? 'No deadline'
    : new Date(market.deadline).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })

  const prompt =
    `You are an AI prediction market trader. Analyze this market and decide.\n\n` +
    `Market: "${market.title}"\n` +
    `Description: "${market.description || 'No description.'}"\n` +
    `Current crowd: ${yesPct}% YES, ${noPct}% NO\n` +
    `Deadline: ${deadline}\n\n` +
    `Based on your knowledge, will this resolve YES or NO?\n` +
    `Respond with exactly one word: YES or NO`

  const response = await fetch('https://onlatch.com/proxy/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LATCH_TOKEN}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://rialocalls.vercel.app',
      'X-Title': 'RialoBot',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Latch/OpenRouter error ${response.status}: ${body.slice(0, 200)}`)
  }

  const json   = await response.json()
  const answer = (json.choices?.[0]?.message?.content || '').trim().toUpperCase()

  if (answer === 'YES' || answer.startsWith('YES')) return 'YES'
  if (answer === 'NO'  || answer.startsWith('NO'))  return 'NO'

  console.warn(`⚠️ AI responded "${answer}" (unexpected). Using random fallback.`)
  return Math.random() > 0.5 ? 'YES' : 'NO'
}

// ─── PLACE BET ON A MARKET ────────────────────────────────────────────────────
async function placeBetOnMarket(market) {
  console.log(`\n🎯 Market: "${market.title}" (ID: ${market.id})`)

  const decision = await askAI(market)
  const side     = decision === 'YES' ? SIDE.YES : SIDE.NO
  console.log(`🤖 AI decision: ${decision}`)

  const allowance = await publicClient.readContract({
    address: RLO_TOKEN, abi: RLO_ABI, functionName: 'allowance',
    args: [account.address, BETTING_POOL],
  })

  if (allowance < BET_AMOUNT_WEI) {
    console.log('📝 Approving RLO spend (one-time)...')
    const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    const approveHash = await walletClient.writeContract({
      address: RLO_TOKEN, abi: RLO_ABI, functionName: 'approve',
      args: [BETTING_POOL, MAX_UINT256], gas: 80000n,
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
    console.log(`✅ Approved. Tx: ${approveHash}`)
  }

  console.log(`💸 Betting ${BET_AMOUNT_RLO} RLO on ${decision}...`)
  const txHash = await walletClient.writeContract({
    address: BETTING_POOL, abi: BETTING_POOL_ABI, functionName: 'placeBet',
    args: [BigInt(market.id), side, BET_AMOUNT_WEI], gas: 250000n,
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  console.log(`✅ Bet placed! Tx: ${txHash}`)
  console.log(`   https://sepolia.etherscan.io/tx/${txHash}`)

  await recordBetInSupabase(market, decision, txHash)
}

// ─── RECORD BET IN SUPABASE ───────────────────────────────────────────────────
async function recordBetInSupabase(market, decision, txHash) {
  const wallet    = account.address.toLowerCase()
  const betAmtNum = parseFloat(BET_AMOUNT_RLO)

  const { error: betError } = await supabase.from('bets').insert({
    prediction_id:  market.id,
    wallet_address: wallet,
    side:           decision,
    amount:         betAmtNum,
    result:         'pending',
    payout:         0,
    tx_hash:        txHash,
  })
  if (betError) console.error(`⚠️ bets insert failed: ${betError.message}`)

  const { data: existing } = await supabase
    .from('leaderboard')
    .select('total_volume, total_calls')
    .eq('wallet_address', wallet)
    .single()

  if (existing) {
    await supabase.from('leaderboard').update({
      total_volume: (existing.total_volume || 0) + betAmtNum,
      total_calls:  (existing.total_calls  || 0) + 1,
      updated_at:   new Date().toISOString(),
    }).eq('wallet_address', wallet)
  } else {
    await supabase.from('leaderboard').insert({
      wallet_address: wallet,
      name:           'Rialo Agent 001',
      pfp_url:        'https://api.dicebear.com/7.x/bottts/svg?seed=rialobot',
      total_calls:    1,
      wins:           0,
      losses:         0,
      win_rate:       0,
      total_pnl:      0,
      total_volume:   betAmtNum,
      is_agent:       true,
      updated_at:     new Date().toISOString(),
    })
  }

  const poolField   = decision === 'YES' ? 'yes_pool' : 'no_pool'
  const poolCurrent = decision === 'YES'
    ? parseFloat(market.yes_pool || 0)
    : parseFloat(market.no_pool  || 0)

  await supabase.from('predictions_display').update({
    [poolField]: poolCurrent + betAmtNum,
  }).eq('id', market.id)

  await supabase.from('wallet_transactions').insert({
    wallet_address: wallet,
    type:           'bet',
    label:          `RialoBot bet ${betAmtNum} RLO on ${decision} — "${market.title}"`,
    tx_hash:        txHash,
  }).then(() => {}).catch(() => {})

  console.log('📊 Recorded in Supabase')
}

// ─── RUN ──────────────────────────────────────────────────────────────────────
main().catch(err => {
  console.error('\n💥 Fatal error:', err.message)
  process.exit(1)
})