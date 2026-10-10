// agent/claim.js
// RialoBot — Daily Claim Script
// Triggered by GitHub Actions at 8PM UTC daily.
// Scans all pending bets. For each settled market:
//   WIN  → claimWinnings on-chain, update bets to 'won', update leaderboard
//   LOSS → update bets to 'lost', update leaderboard (no on-chain action needed)
//   REFUND → claimRefund on-chain, update bets to 'refunded'
// DO NOT log the private key.

import { createPublicClient, createWalletClient, http, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createClient } from '@supabase/supabase-js'

// ─── ENVIRONMENT ──────────────────────────────────────────────────────────────
const AGENT_PRIVATE_KEY    = process.env.AGENT_PRIVATE_KEY
const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RPC_URL              = 'https://ethereum-sepolia-rpc.publicnode.com'
const BETTING_POOL         = '0x16150779747feF42333a8FDD98E58BfE3CFe7cce'

// Verified against deployed contracts.js
const BETTING_POOL_ABI = [
  {
    name: 'getUserBet', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'id',   type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      { name: 'side',    type: 'uint8'   },
      { name: 'amount',  type: 'uint256' },
      { name: 'claimed', type: 'bool'    },
    ],
  },
  {
    name: 'getClaimableAmount', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'id',   type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'claimWinnings', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'claimRefund', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
]

if (!AGENT_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing env vars: AGENT_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const account      = privateKeyToAccount(`0x${AGENT_PRIVATE_KEY}`)
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) })
const supabase     = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

console.log('\n🤖 RialoBot — daily claim run')
console.log(`   Wallet: ${account.address}\n`)

async function main() {
  const wallet = account.address.toLowerCase()

  const { data: pending, error } = await supabase
    .from('bets')
    .select('prediction_id, side, amount, result')
    .eq('wallet_address', wallet)
    .eq('result', 'pending')

  if (error) { console.error('Supabase error:', error.message); return }
  if (!pending?.length) { console.log('No pending bets. Nothing to claim.'); return }

  console.log(`📋 Checking ${pending.length} pending bet(s)...\n`)

  for (const bet of pending) {
    try {
      await checkAndClaim(bet, wallet)
      await new Promise(r => setTimeout(r, 2000))
    } catch (err) {
      console.error(`❌ Error on market ${bet.prediction_id}: ${err.message}`)
    }
  }

  console.log('\n🏁 Claim run complete.')
}

async function checkAndClaim(bet, wallet) {
  const { data: market } = await supabase
    .from('predictions_display')
    .select('status, title')
    .eq('id', bet.prediction_id)
    .single()

  if (!market) {
    console.log(`⚠️ Market ${bet.prediction_id} not found in DB. Skipping.`)
    return
  }

  const isSettled  = ['yes_wins', 'no_wins'].includes(market.status)
  const isRefunded = market.status === 'refunded'

  if (!isSettled && !isRefunded) {
    console.log(`⏳ "${market.title}": status=${market.status} — not yet settled`)
    return
  }

  const id = BigInt(bet.prediction_id)

  const [onChainSide, onChainAmount, alreadyClaimed] = await publicClient.readContract({
    address: BETTING_POOL, abi: BETTING_POOL_ABI,
    functionName: 'getUserBet', args: [id, account.address],
  })

  if (Number(onChainSide) === 0) {
    console.log(`⚠️ No on-chain bet for market ${bet.prediction_id}. Skipping.`)
    return
  }

  if (alreadyClaimed) {
    await supabase.from('bets')
      .update({ result: 'claimed' })
      .eq('prediction_id', bet.prediction_id)
      .eq('wallet_address', wallet)
    console.log(`✓ "${market.title}": already claimed on-chain — DB synced`)
    return
  }

  // ── REFUND ────────────────────────────────────────────────────────────────
  if (isRefunded) {
    console.log(`↩️ "${market.title}": claiming refund...`)
    const txHash = await walletClient.writeContract({
      address: BETTING_POOL, abi: BETTING_POOL_ABI,
      functionName: 'claimRefund', args: [id], gas: 150000n,
    })
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    await supabase.from('bets')
      .update({ result: 'refunded' })
      .eq('prediction_id', bet.prediction_id)
      .eq('wallet_address', wallet)
    console.log(`✅ Refund claimed. Tx: ${txHash}`)
    return
  }

  // ── WIN OR LOSS ───────────────────────────────────────────────────────────
  const winningSide = market.status === 'yes_wins' ? 1 : 2
  const agentWon    = Number(onChainSide) === winningSide
  const betAmt      = parseFloat(formatUnits(onChainAmount, 18))

  if (!agentWon) {
    await supabase.from('bets')
      .update({ result: 'lost', payout: 0 })
      .eq('prediction_id', bet.prediction_id)
      .eq('wallet_address', wallet)
    await updateLeaderboardLoss(wallet, betAmt)
    console.log(`😢 "${market.title}": LOST — ${betAmt} RLO`)
    return
  }

  const claimable = await publicClient.readContract({
    address: BETTING_POOL, abi: BETTING_POOL_ABI,
    functionName: 'getClaimableAmount', args: [id, account.address],
  })

  if (claimable === 0n) {
    console.log(`⚠️ "${market.title}": won but 0 claimable (already processed?)`)
    return
  }

  const payout = parseFloat(formatUnits(claimable, 18))
  console.log(`🏆 "${market.title}": WON! Claiming ${payout.toFixed(2)} RLO...`)

  const txHash = await walletClient.writeContract({
    address: BETTING_POOL, abi: BETTING_POOL_ABI,
    functionName: 'claimWinnings', args: [id], gas: 200000n,
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  console.log(`✅ Winnings claimed! Tx: ${txHash}`)

  await supabase.from('bets')
    .update({ result: 'won', payout })
    .eq('prediction_id', bet.prediction_id)
    .eq('wallet_address', wallet)

  await updateLeaderboardWin(wallet, payout, betAmt)
}

async function updateLeaderboardWin(wallet, payout, betAmt) {
  const { data: row } = await supabase
    .from('leaderboard')
    .select('wins, losses, total_pnl')
    .eq('wallet_address', wallet)
    .single()
  if (!row) return

  const wins    = (row.wins   || 0) + 1
  const losses  = row.losses  || 0
  const winRate = (wins + losses) > 0
    ? parseFloat(((wins / (wins + losses)) * 100).toFixed(2)) : 0

  await supabase.from('leaderboard').update({
    wins,
    win_rate:   winRate,
    total_pnl:  parseFloat(((row.total_pnl || 0) + (payout - betAmt)).toFixed(8)),
    updated_at: new Date().toISOString(),
  }).eq('wallet_address', wallet)
}

async function updateLeaderboardLoss(wallet, betAmt) {
  const { data: row } = await supabase
    .from('leaderboard')
    .select('wins, losses, total_pnl')
    .eq('wallet_address', wallet)
    .single()
  if (!row) return

  const losses  = (row.losses || 0) + 1
  const wins    = row.wins    || 0
  const winRate = (wins + losses) > 0
    ? parseFloat(((wins / (wins + losses)) * 100).toFixed(2)) : 0

  await supabase.from('leaderboard').update({
    losses,
    win_rate:   winRate,
    total_pnl:  parseFloat(((row.total_pnl || 0) - betAmt).toFixed(8)),
    updated_at: new Date().toISOString(),
  }).eq('wallet_address', wallet)
}

main().catch(err => {
  console.error('\n💥 Fatal:', err.message)
  process.exit(1)
})