// agents/x-resolver.js
// X Resolver — monitors X accounts every hour and locks predictions when conditions are met
// Runs on GitHub Actions. Never runs on localhost.
// DO NOT log the admin private key.

import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createClient } from '@supabase/supabase-js'

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// All values come from GitHub Actions secrets / environment variables.
// RESOLVER_ADMIN_KEY  = private key of the admin wallet (added as GitHub secret)
// SUPABASE_URL        = your Supabase project URL
// SUPABASE_ANON_KEY   = your Supabase anon key (RLS is off on this project)

const ADMIN_KEY    = process.env.RESOLVER_ADMIN_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY

// BettingPool contract address on Sepolia
const BETTING_POOL = '0x16150779747feF42333a8FDD98E58BfE3CFe7cce'

// Public Sepolia RPC — no API key needed
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

// fxtwitter is an open X proxy API — no auth required
const FXTWITTER = 'https://api.fxtwitter.com'

// Minimal ABI — we only need lockBetting(uint256 id)
const LOCK_ABI = [
  {
    name: 'lockBetting',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const account = privateKeyToAccount(
  ADMIN_KEY.startsWith('0x') ? ADMIN_KEY : `0x${ADMIN_KEY}`
)

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC_URL),
})

// ─── FXTWITTER HELPERS ────────────────────────────────────────────────────────

const FX_HEADERS = {
  'User-Agent': 'RialoCallsResolver/1.0',
  'Accept': 'application/json',
}

