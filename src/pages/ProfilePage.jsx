import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useDisconnect, usePublicClient } from 'wagmi'
import { formatUnits } from 'viem'
import { useProfile } from '../context/ProfileContext'
import { useSessionWallet } from '../context/SessionWalletContext'
import { supabase } from '../config/supabase'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import EditProfileModal from '../components/EditProfileModal'
import BadgesTab from '../components/BadgesTab'
import { shortAddress, formatRitualNum, formatMonthYear, copyToClipboard, buildXShareUrl } from '../utils/format'
import { EXPLORER_URL } from '../config/wagmi'
import { CONTRACT_ADDRESSES, BETTING_POOL_ABI } from '../config/contracts'

const TABS = ['My Calls', 'Badges']
const PAGE_SIZE = 20
const LS_STATS_KEY = 'rc_profile_stats_'
const LS_STATS_TTL = 5 * 60 * 1000 // 5 min — same TTL as DataPrefetchContext

export default function ProfilePage() {
  const navigate = useNavigate()
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const { profile, refreshProfile, profileLoading } = useProfile()
  const { sessionWallet, hasSessionWallet } = useSessionWallet()
  const publicClient = usePublicClient()

  const [activeTab, setActiveTab] = useState(0)
  const [showEdit, setShowEdit] = useState(false)
  const [bets, setBets] = useState([])
  const [betsPage, setBetsPage] = useState(1)
  const [betsHasMore, setBetsHasMore] = useState(false)
  const [betsLoading, setBetsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [stats, setStats] = useState(null)
  const [claimableMap, setClaimableMap] = useState({})
  const [claimingId, setClaimingId] = useState(null)
  const [claimPending, setClaimPending] = useState(false)

  // Use session wallet address for all bet/profile lookups
  const lookupAddress = sessionWallet?.address || address

  useEffect(() => {
    if (!lookupAddress) return
    fetchStats()
    fetchBets()
  }, [lookupAddress, betsPage])



  async function fetchStats() {
    if (!lookupAddress) return
    const cacheKey = LS_STATS_KEY + lookupAddress.toLowerCase()

    // 1. Serve from localStorage immediately — same pattern as DataPrefetchContext
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const { data: cached, ts } = JSON.parse(raw)
        if (Date.now() - ts < LS_STATS_TTL) setStats(cached)
      }
    } catch {}

    // 2. Fetch fresh from Supabase in background
    const { data } = await supabase
      .from('leaderboard')
      .select('total_calls, wins, total_volume, total_pnl, win_rate')
      .eq('wallet_address', lookupAddress.toLowerCase())
      .single()

    if (data) {
      const fresh = {
        calls:   data.total_calls  || 0,
        wins:    data.wins         || 0,
        volume:  data.total_volume || 0,
        pnl:     data.total_pnl    || 0,
        winRate: data.win_rate     || 0,
      }
      setStats(fresh)
      // 3. Update localStorage cache
      try { localStorage.setItem(cacheKey, JSON.stringify({ data: fresh, ts: Date.now() })) } catch {}
    }
  }

  async function fetchBets() {
    if (!lookupAddress) return
    // Only show the blank loading screen on the very first load (bets is empty)
    // On subsequent visits, refresh silently — existing bets stay visible
    const isFirstLoad = bets.length === 0 && betsPage === 1
    if (isFirstLoad) setBetsLoading(true)
    try {
      const { data } = await supabase
        .from('bets')
        .select('*, predictions_display(title, status)')
        .eq('wallet_address', lookupAddress.toLowerCase())
        .order('created_at', { ascending: false })
        .range((betsPage - 1) * PAGE_SIZE, betsPage * PAGE_SIZE - 1)

      if (data) {
        setBets(prev => betsPage === 1 ? data : [...prev, ...data])
        setBetsHasMore(data.length === PAGE_SIZE)
        checkClaimable(data)
      }
    } finally {
      setBetsLoading(false)
    }
  }

  async function checkClaimable(betsData) {
    if (!publicClient || !lookupAddress) return
    const wonBets = betsData.filter(b => b.result === 'won')
    const map = {}
    await Promise.all(wonBets.map(async (bet) => {
      try {
        const amount = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.BETTING_POOL,
          abi: BETTING_POOL_ABI,
          functionName: 'getClaimableAmount',
          args: [BigInt(bet.prediction_id), lookupAddress],
        })
        map[bet.prediction_id] = amount
      } catch { map[bet.prediction_id] = 0n }
    }))
    setClaimableMap(map)
  }

  async function handleClaim(predictionId) {
    if (!sessionWallet) return
    setClaimingId(predictionId)
    setClaimPending(true)
    try {
      const { createPublicClient, http } = await import('viem')
      const { sepolia } = await import('viem/chains')
      const pub = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') })
      const txHash = await sessionWallet.client.writeContract({
        address: CONTRACT_ADDRESSES.BETTING_POOL,
        abi: BETTING_POOL_ABI,
        functionName: 'claimWinnings',
        args: [BigInt(predictionId)],
        gas: 200000n,
      })
      await pub.waitForTransactionReceipt({ hash: txHash })
      fetchBets()
      fetchStats()
    } catch (e) {
      console.error('Claim error:', e)
    } finally {
      setClaimingId(null)
      setClaimPending(false)
    }
  }

  async function handleCopy() {
    await copyToClipboard(lookupAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleShareStats() {
    const text = `I've made ${stats.calls} calls on Rialo Calls 🔮\nWin Rate: ${stats.winRate?.toFixed(1) ?? 0}% | PNL: ${stats.pnl >= 0 ? '+' : ''}${formatRitualNum(stats.pnl)} RLO\nWhere the Community Calls What Happens Next.\nhttps://rialocalls.vercel.app`
    window.open(buildXShareUrl(text), '_blank')
  }

  function handleDisconnect() {
    disconnect()
    navigate('/')
  }

  const winRate = stats && stats.calls > 0 ? ((stats.wins / stats.calls) * 100).toFixed(1) : stats ? '0.0' : null
  const mintedAtDisplay = profile?.minted_at ? formatMonthYear(profile.minted_at) : ''

  // Only block render while loading if we have NO profile data yet (first load)
  // If profile already exists in context, show it immediately — don't flash blank
  if (address && profileLoading && !profile) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid rgba(223,219,207,0.12)',
            borderTopColor: 'rgba(223,219,207,0.7)',
            animation: 'profileSpin 0.9s linear infinite',
          }} />
          <style>{`@keyframes profileSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }


  if (!address || !profile) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
        <Navbar />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 16 }}>
          <div style={{ fontSize: 56 }}>🔮</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>Connect your wallet</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Connect and set up a profile to view this page.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      position: 'relative',
    }}>
      {/* Ambient background */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 800,
        height: 400,
        background: 'rgba(223,219,207,0.05)',
        filter: 'blur(120px)',
        borderRadius: '50%',
        pointerEvents: 'none',
        zIndex: 0,
      }} />


      <Navbar />

      {showEdit && <EditProfileModal onClose={() => { setShowEdit(false); refreshProfile() }} />}

      <main style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '100px 24px 80px',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Back */}
        <button className="back-btn" onClick={() => navigate('/calls')} style={{ marginBottom: 28 }}>
          ← Back to Calls
        </button>

        {/* Profile Hero Card */}
        <section className="profile-hero-section" style={{
          background: 'rgba(20,20,20,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
          padding: '32px 40px',
          marginBottom: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 32,
          flexWrap: 'wrap',
          position: 'relative',
          overflow: 'hidden',
          transition: 'border-color 0.3s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(223,219,207,0.3)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
        >
          {/* Gradient overlay on hover */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(223,219,207,0.04), transparent)',
            pointerEvents: 'none',
          }} />

          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 140,
              height: 140,
              borderRadius: '50%',
              padding: 2,
              background: 'linear-gradient(135deg, #DFDBCF, #3edfae, transparent)',
            }}>
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                overflow: 'hidden',
                background: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 40,
                color: 'var(--accent-primary)',
              }}>
                {profile.pfp_url
                  ? <img
                      src={profile.pfp_url}
                      alt={profile.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling?.style && (e.currentTarget.nextSibling.style.display = 'flex') }}
                    />
                  : null
                }
                <span style={{ display: profile.pfp_url ? 'none' : 'flex' }}>
                  {profile.name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
            </div>
            {/* Online dot */}
            <div style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              width: 20,
              height: 20,
              background: 'var(--bg-deep)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                width: 12,
                height: 12,
                background: 'var(--accent-primary)',
                borderRadius: '50%',
                boxShadow: '0 0 10px rgba(86,241,191,0.8)',
              }} />
            </div>
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 200, position: 'relative', zIndex: 1 }}>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 700,
              marginBottom: 4,
            }}>
              {profile.name}
            </h1>
            {profile.x_username && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 12 }}>
                @{profile.x_username}
              </p>
            )}
            {profile.bio && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, maxWidth: 440, marginBottom: 12 }}>
                {profile.bio}
              </p>
            )}

            {/* Wallet address */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(28,28,28,0.8)',
              backdropFilter: 'blur(12px)',
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(223,219,207,0.5)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: 0.5 }}>
                {shortAddress(lookupAddress)}
              </span>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: copied ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0,
                  transition: 'color 0.2s',
                }}
                onClick={handleCopy}
                title="Copy address"
              >
                {copied ? '✓' : '⎘'}
              </button>
            </div>

            {mintedAtDisplay && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                Member since {mintedAtDisplay}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="profile-action-btns" style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, position: 'relative', zIndex: 1 }}>
            <button
              onClick={handleShareStats}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--accent-primary)',
                color: '#0A0A0A',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 700,
                padding: '12px 20px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                transition: 'transform 0.2s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              ↗ Share Stats on X
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(true)}>
              ✏ Edit Profile
            </button>
            <button
              className="btn btn-sm"
              style={{ background: 'rgba(224,85,85,0.1)', color: 'var(--danger)', border: '1px solid rgba(224,85,85,0.3)' }}
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          </div>
        </section>

        {/* Stats Row */}
        <section className="profile-stats-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 40,
        }}>
          {[
            { label: 'Total Calls', value: stats ? stats.calls : null },
            { label: 'Win Rate',    value: stats ? `${winRate}%` : null, accent: true },
            { label: 'Volume',      value: stats ? `${formatRitualNum(stats.volume)} RLO` : null },
            { label: 'Total PNL',   value: stats ? `${stats.pnl >= 0 ? '+' : ''}${formatRitualNum(stats.pnl)} RLO` : null, accent: stats && stats.pnl >= 0, danger: stats && stats.pnl < 0 },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'rgba(20,20,20,0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 16,
              padding: 24,
              position: 'relative',
              overflow: 'hidden',
              transition: 'transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.borderColor = 'rgba(223,219,207,0.3)'
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(223,219,207,0.15)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.borderColor = 'var(--border-subtle)'
              e.currentTarget.style.boxShadow = 'none'
            }}
            >
              {/* Decorative corner glow */}
              <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 64,
                height: 64,
                background: 'rgba(223,219,207,0.08)',
                borderRadius: '0 0 0 100%',
                transform: 'translate(32px, -32px)',
                transition: 'transform 0.5s ease',
              }} />
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 8,
              }}>
                {s.label}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'clamp(15px, 2.2vw, 28px)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: s.danger ? 'var(--danger)' : s.accent ? 'var(--accent-primary)' : 'var(--text-primary)',
              }}>
                {s.value ?? '—'}
              </div>
            </div>
          ))}
        </section>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 32,
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 28,
        }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              className="profile-tab-btn"
              onClick={() => setActiveTab(i)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${activeTab === i ? 'var(--accent-primary)' : 'transparent'}`,
                color: activeTab === i ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 600,
                padding: '0 0 16px',
                cursor: 'pointer',
                transition: 'color 0.2s ease, border-color 0.2s ease',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab 1 — My Calls */}
        {activeTab === 0 && (
          <MyCalls
            bets={bets}
            betsLoading={betsLoading}
            betsHasMore={betsHasMore}
            claimableMap={claimableMap}
            claimingId={claimingId}
            claimPending={claimPending}
            onClaim={handleClaim}
            onLoadMore={() => setBetsPage(p => p + 1)}
          />
        )}

        {/* Tab 2 — Badges */}
        {activeTab === 1 && <BadgesTab />}
      </main>
      <Footer />
    </div>
  )
}

