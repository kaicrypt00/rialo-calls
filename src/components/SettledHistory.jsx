import { useEffect, useState } from 'react'
import { supabase } from '../config/supabase'
import { formatRitualNum, formatMonthYear } from '../utils/format'

const PAGE_SIZE = 20

export default function SettledHistory() {
  const [settled, setSettled] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    fetchSettled()
  }, [page])

  async function fetchSettled() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('predictions_display')
        .select('*')
        .in('status', ['yes_wins', 'no_wins', 'refunded'])
        .order('settled_at', { ascending: false, nullsFirst: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (data) {
        setSettled(prev => page === 1 ? data : [...prev, ...data])
        setHasMore(data.length === PAGE_SIZE)
      }
    } catch (err) {
      console.error('Settled history fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!loading && settled.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 className="text-section-heading" style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        Settled History
      </h2>

      {loading && settled.length === 0 ? (
        <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />
          ))}
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Prediction</th>
                <th>Result</th>
                <th>Total Pot</th>
                <th>Settled</th>
              </tr>
            </thead>
            <tbody>
              {settled.map(p => {
                const totalPool = (parseFloat(p.yes_pool || 0) + parseFloat(p.no_pool || 0)).toFixed(3)
                const resultLabel = p.status === 'yes_wins'
                  ? <span className="status-pill status-settled-yes" style={{ fontSize: 11 }}>✓ YES WINS</span>
                  : p.status === 'no_wins'
                    ? <span className="status-pill status-settled-no" style={{ fontSize: 11 }}>✗ NO WINS</span>
                    : <span className="status-pill status-refunded" style={{ fontSize: 11 }}>REFUNDED</span>

                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {p.banner_url && (
                          <img
                            src={p.banner_url}
                            alt=""
                            style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                          />
                        )}
                        <span style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 14,
                          fontWeight: 600,
                          maxWidth: 280,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                        }}>
                          {p.title}
                        </span>
                      </div>
                    </td>
                    <td>{resultLabel}</td>
                    <td>
                      <span className="font-mono" style={{ fontSize: 13, color: 'var(--accent-primary)' }}>
                        {totalPool} RLO
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {p.settled_at ? formatMonthYear(p.settled_at) : '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {hasMore && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPage(p => p + 1)}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