async function fetchUserData(handle) {
  try {
    const res = await fetch(`${FXTWITTER}/${handle}`, { headers: FX_HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      user:   data?.user   ?? null,
      tweets: data?.tweets ?? [],
    }
  } catch (e) {
    return null
  }
}

async function fetchTweet(handle, tweetId) {
  try {
    const res = await fetch(`${FXTWITTER}/${handle}/status/${tweetId}`, { headers: FX_HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data?.tweet ?? null
  } catch (e) {
    return null
  }
}

// Get the single most recent tweet for a handle.
// Required for next_tweet_* condition types.
async function fetchLatestTweet(handle) {
  const userData = await fetchUserData(handle)
  if (!userData || !userData.tweets || userData.tweets.length === 0) return null
  return [...userData.tweets].sort(
    (a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0)
  )[0] ?? null
}

// ─── CONDITION CHECKERS ───────────────────────────────────────────────────────

async function checkCondition(prediction, monitor) {
  const {
    condition_type,
    handle,
    threshold,
    tweet_id,
    last_tweet_id,
    last_pfp_url,
    last_verified,
    activation_timestamp,
  } = monitor

  // ── GROUP A: Account-level conditions ──────────────────────────────────────
  if (['follower_count', 'tweet_count', 'pfp_change',
       'verification_change', 'new_post'].includes(condition_type)) {

    const userData = await fetchUserData(handle)
    if (!userData) return { error: `fxtwitter returned null for @${handle}` }

    const { user, tweets } = userData

    if (condition_type === 'follower_count') {
      if (!user) return { error: `No user data returned for @${handle}` }
      const current = user.followers ?? 0
      return {
        triggered: current >= parseInt(threshold),
        currentValue: `${current.toLocaleString()} followers`,
        rawData: { followers: current },
        updatedMonitor: monitor,
      }
    }

    if (condition_type === 'tweet_count') {
      if (!user) return { error: `No user data returned for @${handle}` }
      const current = user.tweets ?? 0
      return {
        triggered: current >= parseInt(threshold),
        currentValue: `${current.toLocaleString()} tweets`,
        rawData: { tweets: current },
        updatedMonitor: monitor,
      }
    }

    if (condition_type === 'pfp_change') {
      if (!user) return { error: `No user data returned for @${handle}` }
      const currentPfp = user.avatar ?? ''
      if (!last_pfp_url) {
        return {
          triggered: false,
          currentValue: 'Baseline PFP recorded',
          rawData: { pfp: currentPfp },
          updatedMonitor: { ...monitor, last_pfp_url: currentPfp },
        }
      }
      const changed = currentPfp !== last_pfp_url && currentPfp !== ''
      return {
        triggered: changed,
        currentValue: changed ? 'PFP changed' : 'No PFP change',
        rawData: { previous_pfp: last_pfp_url, current_pfp: currentPfp },
        updatedMonitor: changed ? { ...monitor, last_pfp_url: currentPfp } : monitor,
      }
    }

    if (condition_type === 'verification_change') {
      if (!user) return { error: `No user data returned for @${handle}` }
      const currentVerified = user.verified ?? false
      if (last_verified === null || last_verified === undefined) {
        return {
          triggered: false,
          currentValue: `Verified: ${currentVerified} (baseline recorded)`,
          rawData: { verified: currentVerified },
          updatedMonitor: { ...monitor, last_verified: currentVerified },
        }
      }
      const changed = currentVerified !== last_verified
      return {
        triggered: changed,
        currentValue: changed
          ? `Verification changed to ${currentVerified}`
          : `Verified: ${currentVerified} (no change)`,
        rawData: { previous: last_verified, current: currentVerified },
        updatedMonitor: changed ? { ...monitor, last_verified: currentVerified } : monitor,
      }
    }

    if (condition_type === 'new_post') {
      const sortedTweets = [...tweets].sort(
        (a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0)
      )
      const latestTweet = sortedTweets[0]
      if (!latestTweet) return { error: `No tweets found for @${handle}` }

      const latestId = latestTweet.id ?? ''
      const activationTs = activation_timestamp ?? 0

      if (!last_tweet_id) {
        return {
          triggered: false,
          currentValue: 'Baseline tweet ID recorded',
          rawData: { tweet_id: latestId },
          updatedMonitor: { ...monitor, last_tweet_id: latestId },
        }
      }

      const tweetTime = new Date(latestTweet.created_at ?? 0).getTime() / 1000
      const isNew = latestId !== last_tweet_id && tweetTime >= activationTs
      return {
        triggered: isNew,
        currentValue: isNew ? `New tweet: ${latestId}` : 'No new post',
        rawData: { latest_tweet_id: latestId, created_at: latestTweet.created_at },
        updatedMonitor: isNew ? { ...monitor, last_tweet_id: latestId } : monitor,
      }
    }
  }

  // ── GROUP B: Next tweet after activation ───────────────────────────────────
  if (['next_tweet_views', 'next_tweet_likes',
       'next_tweet_reposts', 'next_tweet_replies'].includes(condition_type)) {

    const activationTs = activation_timestamp ?? 0
    let trackingId = monitor.tracking_tweet_id ?? null

    if (!trackingId) {
      const latestTweet = await fetchLatestTweet(handle)
      if (!latestTweet) return { error: `Could not fetch tweets for @${handle}` }

      const tweetTime = new Date(latestTweet.created_at ?? 0).getTime() / 1000
      if (tweetTime >= activationTs) {
        trackingId = latestTweet.id
        console.log(`  Found target tweet for @${handle}: ${trackingId}`)
      } else {
        return {
          triggered: false,
          currentValue: 'Waiting for new tweet after activation',
          rawData: { latest_tweet_id: latestTweet.id },
          updatedMonitor: monitor,
        }
      }
    }

    const tweet = await fetchTweet(handle, trackingId)
    if (!tweet) return { error: `Could not fetch tweet ${trackingId}` }

    const metricMap = {
      next_tweet_views:   { key: 'views',    label: 'views'   },
      next_tweet_likes:   { key: 'likes',    label: 'likes'   },
      next_tweet_reposts: { key: 'retweets', label: 'reposts' },
      next_tweet_replies: { key: 'replies',  label: 'replies' },
    }
    const { key, label } = metricMap[condition_type]
    const current = tweet[key] ?? 0
    const target  = parseInt(threshold)

    return {
      triggered: current >= target,
      currentValue: `${current.toLocaleString()} ${label}`,
      rawData: { tweet_id: trackingId, [key]: current },
      updatedMonitor: { ...monitor, tracking_tweet_id: trackingId },
    }
  }

  // ── GROUP C: Specific tweet by URL ─────────────────────────────────────────
  if (['post_views', 'post_likes', 'post_reposts', 'post_replies'].includes(condition_type)) {
    if (!tweet_id) return { error: 'tweet_id missing for specific tweet condition' }

    const tweet = await fetchTweet(handle, tweet_id)
    if (!tweet) return { error: `Could not fetch tweet ${tweet_id} from @${handle}` }

    const metricMap = {
      post_views:   { key: 'views',    label: 'views'   },
      post_likes:   { key: 'likes',    label: 'likes'   },
      post_reposts: { key: 'retweets', label: 'reposts' },
      post_replies: { key: 'replies',  label: 'replies' },
    }
    const { key, label } = metricMap[condition_type]
    const current = tweet[key] ?? 0
    const target  = parseInt(threshold)

    return {
      triggered: current >= target,
      currentValue: `${current.toLocaleString()} ${label}`,
      rawData: { tweet_id, [key]: current },
      updatedMonitor: monitor,
    }
  }

  return { error: `Unknown condition_type: ${condition_type}` }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('════════════════════════════════════════')
  console.log(' X RESOLVER — Rialo Calls')
  console.log(` Started: ${new Date().toISOString()}`)
  console.log('════════════════════════════════════════\n')

  const { data: predictions, error: fetchError } = await supabase
    .from('predictions_display')
    .select('id, title, status, deadline, x_monitor')
    .eq('status', 'open')
    .not('x_monitor', 'is', null)

  if (fetchError) {
    console.error('Failed to fetch predictions:', fetchError.message)
    process.exit(1)
  }

  if (!predictions || predictions.length === 0) {
    console.log('No predictions with X monitoring active. Nothing to do.')
    return
  }

  console.log(`Found ${predictions.length} prediction(s) to monitor:\n`)

  for (const pred of predictions) {
    const monitor   = pred.x_monitor
    const handle    = monitor.handle    ?? 'unknown'
    const condition = monitor.condition_type ?? 'unknown'

    console.log(`─── Prediction #${pred.id}: ${pred.title.slice(0, 60)}`)
    console.log(`    @${handle} · ${condition}`)

    if (monitor.has_deadline && pred.deadline) {
      const deadline = new Date(pred.deadline).getTime()
      if (Date.now() > deadline) {
        console.log('    ⏰ Deadline passed — condition not triggered in time')
        await supabase.from('x_monitor_logs').insert({
          prediction_id: pred.id,
          handle,
          condition_type: condition,
          current_value: 'Deadline passed — not triggered',
          threshold: String(monitor.threshold ?? ''),
          triggered: false,
          action_taken: 'Deadline passed — awaiting admin decision',
        })
        continue
      }
    }

    await new Promise(r => setTimeout(r, 1500))

    const result = await checkCondition(pred, monitor)

    if (result.error) {
      console.log(`    ⚠️  Error: ${result.error}`)
      await supabase.from('x_monitor_logs').insert({
        prediction_id: pred.id,
        handle,
        condition_type: condition,
        current_value: 'Error',
        threshold: String(monitor.threshold ?? ''),
        triggered: false,
        action_taken: null,
        error: result.error,
      })
      continue
    }

    console.log(`    Current: ${result.currentValue}`)
    console.log(`    Target:  ${monitor.threshold ?? 'change detected'}`)
    console.log(`    Status:  ${result.triggered ? '🔒 TRIGGERED' : '👀 monitoring'}`)

    if (JSON.stringify(result.updatedMonitor) !== JSON.stringify(monitor)) {
      await supabase
        .from('predictions_display')
        .update({ x_monitor: result.updatedMonitor })
        .eq('id', pred.id)
    }

    await supabase.from('x_monitor_logs').insert({
      prediction_id: pred.id,
      handle,
      condition_type: condition,
      current_value: result.currentValue,
      threshold: String(monitor.threshold ?? ''),
      triggered: result.triggered,
      action_taken: result.triggered ? 'Locked prediction on-chain' : null,
      raw_data: result.rawData ?? null,
    })

    if (result.triggered) {
      try {
        console.log(`    🔒 Locking prediction #${pred.id} on-chain...`)

        const txHash = await walletClient.writeContract({
          address: BETTING_POOL,
          abi: LOCK_ABI,
          functionName: 'lockBetting',
          args: [BigInt(pred.id)],
        })
        console.log(`    ✅ Locked. Tx: ${txHash}`)

        await supabase
          .from('predictions_display')
          .update({ status: 'locked' })
          .eq('id', pred.id)

        await supabase.from('x_monitor_logs').insert({
          prediction_id: pred.id,
          handle,
          condition_type: condition,
          current_value: result.currentValue,
          threshold: String(monitor.threshold ?? ''),
          triggered: true,
          action_taken: `Locked on-chain — tx: ${txHash}`,
        })

      } catch (e) {
        const errMsg = e?.shortMessage ?? e?.message ?? 'Unknown error'
        console.error(`    ❌ Lock failed: ${errMsg}`)
        await supabase.from('x_monitor_logs').insert({
          prediction_id: pred.id,
          handle,
          condition_type: condition,
          current_value: result.currentValue,
          triggered: true,
          action_taken: null,
          error: `Lock tx failed: ${errMsg}`,
        })
      }
    }

    console.log()
  }

  console.log('════════════════════════════════════════')
  console.log(` Done: ${new Date().toISOString()}`)
  console.log('════════════════════════════════════════')
}

run().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
