/**
 * DataPrefetchContext — Immediate Background Prefetch
 *
 * Strategy:
 *  - Starts fetching data 300ms after mount (tiny delay to not compete with first paint)
 *  - Fetches ALL prediction statuses at once so tab switches are instant (client-side filter)
 *  - Pages read from cache → zero loading flash if cache is warm
 *  - If cache is cold (first visit before 300ms), page falls back to its own fetch
 *  - Cache TTL 45s prevents redundant refetches during normal browsing
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../config/supabase'

const DataPrefetchContext = createContext(null)

const CACHE_TTL_MS    = 45_000
const LS_LB_KEY       = 'rc_cache_leaderboard'
const LS_POLLS_KEY    = 'rc_cache_polls'
const LS_PREDS_KEY    = 'rc_cache_predictions'
const LS_CACHE_TTL    = 5 * 60 * 1000 // 5 min

export function DataPrefetchProvider({ children }) {
  // All predictions (open + locked + settled) — pages filter client-side
  const [allPredictions,  setAllPredictions]  = useState(null)
  const [leaderboard,     setLeaderboard]     = useState(null)
  const [polls,           setPolls]           = useState(null)
  const [globalStats,     setGlobalStats]     = useState(null)
  const [betsStats,       setBetsStats]       = useState(null)

  const lastFetch = useRef({ predictions: 0, leaderboard: 0, polls: 0, stats: 0 })

  // ─── Fetch ALL predictions at once ───────────────────────────────────────────
  const fetchAllPredictions = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch.current.predictions < CACHE_TTL_MS) return

    // Serve from localStorage immediately while network fetch runs
    try {
      const raw = localStorage.getItem(LS_PREDS_KEY)
      if (raw) {
        const { data: cached, ts } = JSON.parse(raw)
        if (Date.now() - ts < LS_CACHE_TTL) setAllPredictions(cached)
      }
    } catch {}

    try {
      const { data } = await supabase
        .from('predictions_display')
        .select('*')
        .order('created_at', { ascending: false })
      setAllPredictions(data || [])
      try { localStorage.setItem(LS_PREDS_KEY, JSON.stringify({ data: data || [], ts: Date.now() })) } catch {}
      lastFetch.current.predictions = Date.now()
    } catch { /* silent — pages fall back to their own fetch */ }
  }, [])

  // ─── Fetch leaderboard ────────────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch.current.leaderboard < CACHE_TTL_MS) return

    // Serve from localStorage immediately while network fetch runs
    try {
      const raw = localStorage.getItem(LS_LB_KEY)
      if (raw) {
        const { data: cached, ts } = JSON.parse(raw)
        if (Date.now() - ts < LS_CACHE_TTL) setLeaderboard(cached)
      }
    } catch {}

    try {
      const { data: callers } = await supabase
        .from('leaderboard')
        .select('*')
        .gt('total_calls', 0)
        .order('total_pnl', { ascending: false })
        .limit(10)

      if (callers?.length) {
        const addrs = callers.map(d => d.wallet_address.toLowerCase())
        const { data: profs } = await supabase
          .from('profiles')
          .select('wallet_address, name, pfp_url')
          .in('wallet_address', addrs)
        const map = {}
        profs?.forEach(p => { map[p.wallet_address.toLowerCase()] = p })
        const merged = callers.map(c => ({ ...c, ...(map[c.wallet_address.toLowerCase()] || {}) }))
        setLeaderboard(merged)
        try { localStorage.setItem(LS_LB_KEY, JSON.stringify({ data: merged, ts: Date.now() })) } catch {}
      } else {
        setLeaderboard([])
        try { localStorage.setItem(LS_LB_KEY, JSON.stringify({ data: [], ts: Date.now() })) } catch {}
      }
      lastFetch.current.leaderboard = Date.now()
    } catch { /* silent */ }
  }, [])

  // ─── Fetch polls ──────────────────────────────────────────────────────────────
  const fetchPolls = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch.current.polls < CACHE_TTL_MS) return

    // Serve from localStorage immediately while network fetch runs
    try {
      const raw = localStorage.getItem(LS_POLLS_KEY)
      if (raw) {
        const { data: cached, ts } = JSON.parse(raw)
        if (Date.now() - ts < LS_CACHE_TTL) setPolls(cached)
      }
    } catch {}

    try {
      const { data } = await supabase
        .from('polls')
        .select('*')
        .eq('status', 'active')
        .order('vote_count', { ascending: false })
      setPolls(data || [])
      try { localStorage.setItem(LS_POLLS_KEY, JSON.stringify({ data: data || [], ts: Date.now() })) } catch {}
      lastFetch.current.polls = Date.now()
    } catch { /* silent */ }
  }, [])

  // ─── Fetch global stats ───────────────────────────────────────────────────────
  const fetchStats = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch.current.stats < CACHE_TTL_MS) return
    try {
      const [callsRes, callersRes, betsRes] = await Promise.all([
        supabase.from('predictions_display').select('*', { count: 'exact', head: true }).in('status', ['open', 'locked']),
        supabase.from('leaderboard').select('*', { count: 'exact', head: true }),
        supabase.from('bets').select('amount, wallet_address').limit(5000),
      ])
      setGlobalStats({ activeCalls: callsRes.count ?? 0, totalCallers: callersRes.count ?? 0 })

      const allBets    = betsRes.data || []
      const callerSet  = new Set(allBets.map(b => b.wallet_address?.toLowerCase()))
      const biggestCall = allBets.reduce((max, b) => Math.max(max, parseFloat(b.amount || 0)), 0)
      const { count: resolved } = await supabase
        .from('predictions_display')
        .select('*', { count: 'exact', head: true })
        .in('status', ['yes_wins', 'no_wins'])

      setBetsStats({
        totalVolume:   allBets.reduce((s, b) => s + parseFloat(b.amount || 0), 0).toFixed(2),
        callsMade:     allBets.length,
        callers:       callerSet.size,
        callsResolved: resolved ?? 0,
        biggestCall:   biggestCall.toFixed(2),
      })
      lastFetch.current.stats = Date.now()
    } catch { /* silent */ }
  }, [])

  /**
   * Boot sequence — all fetches run in parallel immediately on mount.
   * Leaderboard + polls also pre-seed from localStorage cache so they
   * appear instantly before the network response arrives.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      // All fetches in parallel — no sequential dependency
      Promise.all([
        fetchAllPredictions(true),
        fetchStats(true),
        fetchLeaderboard(true),
        fetchPolls(true),
      ])
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // ─── Realtime: keep predictions in sync ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('global-predictions-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions_display' }, () => {
        // Bust the localStorage cache immediately so stale data is never served
        try { localStorage.removeItem(LS_PREDS_KEY) } catch {}
        lastFetch.current.predictions = 0  // reset in-memory TTL too
        fetchAllPredictions(true)
        fetchStats(true)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAllPredictions, fetchStats])

  // warmCache is now a no-op kept for API compat (boot is automatic)
  const warmCache = useCallback(() => {}, [])

  return (
    <DataPrefetchContext.Provider value={{
      allPredictions,
      leaderboard,
      polls,
      globalStats,
      betsStats,
      warmCache,
      refetchPredictions: () => fetchAllPredictions(true),
      refetchLeaderboard: () => fetchLeaderboard(true),
      refetchPolls:       () => fetchPolls(true),
      refetchStats:       () => fetchStats(true),
    }}>
      {children}
    </DataPrefetchContext.Provider>
  )
}

export function useDataCache() {
  const ctx = useContext(DataPrefetchContext)
  if (!ctx) throw new Error('useDataCache must be used within DataPrefetchProvider')
  return ctx
}
