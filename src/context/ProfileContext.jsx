import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { CONTRACT_ADDRESSES, PROFILE_REGISTRY_ABI } from '../config/contracts'
import { supabase } from '../config/supabase'

// Viem client for on-chain fallback reads
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
})

// localStorage key prefix for profile cache (keyed per session wallet address)
const PROFILE_CACHE_KEY = 'rc_profile_'

// ============================================================
// Profile Context — tracks connected wallet's profile state
// Profile is registered under the SESSION WALLET address,
// not the MetaMask address.
//
// STATE 1: not connected
// STATE 2: connected (+ session wallet), no profile
// STATE 3: connected, has profile
//
// appInitialized: false until ALL of the following resolve:
//   1. wagmi leaves 'reconnecting' state → 'connected' | 'disconnected'
//   2. if connected + session wallet: hasProfileOnChain contract read completes
//   3. if has profile: Supabase profile fetch completes
// ============================================================

const ProfileContext = createContext(null)

export function ProfileProvider({ children }) {
  const { address, isConnected, status } = useAccount()
  const [profile, setProfile] = useState(null)        // Supabase profile row
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileFetched, setProfileFetched] = useState(false)
  const [showMintModal, setShowMintModal] = useState(false)
  const [sessionAddress, setSessionAddress] = useState(null) // session wallet address

  // App-level initialization gate
  const [appInitialized, setAppInitialized] = useState(false)

  // Read session wallet address from localStorage whenever main wallet changes
  // Uses static import so derivation is synchronous — no async timing gap
  useEffect(() => {
    if (!address) { setSessionAddress(null); return }
    const stored = localStorage.getItem('rc_sw_' + address.toLowerCase())
    if (stored) {
      try {
        const account = privateKeyToAccount(stored)
        setSessionAddress(account.address)
      } catch {
        setSessionAddress(null)
      }
    } else {
      setSessionAddress(null)
    }
  }, [address])

  // Also react when session wallet is created/restored mid-session
  // (fires from SessionWalletContext via custom event)
  useEffect(() => {
    function onSessionReady(e) {
      if (e.detail?.address) setSessionAddress(e.detail.address)
    }
    window.addEventListener('rialo:session-wallet-ready', onSessionReady)
    return () => window.removeEventListener('rialo:session-wallet-ready', onSessionReady)
  }, [])

  // Check if session wallet has a profile on chain
  // Falls back to mainAddress if no session wallet yet
  const lookupAddress = sessionAddress || address
  const { data: hasProfileOnChain, refetch: refetchHasProfile } = useReadContract({
    address: CONTRACT_ADDRESSES.PROFILE_REGISTRY,
    abi: PROFILE_REGISTRY_ABI,
    functionName: 'hasProfile',
    args: [lookupAddress],
    query: { enabled: !!lookupAddress },
  })

  // Load profile — cache-first for instant load, then refreshes from Supabase in background
  const loadProfile = useCallback(async (wallet) => {
    if (!wallet) return
    const cacheKey = PROFILE_CACHE_KEY + wallet.toLowerCase()

    setProfileLoading(true)

    // Step 1: Serve from localStorage immediately (< 5ms) — unblocks AppLoader right away
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        setProfile(JSON.parse(raw))
        setProfileFetched(true)
        setProfileLoading(false) // AppLoader can unblock now
      }
    } catch {}

    // Step 2: Fetch fresh data from Supabase in background
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet_address', wallet.toLowerCase())
        .single()

      if (data) {
        // Fresh data arrived — update UI + refresh cache
        setProfile(data)
        try { localStorage.setItem(cacheKey, JSON.stringify(data)) } catch {}
      } else {
        // No Supabase row — chain sync fallback (one-time repair)
        try {
          const [name, bio, pfpHash, xUsername, mintedAt] = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.PROFILE_REGISTRY,
            abi: PROFILE_REGISTRY_ABI,
            functionName: 'getProfile',
            args: [wallet],
          })
          const row = {
            wallet_address: wallet.toLowerCase(),
            name:           name      || '',
            bio:            bio       || '',
            pfp_url:        pfpHash   || '',
            x_username:     xUsername || '',
            minted_at:      new Date(Number(mintedAt) * 1000).toISOString(),
          }
          await supabase.from('profiles').upsert(row)
          await supabase.from('leaderboard').upsert({
            wallet_address: wallet.toLowerCase(),
            name:           name    || '',
            pfp_url:        pfpHash || '',
            total_calls: 0, wins: 0, losses: 0,
            win_rate: 0, total_volume: 0, total_pnl: 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'wallet_address' })
          setProfile(row)
          try { localStorage.setItem(cacheKey, JSON.stringify(row)) } catch {}
          console.log('✅ Profile synced from chain to Supabase')
        } catch (chainErr) {
          console.error('Chain sync failed:', chainErr)
          // Only null out profile if we had no cache to fall back on
          if (!localStorage.getItem(cacheKey)) setProfile(null)
        }
      }
    } catch {
      if (!localStorage.getItem(cacheKey)) setProfile(null)
    } finally {
      setProfileLoading(false)
      setProfileFetched(true)
    }
  }, [])

  // React to wallet connection / profile state
  useEffect(() => {
    if (!isConnected || !address) {
      setProfile(null)
      setProfileFetched(false)
      setShowMintModal(false)
      return
    }
    if (hasProfileOnChain === false) {
      setProfile(null)
      setProfileFetched(true)
      // Do NOT auto-show the modal — user opens it on their own
    } else if (hasProfileOnChain === true) {
      setShowMintModal(false)
      loadProfile(lookupAddress)
    }
  }, [isConnected, address, sessionAddress, hasProfileOnChain, loadProfile])

  // App Initialization Gate
  useEffect(() => {
    if (appInitialized) return

    if (status === 'disconnected') {
      setAppInitialized(true)
      return
    }

    if (status === 'connected') {
      // If the user has a stored session wallet, wait for sessionAddress to be derived
      // before querying hasProfileOnChain — otherwise we'd query the wrong address
      // and mark initialized too early (causing the 5-6s profile flash).
      const hasStoredSession = address
        && !!localStorage.getItem('rc_sw_' + address.toLowerCase())
      if (hasStoredSession && !sessionAddress) return  // wait one more render

      if (hasProfileOnChain === undefined) return
      if (hasProfileOnChain === false) {
        setAppInitialized(true)
        return
      }
      if (hasProfileOnChain === true && !profileLoading && profileFetched) {
        setAppInitialized(true)
      }
    }
  }, [status, hasProfileOnChain, profileLoading, profileFetched, appInitialized, address, sessionAddress])


  // Safety net: if loading takes more than 12s (e.g. RPC is very slow), unblock anyway.
  // Normal cases resolve in < 2s. Chain sync (on-chain fallback) takes 3-6s.
  // 12s covers all reasonable scenarios before giving up.
  useEffect(() => {
    const timeout = setTimeout(() => setAppInitialized(true), 12000)
    return () => clearTimeout(timeout)
  }, [])


  const refreshProfile = useCallback(async () => {
    await refetchHasProfile()
    if (lookupAddress) await loadProfile(lookupAddress)
  }, [lookupAddress, loadProfile, refetchHasProfile])

  // Direct profile state patch — no re-fetch, no chain ping.
  // Use this after EditProfile saves to avoid re-render loops.
  const updateProfileData = useCallback((patch) => {
    setProfile(prev => {
      if (!prev) return prev
      const merged = { ...prev, ...patch }
      try {
        const key = PROFILE_CACHE_KEY + (prev.wallet_address || '').toLowerCase()
        localStorage.setItem(key, JSON.stringify(merged))
      } catch {}
      return merged
    })
  }, [])

  const navState = !isConnected ? 1 : !profile ? 2 : 3

  return (
    <ProfileContext.Provider value={{
      profile,
      profileLoading,
      appInitialized,
      navState,
      showMintModal,
      setShowMintModal,
      refreshProfile,
      updateProfileData,
      hasProfileOnChain,
      sessionAddress,
    }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