function ResultBadge({ result }) {
  const map = {
    won:      { label: 'WON',      bg: 'rgba(223,219,207,0.1)',  color: 'var(--accent-primary)', border: 'rgba(223,219,207,0.2)' },
    lost:     { label: 'LOST',     bg: 'rgba(224,85,85,0.1)',   color: 'var(--danger)',         border: 'rgba(224,85,85,0.2)' },
    pending:  { label: 'PENDING',  bg: 'rgba(47,54,51,0.8)',    color: 'var(--text-secondary)', border: 'var(--border-subtle)' },
    claimed:  { label: 'CLAIMED',  bg: 'rgba(223,219,207,0.06)', color: 'var(--text-tertiary)',  border: 'rgba(223,219,207,0.1)' },
    refunded: { label: 'REFUNDED', bg: 'rgba(245,158,11,0.1)',  color: 'var(--amber)',          border: 'rgba(245,158,11,0.2)' },
  }
  const r = map[result] || { label: result?.toUpperCase() || '—', bg: 'transparent', color: 'var(--text-tertiary)', border: 'var(--border-subtle)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '4px 10px', borderRadius: 4,
      background: r.bg, color: r.color, border: `1px solid ${r.border}`,
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>
      {r.label}
    </span>
  )
}

// ─── My Calls Tab ──────────────────────────────────────────────────────────────
function MyCalls({ bets, betsLoading, betsHasMore, claimableMap, claimingId, claimPending, onClaim, onLoadMore }) {
  const unclaimedWins = bets.filter(b => b.result === 'won' && claimableMap[b.prediction_id] > 0n)
  const totalUnclaimed = unclaimedWins.reduce((s, b) => s + (claimableMap[b.prediction_id] || 0n), 0n)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Unclaimed winnings alert */}
      {unclaimedWins.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(223,219,207,0.12), rgba(223,219,207,0.06))',
          border: '1px solid rgba(223,219,207,0.35)',
          borderRadius: 14,
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          animation: 'pulse-border 2.5s ease-in-out infinite',
        }}>
          <div style={{ fontSize: 28 }}>💰</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--accent-primary)', marginBottom: 2 }}>
              You have unclaimed winnings!
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {unclaimedWins.length} bet{unclaimedWins.length > 1 ? 's' : ''} ready to claim
              {' '}· <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                +{parseFloat(formatEther(totalUnclaimed)).toFixed(4)} RLO
              </span> available
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="my-calls-table-wrapper" style={{
        background: 'rgba(20,20,20,0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {betsLoading && bets.length === 0 ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 56, borderRadius: 6 }} />
            ))}
          </div>
        ) : bets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No calls yet</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Go make your first Call on the Markets page!</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="my-calls-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                <thead>
                  <tr style={{ background: 'rgba(28,28,28,0.8)', borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Market', 'Side', 'Stake', 'Payout', 'Status'].map(h => (
                      <th key={h} style={{
                        padding: '14px 18px',
                        textAlign: ['Stake','Payout','Status'].includes(h) ? 'right' : 'left',
                        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                        color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bets.map(bet => {
                    const claimable = claimableMap[bet.prediction_id]
                    const canClaim  = bet.result === 'won' && claimable > 0n
                    const isClaiming = claimingId === bet.prediction_id && claimPending
                    const predStatus = bet.predictions_display?.status
                    const isLocked   = predStatus === 'locked'

                    return (
                      <tr
                        key={bet.id}
                        style={{
                          borderBottom: '1px solid rgba(223,219,207,0.06)',
                          transition: 'background 0.2s ease',
                          background: canClaim ? 'rgba(223,219,207,0.03)' : 'transparent',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = canClaim ? 'rgba(223,219,207,0.07)' : 'rgba(47,54,51,0.3)'}
                        onMouseLeave={e => e.currentTarget.style.background = canClaim ? 'rgba(223,219,207,0.03)' : 'transparent'}
                      >
                        {/* Market */}
                        <td style={{ padding: '15px 18px', maxWidth: 240 }}>
                          <span style={{
                            fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-primary)',
                            display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {bet.predictions_display?.title || `Prediction #${bet.prediction_id}`}
                          </span>
                          {bet.tx_hash && (
                            <a href={`${EXPLORER_URL}/tx/${bet.tx_hash}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 10, color: 'var(--text-tertiary)', textDecoration: 'none', letterSpacing: 0.3 }}>
                              ↗ on-chain
                            </a>
                          )}
                        </td>

                        {/* Side */}
                        <td style={{ padding: '15px 18px' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                            color: bet.side === 'YES' ? 'var(--accent-primary)' : 'var(--danger)',
                          }}>{bet.side}</span>
                        </td>

                        {/* Stake */}
                        <td style={{ padding: '15px 18px', textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                            {formatRitualNum(bet.amount)}
                          </span>
                        </td>

                        {/* Payout */}
                        <td style={{ padding: '15px 18px', textAlign: 'right' }}>
                          {bet.result === 'won' && claimable !== undefined ? (
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                              color: claimable > 0n ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                            }}>
                              {claimable > 0n
                                ? `+${parseFloat(formatEther(claimable)).toFixed(3)}R`
                                : bet.payout > 0 ? `+${formatRitualNum(bet.payout)}R` : '✓ Claimed'}
                            </span>
                          ) : bet.result === 'lost' ? (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--danger)' }}>
                              -{formatRitualNum(bet.amount)}
                            </span>
                          ) : bet.result === 'pending' && isLocked ? (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>Awaiting result</span>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>—</span>
                          )}
                        </td>

                        {/* Status / Claim */}
                        <td style={{ padding: '15px 18px', textAlign: 'right' }}>
                          {canClaim ? (
                            <button
                              onClick={() => onClaim(bet.prediction_id)}
                              disabled={isClaiming}
                              style={{
                                background: isClaiming
                                  ? 'rgba(223,219,207,0.15)'
                                  : 'linear-gradient(135deg, rgba(223,219,207,0.2), rgba(223,219,207,0.1))',
                                border: '1px solid rgba(223,219,207,0.5)',
                                color: 'var(--accent-primary)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 12,
                                fontWeight: 700,
                                padding: '7px 16px',
                                borderRadius: 8,
                                cursor: isClaiming ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                                letterSpacing: 0.5,
                                boxShadow: isClaiming ? 'none' : '0 0 12px rgba(223,219,207,0.2)',
                                animation: isClaiming ? 'none' : 'pulse-glow 2s ease-in-out infinite',
                              }}
                              onMouseEnter={e => { if (!isClaiming) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(223,219,207,0.35)' }}}
                              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = isClaiming ? 'none' : '0 0 12px rgba(223,219,207,0.2)' }}
                            >
                              {isClaiming ? '⏳ Claiming…' : '💰 CLAIM'}
                            </button>
                          ) : (
                            <ResultBadge result={bet.result} />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {betsHasMore && (
              <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid var(--border-subtle)' }}>
                <button className="btn btn-ghost btn-sm" onClick={onLoadMore} disabled={betsLoading}>
                  {betsLoading ? 'Loading…' : 'Load More Calls'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

