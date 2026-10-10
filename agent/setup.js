// agent/setup.js
// Run ONCE via GitHub Actions (workflow: agent-setup.yml → "Run workflow" button)
// Creates RialoBot's on-chain profile and Supabase records.
// The agent wallet address becomes the permanent identity for all data.
// DO NOT run this more than once. DO NOT log the private key.

import { createPublicClient, createWalletClient, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createClient } from '@supabase/supabase-js'

// ─── ENVIRONMENT (from GitHub Secrets — never hardcode these) ─────────────────
const AGENT_PRIVATE_KEY    = process.env.AGENT_PRIVATE_KEY
const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── AGENT PROFILE DETAILS ───────────────────────────────────────────────────
const AGENT_NAME       = 'Rialo Agent 001'
const AGENT_BIO        = 'AI prediction market trader powered by Latch.'
const AGENT_X_USERNAME = 'rialoagent001'
const AGENT_PFP_URL    = 'https://ftpweltnuwhwtqteydgi.supabase.co/storage/v1/object/public/avatars/agent-001.jpg'
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE_REGISTRY = '0x2DE1Ed07C104E775aE7368b1B8e2AA669b5CE5C8'
const RPC_URL          = 'https://ethereum-sepolia-rpc.publicnode.com'

// Verified against contracts.js — exact function signatures from the deployed contract
const PROFILE_REGISTRY_ABI = [
  {
    name: 'mintProfile', type: 'function', stateMutability: 'payable',
    inputs: [
      { name: '_name',      type: 'string' },
      { name: '_bio',       type: 'string' },
      { name: '_pfpHash',   type: 'string' },
      { name: '_xUsername', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'hasProfile', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'MINT_FEE', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
]

if (!AGENT_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing env vars. Check GitHub Secrets:')
  console.error('   AGENT_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const account      = privateKeyToAccount(`0x${AGENT_PRIVATE_KEY}`)
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) })
const supabase     = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Log address only — never log the private key
console.log('\n🤖 RialoBot Setup')
console.log(`   Agent wallet: ${account.address}`)
console.log(`   Name:         ${AGENT_NAME}`)
console.log(`   Bio:          ${AGENT_BIO}`)
console.log(`   X:            ${AGENT_X_USERNAME}`)
console.log()

async function main() {
  const wallet = account.address.toLowerCase()

  // ── STEP 0: Sync agent avatar to Supabase storage ──────────────────────
  let pfpUrl = AGENT_PFP_URL
  const localPfpPath = path.join(__dirname, 'agent-pfp.jpg')
  if (fs.existsSync(localPfpPath)) {
    console.log('0/4 Syncing agent PFP to Supabase storage...')
    try {
      const fileBuffer = fs.readFileSync(localPfpPath)
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload('agent-001.jpg', fileBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl('agent-001.jpg')
        if (urlData?.publicUrl) pfpUrl = urlData.publicUrl
        console.log(`   ✓ Avatar uploaded: ${pfpUrl}`)
      } else {
        console.warn(`   ⚠️ Avatar upload notice: ${uploadErr.message}`)
      }
    } catch (e) {
      console.warn(`   ⚠️ Local avatar sync notice: ${e.message}`)
    }
  }

  // ── STEP 1: Check if already minted on-chain ──────────────────────────────
  console.log('1/4 Checking on-chain profile status...')
  const alreadyMinted = await publicClient.readContract({
    address: PROFILE_REGISTRY,
    abi: PROFILE_REGISTRY_ABI,
    functionName: 'hasProfile',
    args: [account.address],
  })

  if (alreadyMinted) {
    console.log('   ✓ Profile already exists on-chain. Skipping mint.')
  } else {
    // ── STEP 2: Read current mint fee, then mint ──────────────────────────────
    console.log('2/4 Minting profile on-chain...')
    let mintFee
    try {
      mintFee = await publicClient.readContract({
        address: PROFILE_REGISTRY,
        abi: PROFILE_REGISTRY_ABI,
        functionName: 'MINT_FEE',
      })
    } catch {
      mintFee = parseEther('0.001')
    }
    console.log(`   Mint fee: ${(Number(mintFee) / 1e18).toFixed(4)} ETH`)

    const txHash = await walletClient.writeContract({
      address: PROFILE_REGISTRY,
      abi: PROFILE_REGISTRY_ABI,
      functionName: 'mintProfile',
      args: [AGENT_NAME, AGENT_BIO, pfpUrl, AGENT_X_USERNAME],
      value: mintFee,
      gas: 350000n,
    })
    console.log(`   Waiting for confirmation...`)
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    console.log(`   ✓ Minted! Tx: ${txHash}`)
    console.log(`   View: https://sepolia.etherscan.io/tx/${txHash}`)
  }

  // ── STEP 3: Upsert profile into Supabase profiles table ───────────────────
  console.log('3/4 Saving profile to Supabase profiles table...')
  const { error: profileError } = await supabase.from('profiles').upsert({
    wallet_address: wallet,
    name:           AGENT_NAME,
    bio:            AGENT_BIO,
    pfp_url:        pfpUrl,
    x_username:     AGENT_X_USERNAME,
    minted_at:      new Date().toISOString(),
  }, { onConflict: 'wallet_address' })

  if (profileError) {
    console.error(`   ❌ profiles error: ${profileError.message}`)
    process.exit(1)
  }
  console.log('   ✓ Profile saved')

  // ── STEP 4: Upsert leaderboard entry with is_agent flag ───────────────────
  console.log('4/4 Creating leaderboard entry...')
  const { error: lbError } = await supabase.from('leaderboard').upsert({
    wallet_address: wallet,
    name:           AGENT_NAME,
    pfp_url:        pfpUrl,
    total_calls:    0,
    wins:           0,
    losses:         0,
    win_rate:       0,
    total_volume:   0,
    total_pnl:      0,
    is_agent:       true,
    updated_at:     new Date().toISOString(),
  }, { onConflict: 'wallet_address' })

  if (lbError) {
    console.error(`   ❌ leaderboard error: ${lbError.message}`)
    process.exit(1)
  }
  console.log('   ✓ Leaderboard entry created with is_agent = true')

  console.log('\n✅ Setup complete!')
  console.log(`   Profile address: ${account.address}`)
  console.log('   RialoBot will appear on the leaderboard with 🤖 after first bet.')
}

main().catch(err => {
  console.error('\n💥 Setup failed:', err.message)
  process.exit(1)
})