import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useDataCache } from '../context/DataPrefetchContext'
import { Link } from 'react-router-dom'

// ─── helpers ────────────────────────────────────────────────────────────────

function formatSettledDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Settled Card ────────────────────────────────────────────────────────────

function SettledCard({ prediction }) {
  const isYesWins = prediction.status === 'yes_wins'
  const isNoWins  = prediction.status === 'no_wins'
  const isRefunded = prediction.status === 'refunded'

  const yesPool = parseFloat(prediction.yes_pool || 0)
  const noPool  = parseFloat(prediction.no_pool  || 0)
  const totalPool = (yesPool + noPool)
  const totalPct = totalPool > 0 ? totalPool : 1
  const yesPct = Math.round((yesPool / totalPct) * 100)
  const noPct  = 100 - yesPct

  const winnerColor = isYesWins
    ? 'var(--accent-primary)'
    : isNoWins
      ? 'var(--danger)'
      : 'var(--amber)'

  const winnerBg = isYesWins
    ? 'rgba(223,219,207,0.05)'
    : isNoWins
      ? 'rgba(217,79,79,0.05)'
      : 'rgba(191,169,106,0.05)'

  const winnerBorder = isYesWins
    ? 'rgba(223,219,207,0.18)'
    : isNoWins
      ? 'rgba(217,79,79,0.28)'
      : 'rgba(191,169,106,0.28)'

  const winnerEmoji = isYesWins ? '🏆' : isNoWins ? '✗' : '↩'
  const winnerLabel = isYesWins ? 'YES SIDE WON' : isNoWins ? 'NO SIDE WON' : 'MARKET REFUNDED'
  const claimMsg = isRefunded
    ? 'This market was refunded — head to your profile to claim your refund.'
    : `${isYesWins ? 'YES' : 'NO'} side won this call — head to your profile to claim your winnings.`

  return (
    <div
      className="glass-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 16,
        border: '1px solid rgba(223,219,207,0.08)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        transition: 'transform 200ms ease, box-shadow 200ms ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(223,219,207,0.06)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4)'
      }}
    >
      {/* Banner */}
      <div style={{ position: 'relative', height: 160, overflow: 'hidden', flexShrink: 0 }}>
        {prediction.banner_url ? (
          <img
            src={prediction.banner_url}
            alt={prediction.title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #141414 0%, #1C1C1C 60%, #141414 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48,
          }}>🔮</div>
        )}

        {/* Settled overlay gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to bottom, transparent 40%, rgba(10,10,10,0.85) 100%)`,
        }} />

        {/* Status badge */}
        <div style={{ position: 'absolute', top: 14, left: 14 }}>
          <span
            className={`status-pill ${isYesWins ? 'status-settled-yes' : isNoWins ? 'status-settled-no' : 'status-refunded'}`}
            style={{ fontSize: 11 }}
          >
            {winnerEmoji} {winnerLabel}
          </span>
        </div>

        {/* Category badge */}
        {prediction.category && (
          <div style={{ position: 'absolute', top: 14, right: 14 }}>
            <span style={{
              display: 'inline-block',
              padding: '3px 9px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'rgba(10,10,10,0.7)',
              color: 'var(--text-secondary)',
              border: '1px solid rgba(223,219,207,0.1)',
            }}>
              {prediction.category === 'community_calls' ? 'Community' : prediction.category === 'official_calls' ? 'Official' : prediction.category}
            </span>
          </div>
        )}

        {/* Settled date bottom-right */}
        <div style={{ position: 'absolute', bottom: 12, right: 14 }}>
          <span style={{ fontSize: 11, color: 'rgba(223,219,207,0.5)', fontFamily: 'var(--font-mono)' }}>
            Settled {formatSettledDate(prediction.settled_at)}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Title */}
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.35,
          }}
        >
          {prediction.title}
        </div>

        {/* Pool + odds row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingBottom: 16,
          borderBottom: '1px solid rgba(223,219,207,0.08)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Total Pool
            </span>
            <span className="font-mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-primary)' }}>
              {totalPool.toFixed(1)} RLO
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'right' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Settled</span>
            <span className="font-mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {formatSettledDate(prediction.settled_at)}
            </span>
          </div>
        </div>

        {/* YES / NO bars */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {/* YES box */}
          <div style={{
            background: isYesWins ? 'rgba(223,219,207,0.1)' : 'rgba(20,20,20,0.8)',
            border: isYesWins ? '1.5px solid rgba(223,219,207,0.5)' : '1px solid rgba(223,219,207,0.2)',
            borderRadius: 12,
            padding: '14px 12px',
            textAlign: 'center',
            position: 'relative',
          }}>
            {isYesWins && (
              <div style={{
                position: 'absolute', top: -1, left: -1, right: -1,
                height: 2,
                background: 'linear-gradient(90deg, transparent, rgba(223,219,207,0.6), transparent)',
                borderRadius: '12px 12px 0 0',
              }} />
            )}
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 5, letterSpacing: '0.1em' }}>YES</span>
            <span className="font-mono" style={{ display: 'block', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{yesPct}%</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {yesPool.toFixed(1)} RLO
            </span>
            {isYesWins && (
              <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--accent-primary)', marginTop: 4, letterSpacing: '0.05em' }}>
                🏆 WINNER
              </span>
            )}
          </div>

          {/* NO box */}
          <div style={{
            background: isNoWins ? 'rgba(217,79,79,0.1)' : 'rgba(20,20,20,0.8)',
            border: isNoWins ? '1.5px solid rgba(217,79,79,0.6)' : '1px solid rgba(217,79,79,0.3)',
            borderRadius: 12,
            padding: '14px 12px',
            textAlign: 'center',
            position: 'relative',
          }}>
            {isNoWins && (
              <div style={{
                position: 'absolute', top: -1, left: -1, right: -1,
                height: 2,
                background: 'linear-gradient(90deg, transparent, rgba(217,79,79,0.6), transparent)',
                borderRadius: '12px 12px 0 0',
              }} />
            )}
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--danger)', marginBottom: 5, letterSpacing: '0.1em' }}>NO</span>
            <span className="font-mono" style={{ display: 'block', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{noPct}%</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {noPool.toFixed(1)} RLO
            </span>
            {isNoWins && (
              <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--danger)', marginTop: 4, letterSpacing: '0.05em' }}>
                ✗ WINNER
              </span>
            )}
          </div>
        </div>

        {/* Winner banner + claim CTA */}
        <div style={{
          padding: '16px 18px',
          background: winnerBg,
          border: `1px solid ${winnerBorder}`,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            fontWeight: 700,
            color: winnerColor,
          }}>
            {winnerEmoji} {winnerLabel}
          </div>
          <p style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            margin: 0,
          }}>
            {claimMsg}
          </p>
          <Link to="/profile" style={{ textDecoration: 'none' }}>
            <button style={{
              width: '100%',
              padding: '9px 16px',
              background: 'rgba(223,219,207,0.07)',
              color: 'var(--accent-primary)',
              border: '1px solid rgba(223,219,207,0.18)',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              transition: 'background 0.2s, border-color 0.2s',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(223,219,207,0.13)'
                e.currentTarget.style.borderColor = 'rgba(223,219,207,0.3)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(223,219,207,0.07)'
                e.currentTarget.style.borderColor = 'rgba(223,219,207,0.18)'
              }}
            >
              Go to Profile →
            </button>
          </Link>
        </div>

      </div>
    </div>
  )
}

