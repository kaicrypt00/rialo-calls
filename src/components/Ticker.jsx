import { useEffect, useState, useRef } from 'react'
import { supabase } from '../config/supabase'
import { shortAddress, timeAgo } from '../utils/format'

export default function Ticker() {
  const [bets, setBets] = useState([])
  const trackRef = useRef(null)

  useEffect(() => {
    fetchBets()

    // Realtime subscription
    const channel = supabase
      .channel('ticker-bets')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bets',
      }, (payload) => {
        setBets(prev => [payload.new, ...prev].slice(0, 30))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchBets() {
    const { data } = await supabase
      .from('bets')
      .select('*, predictions_display(title)')
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setBets(data)
  }

  if (!bets.length) {
    // Show placeholder items so ticker is never empty
    const placeholders = [
      { id: '1', wallet_address: '0xCffa...c66', side: 'YES', amount: 0.5, predictions_display: { title: 'Will Rialo Calls hit 10K community members?' } },
      { id: '2', wallet_address: '0x225d...47', side: 'NO', amount: 1.2, predictions_display: { title: 'Will the next deploy ship before Friday?' } },
      { id: '3', wallet_address: '0x3f21...9b', side: 'YES', amount: 0.1, predictions_display: { title: 'Will BTC reach 100K by end of month?' } },
    ]
    return <TickerRender bets={placeholders} />
  }

  return <TickerRender bets={bets} />
}

function TickerRender({ bets }) {
  const items = [...bets, ...bets] // double for seamless loop

  return (
    <div className="ticker-wrapper">
      <div className="ticker-track" ref={null}>
        {items.map((bet, i) => {
          const wallet = bet.wallet_address
            ? shortAddress(bet.wallet_address)
            : bet.wallet_address
          const title = bet.predictions_display?.title || 'a prediction'
          const truncTitle = title.length > 40 ? title.slice(0, 40) + '…' : title

          return (
            <span key={`${bet.id}-${i}`} className="ticker-item">
              <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>{wallet}</span>
              <span> called </span>
              <span className={bet.side === 'YES' ? 'ticker-yes' : 'ticker-no'}>
                {bet.side}
              </span>
              <span> on </span>
              <span style={{ color: 'var(--text-primary)' }}>{truncTitle}</span>
              {i < items.length - 1 && <span className="ticker-dot">·</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}
