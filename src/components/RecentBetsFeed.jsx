import { useEffect, useState } from 'react'
import { supabase } from '../config/supabase'
import { shortAddress, timeAgo } from '../utils/format'

export default function RecentBetsFeed() {
  const [bets, setBets] = useState([])

  useEffect(() => {
    fetchBets()

    const channel = supabase
      .channel('recent-bets-feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bets',
      }, (payload) => {
        setBets(prev => [payload.new, ...prev].slice(0, 20))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchBets() {
    const { data } = await supabase
      .from('bets')
      .select('*, predictions_display(title)')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setBets(data)
  }

  return (
    <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="live-dot" style={{ width: 8, height: 8 }} />
        <span className="text-section-heading" style={{ fontSize: 16 }}>Live Activity</span>
      </div>

      {bets.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          <div className="empty-state-subtitle">No bets yet — be the first to call!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 320, overflowY: 'auto' }}>
          {bets.map(bet => {
            const title = bet.predictions_display?.title || 'a prediction'
            const truncTitle = title.length > 35 ? title.slice(0, 35) + '…' : title
            return (
              <div
                key={bet.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(223,219,207,0.06)',
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: bet.side === 'YES' ? 'var(--accent-primary)' : 'var(--danger)',
                    marginTop: 5,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <span className="font-mono" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                    {shortAddress(bet.wallet_address)}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}> called </span>
                  <span style={{
                    color: bet.side === 'YES' ? 'var(--accent-primary)' : 'var(--danger)',
                    fontWeight: 600,
                  }}>
                    {bet.side}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}> — </span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)', fontSize: 12 }}>
                    {bet.amount} RLO
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}> on </span>
                  <span style={{ color: 'var(--text-primary)' }}>{truncTitle}</span>
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11, flexShrink: 0 }}>
                  {timeAgo(bet.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