// ─── SettledTab ──────────────────────────────────────────────────────────────

export default function SettledTab({ categoryFilter }) {
  const { allPredictions, refetchPredictions } = useDataCache()

  // Local state only when cache is cold
  const [localSettled, setLocalSettled] = useState(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(8)

  // Fallback fetch if cache is cold on mount
  useEffect(() => {
    if (allPredictions === null) {
      fetchOwnData()
    }
  }, [])

  // When cache arrives, clear local data
  useEffect(() => {
    if (allPredictions !== null) setLocalSettled(null)
  }, [allPredictions])

  async function fetchOwnData() {
    setLocalLoading(true)
    try {
      const { data } = await supabase
        .from('predictions_display')
        .select('*')
        .in('status', ['yes_wins', 'no_wins', 'refunded'])
        .order('settled_at', { ascending: false, nullsFirst: false })
      setLocalSettled(data || [])
    } catch (err) {
      console.error('SettledTab fetch error:', err)
    } finally {
      setLocalLoading(false)
    }
  }

  // Realtime: whenever predictions change, refetch
  useEffect(() => {
    const channel = supabase
      .channel('settled-tab-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions_display' }, () => {
        try { localStorage.removeItem('rc_cache_predictions') } catch {}
        refetchPredictions()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [refetchPredictions])

  const source = allPredictions ?? localSettled ?? []
  const loading = allPredictions === null && localLoading

  // Filter only settled statuses, then by category
  const settled = source.filter(p => {
    const isSettledStatus = ['yes_wins', 'no_wins', 'refunded'].includes(p.status)
    const categoryMatch = !categoryFilter || categoryFilter === 'all_calls' || p.category === categoryFilter
    return isSettledStatus && categoryMatch
  })

  // Sort by settled_at descending
  const sorted = [...settled].sort((a, b) => {
    if (!a.settled_at && !b.settled_at) return 0
    if (!a.settled_at) return 1
    if (!b.settled_at) return -1
    return new Date(b.settled_at) - new Date(a.settled_at)
  })

  const displayed = sorted.slice(0, visibleCount)
  const hasMore = sorted.length > visibleCount

  // Loading skeletons
  if (loading && source.length === 0) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
        gap: 24,
      }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card" style={{ height: 420, borderRadius: 16 }}>
            <div className="skeleton" style={{ height: 160, borderRadius: '16px 16px 0 0' }} />
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="skeleton" style={{ height: 20, width: '80%', borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 14, width: '50%', borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 60, borderRadius: 10 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '80px 24px', borderRadius: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.6 }}>🏁</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
          No settled calls yet
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
          Settled predictions will appear here once the admin declares a winner.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Stats bar */}
      <div style={{
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 18px',
          background: 'rgba(20,20,20,0.7)',
          border: '1px solid rgba(223,219,207,0.1)',
          borderRadius: 10,
        }}>
          <span style={{ fontSize: 18 }}>🏁</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Settled</div>
            <div className="font-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-primary)' }}>{sorted.length}</div>
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 18px',
          background: 'rgba(20,20,20,0.7)',
          border: '1px solid rgba(223,219,207,0.1)',
          borderRadius: 10,
        }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>YES Wins</div>
            <div className="font-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-primary)' }}>
              {sorted.filter(p => p.status === 'yes_wins').length}
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 18px',
          background: 'rgba(20,20,20,0.7)',
          border: '1px solid rgba(223,219,207,0.1)',
          borderRadius: 10,
        }}>
          <span style={{ fontSize: 18 }}>✗</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>NO Wins</div>
            <div className="font-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>
              {sorted.filter(p => p.status === 'no_wins').length}
            </div>
          </div>
        </div>
      </div>

      {/* Grid of settled cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
        gap: 24,
      }}>
        {displayed.map(pred => (
          <SettledCard key={pred.id} prediction={pred} />
        ))}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => setVisibleCount(v => v + 8)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(223,219,207,0.2)',
              color: '#DFDBCF',
              padding: '12px 32px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
