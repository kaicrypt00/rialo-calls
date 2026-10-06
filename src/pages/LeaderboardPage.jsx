import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { useDataCache } from '../context/DataPrefetchContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { formatRitualNum, shortAddress } from '../utils/format'

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { leaderboard: cachedLeaderboard, betsStats: cachedBetsStats, refetchLeaderboard, refetchStats } = useDataCache()

  // Use cache if warm, local state if cold
  const [localCallers, setLocalCallers] = useState(null)
  const [localStats,   setLocalStats]   = useState(null)
  const [localLoading, setLocalLoading] = useState(false)

  // On mount: if cache is cold, do own fetch; if warm, instant render
  useEffect(() => {
    if (cachedLeaderboard === null || cachedBetsStats === null) {
      fetchAll()
    }
  }, [])

  // Sync: when cache arrives after mount, drop local state
  useEffect(() => {
    if (cachedLeaderboard !== null) setLocalCallers(null)
  }, [cachedLeaderboard])
  useEffect(() => {
    if (cachedBetsStats !== null) setLocalStats(null)
  }, [cachedBetsStats])

  async function fetchAll() {
    setLocalLoading(true)
    await Promise.all([fetchStats(), fetchCallers()])
    setLocalLoading(false)
  }

  async function fetchStats() {
    const { data: betsData } = await supabase
      .from('bets')
      .select('amount, wallet_address')
      .limit(5000)

    const allBets = betsData || []
    const totalVolume  = allBets.reduce((s, b) => s + parseFloat(b.amount || 0), 0)
    const callsMade    = allBets.length
    const callerSet    = new Set(allBets.map(b => b.wallet_address?.toLowerCase()))
    const biggestCall  = allBets.reduce((max, b) => Math.max(max, parseFloat(b.amount || 0)), 0)
    const { count: resolved } = await supabase
      .from('predictions_display')
      .select('*', { count: 'exact', head: true })
      .in('status', ['yes_wins', 'no_wins'])

    setLocalStats({
      totalVolume: totalVolume.toFixed(2),
      callsMade,
      callers: callerSet.size,
      callsResolved: resolved ?? 0,
      biggestCall: biggestCall.toFixed(2),
    })
  }

  async function fetchCallers() {
    const { data } = await supabase
      .from('leaderboard')
      .select('*')
      .gt('total_calls', 0)
      .order('total_pnl', { ascending: false })
      .limit(10)

    if (data && data.length > 0) {
      const addrs = data.map(d => d.wallet_address.toLowerCase())
      const { data: profs } = await supabase.from('profiles').select('wallet_address, name, pfp_url').in('wallet_address', addrs)
      const profMap = new Map((profs || []).map(p => [p.wallet_address.toLowerCase(), p]))
      setLocalCallers(data.map(c => {
        const p = profMap.get(c.wallet_address.toLowerCase())
        return { ...c, name: p?.name || c.name, pfp_url: p?.pfp_url !== undefined ? p.pfp_url : c.pfp_url }
      }))
    } else {
      setLocalCallers([])
    }
  }

  // Resolved values: prefer cache, fall back to local
  const stats   = cachedBetsStats   ?? localStats
  const callers = cachedLeaderboard ?? localCallers ?? []
  const loading = (cachedLeaderboard === null && cachedBetsStats === null) && localLoading

  const top3 = callers.slice(0, 3)
  const rest = callers.slice(3)

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      position: 'relative',
    }}>
      <style>{`
        @keyframes podium-rank1-glow {
          0%,100% { box-shadow: 0 0 20px rgba(223,219,207,0.08); }
          50%     { box-shadow: 0 0 42px rgba(223,219,207,0.20); }
        }
      `}</style>
      {/* Subtle top glow */}

      <div style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        height: 300,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(223,219,207,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <Navbar />

      <main style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '80px 24px 80px',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Back button */}
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            cursor: 'pointer',
            padding: 0,
            marginBottom: 28,
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          onClick={() => navigate('/calls')}
        >
          ← Back to Calls
        </button>

        {/* THE ARENA heading */}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(32px, 5vw, 48px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 32,
          letterSpacing: -1,
        }}>
          THE ARENA
        </h1>

        {/* ─── 5 Stats in a single horizontal row (exact Stitch layout) ─── */}
        {loading ? (
          <div className="arena-stats-main" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
            marginBottom: 52,
          }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 110, borderRadius: 12 }} />
            ))}
          </div>
        ) : (
          <div className="arena-stats-main" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
            marginBottom: 52,
          }}>
            <ArenaStatCard icon="💰" label="TOTAL VOL" value={`${stats?.totalVolume ?? '0'} RLO`} accent />
            <ArenaStatCard icon="🎯" label="CALLS MADE" value={stats?.callsMade ?? '0'} />
            <ArenaStatCard icon="🔥" label="ACTIVE CALLERS" value={stats?.callers ?? '0'} />
            <ArenaStatCard icon="🏆" label="LARGEST WIN" value={`${stats?.biggestCall ?? '0'} RLO`} />
            <ArenaStatCard icon="⚔️" label="CALLS RESOLVED" value={stats?.callsResolved ?? '0'} accent />
          </div>
        )}

        {/* ─── TOP CALLERS heading ─── */}
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 24,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>
          TOP CALLERS
        </h2>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />
            ))}
          </div>
        ) : callers.length === 0 ? (
          <div style={{
            background: 'rgba(20,20,20,0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            textAlign: 'center',
            padding: '80px 24px',
          }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🔮</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              No callers yet.
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
              The Arena awaits its first champions.
            </div>
          </div>
        ) : (
          <>
            {/* ─── Podium: Rank 1 LEFT (large), Rank 2 CENTER, Rank 3 RIGHT ─── */}
            {top3.length > 0 && (
              <div className="podium-grid" style={{
                display: 'grid',
                gridTemplateColumns: top3.length === 1 ? '1fr' : top3.length === 2 ? '1fr 1fr' : '2fr 1.5fr 1.5fr',
                gap: 16,
                marginBottom: 32,
                alignItems: 'start',
              }}>
                {/* Rank 1 — LEFT, larger */}
                {top3[0] && <PodiumCard caller={top3[0]} rank={1} isFirst />}
                {/* Rank 2 — CENTER */}
                {top3[1] && <PodiumCard caller={top3[1]} rank={2} />}
                {/* Rank 3 — RIGHT */}
                {top3[2] && <PodiumCard caller={top3[2]} rank={3} />}
              </div>
            )}

            {/* ─── Ranks 4–10 Table ─── */}
            {rest.length > 0 && (
              <div className="leaderboard-table-wrapper" style={{
                background: 'rgba(20,20,20,0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 16,
              }}>
                {/* Table header */}
                <div className="leaderboard-table-header" style={{
                  display: 'grid',
                  gridTemplateColumns: '72px 1fr 140px 160px',
                  gap: 0,
                  padding: '12px 24px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'rgba(28,28,28,0.8)',
                }}>
                  {['RANK', 'CALLER', 'WIN RATE', 'PNL'].map((h, i) => (
                    <div key={h} style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      textAlign: i >= 2 ? 'right' : 'left',
                    }}>
                      {h}
                    </div>
                  ))}
                </div>

                {/* Table rows */}
                {rest.map((caller, idx) => (
                  <TableRow key={caller.wallet_address} caller={caller} rank={idx + 4} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  )
}

/* ── Arena Stat Card — horizontal row, matching Stitch ── */
function ArenaStatCard({ icon, label, value, accent }) {
  return (
    <div style={{
      background: accent ? 'rgba(223,219,207,0.06)' : 'rgba(20,20,20,0.85)',
      backdropFilter: 'blur(12px)',
      border: `1px solid ${accent ? 'rgba(223,219,207,0.3)' : 'rgba(223,219,207,0.12)'}`,
      borderRadius: 12,
      padding: '20px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      transition: 'transform 0.25s ease, box-shadow 0.25s ease',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-3px)'
      e.currentTarget.style.boxShadow = '0 6px 24px rgba(223,219,207,0.15)'
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = 'none'
      e.currentTarget.style.boxShadow = 'none'
    }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
      }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'clamp(18px, 2.5vw, 28px)',
        fontWeight: 700,
        color: accent ? 'var(--accent-primary)' : 'var(--text-primary)',
        lineHeight: 1,
        textShadow: accent ? '0 0 12px rgba(223,219,207,0.4)' : 'none',
      }}>
        {value}
      </div>
    </div>
  )
}

/* ── Podium Card ── */
function PodiumCard({ caller, rank, isFirst }) {
  const [hovered, setHovered] = useState(false)

  // Tiered cream — brightest at #1, stepping down
  const rankStyles = {
    1: {
      color:       '#DFDBCF',
      colorRgb:    '223,219,207',
      border:      'rgba(223,219,207,0.45)',
      bg:          'linear-gradient(155deg, rgba(223,219,207,0.1) 0%, #0C0C0C 50%, #0E0E0E 100%)',
      badgeBg:     'rgba(223,219,207,0.15)',
      shadow:      '0 0 40px rgba(223,219,207,0.12)',
      glow:        '0 0 16px rgba(223,219,207,0.35)',
      spinBorder:  true,
    },
    2: {
      color:       '#B8B4AA',
      colorRgb:    '184,180,170',
      border:      'rgba(184,180,170,0.28)',
      bg:          'linear-gradient(155deg, rgba(184,180,170,0.07) 0%, #0C0C0C 55%, #0E0E0E 100%)',
      badgeBg:     'rgba(184,180,170,0.1)',
      shadow:      '0 0 24px rgba(184,180,170,0.07)',
      glow:        'none',
      spinBorder:  false,
    },
    3: {
      color:       '#7A7872',
      colorRgb:    '122,120,114',
      border:      'rgba(122,120,114,0.22)',
      bg:          'linear-gradient(155deg, rgba(122,120,114,0.05) 0%, #0C0C0C 55%, #0E0E0E 100%)',
      badgeBg:     'rgba(122,120,114,0.08)',
      shadow:      '0 0 16px rgba(122,120,114,0.05)',
      glow:        'none',
      spinBorder:  false,
    },
  }

  const s = rankStyles[rank]
  const avatarSize = isFirst ? 112 : 80
  const nameSize   = isFirst ? 22  : 17
  const pnlSize    = isFirst ? 28  : 20
  const rankLabel  = rank === 1 ? '✦ Rank 1' : rank === 2 ? '· Rank 2' : '· Rank 3'

  const cardInner = (
    <div
      style={{
        background:     s.bg,
        backdropFilter: 'blur(16px)',
        border:         `1px solid ${s.border}`,
        borderRadius:   16,
        padding:        isFirst ? '36px 32px' : '28px 24px',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        textAlign:      'center',
        position:       'relative',
        transition:     'transform 0.25s ease',
        transform:      hovered ? 'translateY(-5px)' : 'translateY(0)',
        zIndex:         1,
      }}
    >
      {/* Corner radiance for rank 1 */}
      {rank === 1 && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 120, height: 120,
          background: `radial-gradient(circle at top right, rgba(${s.colorRgb},0.18), transparent 65%)`,
          pointerEvents: 'none', borderRadius: '0 15px 0 0',
        }} />
      )}

      {/* Rank badge */}
      <div style={{
        position:   'absolute',
        top:        -16,
        left:       '50%',
        transform:  'translateX(-50%)',
        background: s.badgeBg,
        color:      s.color,
        fontFamily: 'var(--font-display)',
        fontSize:   rank === 1 ? 14 : 12,
        fontWeight: 700,
        padding:    rank === 1 ? '7px 20px' : '5px 16px',
        borderRadius: 999,
        border:     `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
        boxShadow:  s.glow,
        letterSpacing: '0.05em',
      }}>
        {rankLabel}
      </div>

      {/* Avatar */}
      <div style={{
        width:        avatarSize,
        height:       avatarSize,
        borderRadius: '50%',
        border:       `${rank === 1 ? 2 : 1}px solid ${s.border}`,
        overflow:     'hidden',
        background:   'rgba(20,20,20,0.8)',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        fontFamily:   'var(--font-display)',
        fontWeight:   700,
        fontSize:     avatarSize * 0.35,
        color:        s.color,
        marginTop:    12,
        marginBottom: 16,
        flexShrink:   0,
        boxShadow:    rank === 1 ? `0 0 24px rgba(${s.colorRgb},0.3)` : rank === 2 ? `0 0 10px rgba(${s.colorRgb},0.12)` : 'none',
      }}>
        {caller.pfp_url
          ? <img src={caller.pfp_url} alt={caller.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (caller.name?.[0]?.toUpperCase() || '?')
        }
      </div>

      {/* Name */}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize:   nameSize,
        fontWeight: 700,
        color:      s.color,
        marginBottom: 4,
      }}>
        {caller.name || shortAddress(caller.wallet_address)}
      </div>

      {/* Win rate */}
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize:   13,
        color:      'var(--text-secondary)',
        marginBottom: 20,
      }}>
        Win Rate: {caller.win_rate?.toFixed(1) ?? 0}%
      </div>

      {/* Divider */}
      <div style={{
        width: '100%', height: 1,
        background: `linear-gradient(90deg, transparent, ${s.border}, transparent)`,
        marginBottom: 16,
      }} />

      {/* PNL */}
      <div style={{
        fontFamily:    'var(--font-body)',
        fontSize:      11,
        color:         `rgba(${s.colorRgb},0.6)`,
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginBottom:  6,
      }}>TOTAL PNL</div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize:   pnlSize,
        fontWeight: 700,
        color:      (caller.total_pnl || 0) >= 0 ? s.color : 'rgba(200,80,80,0.85)',
        textShadow: rank === 1 ? `0 0 12px rgba(${s.colorRgb},0.4)` : 'none',
      }}>
        {(caller.total_pnl || 0) >= 0 ? '+' : ''}{formatRitualNum(caller.total_pnl)} RLO
      </div>
    </div>
  )

  // Single wrapper — rank 1 gets the breathing glow animation, others don't
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', borderRadius: 16,
        animation: s.spinBorder ? 'podium-rank1-glow 2.5s ease-in-out infinite' : 'none',
      }}
    >
      {cardInner}
    </div>
  )
}


/* ── Table Row for ranks 4–10 ── */

function TableRow({ caller, rank }) {
  return (
    <div className="leaderboard-table-row" style={{
      display: 'grid',
      gridTemplateColumns: '72px 1fr 140px 160px',
      gap: 0,
      padding: '16px 24px',
      borderBottom: '1px solid rgba(223,219,207,0.06)',
      alignItems: 'center',
      transition: 'background 0.2s ease',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(223,219,207,0.04)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Rank */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 15,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
      }}>
        {rank}
      </div>

      {/* Caller */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(223,219,207,0.08)',
          border: '1px solid rgba(223,219,207,0.15)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 13,
          color: 'var(--accent-primary)',
          flexShrink: 0,
        }}>
          {caller.pfp_url
            ? <img src={caller.pfp_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (caller.name?.[0]?.toUpperCase() || '?')
          }
        </div>
        <div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 15,
            color: 'var(--text-primary)',
          }}>
            {caller.name || shortAddress(caller.wallet_address)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {caller.total_calls ?? 0} calls
          </div>
        </div>
      </div>

      {/* Win Rate */}
      <div style={{
        textAlign: 'right',
        fontFamily: 'var(--font-mono)',
        fontSize: 15,
        fontWeight: 600,
        color: (caller.win_rate || 0) >= 60 ? 'var(--accent-primary)' : 'var(--text-secondary)',
      }}>
        {caller.win_rate?.toFixed(1) ?? 0}%
      </div>

      {/* PNL */}
      <div style={{
        textAlign: 'right',
        fontFamily: 'var(--font-mono)',
        fontSize: 15,
        fontWeight: 700,
        color: (caller.total_pnl || 0) >= 0 ? 'var(--accent-primary)' : 'var(--danger)',
      }}>
        {(caller.total_pnl || 0) >= 0 ? '+' : ''}{formatRitualNum(caller.total_pnl)}
      </div>
    </div>
  )
}
