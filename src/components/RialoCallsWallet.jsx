import React, { useState, useRef, useEffect } from 'react'
import { parseEther } from 'viem'
import { useSessionWallet } from '../context/SessionWalletContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../config/supabase'

function truncateAddress(addr) {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const TX_TYPE_ICON = {
  bet: '🎯',
  claim: '🏆',
  refund: '↩',
  poll_submit: '💡',
  vote: '🗳',
}

export default function RialoCallsWallet() {
  const { sessionWallet, ethBalance, rloBalance, loadBalances } = useSessionWallet()
  const { showPending, showConfirmed, showFailed } = useToast()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [txs, setTxs] = useState([])
  const [showAll, setShowAll] = useState(false)
  const dropdownRef = useRef(null)

  // Send ETH state
  const [showSend, setShowSend] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    if (refreshing || !sessionWallet) return
    setRefreshing(true)
    try {
      await Promise.all([loadBalances(), loadRecentTxs()])
    } finally {
      setRefreshing(false)
    }
  }

  // Load on open
  useEffect(() => {
    if (open && sessionWallet) {
      loadBalances()
      loadRecentTxs()
    }
  }, [open])

  // Auto-refresh: load immediately when wallet connects, then every 15s
  useEffect(() => {
    if (!sessionWallet) return
    loadBalances() // immediate on mount / wallet connect
    const interval = setInterval(() => {
      loadBalances()
    }, 15000)
    return () => clearInterval(interval)
  }, [sessionWallet, loadBalances])

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
        setShowSend(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadRecentTxs() {
    if (!sessionWallet) return
    const { data } = await supabase
      .from('wallet_transactions')
      .select('type, label, amount, tx_hash, created_at')
      .eq('wallet_address', sessionWallet.address.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setTxs(data)
  }

  function copyAddress() {
    navigator.clipboard.writeText(sessionWallet.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend(e) {
    e.preventDefault()
    setSendError('')

    if (!sendTo.startsWith('0x') || sendTo.length !== 42) {
      setSendError('Invalid address')
      return
    }
    const amt = parseFloat(sendAmount)
    if (isNaN(amt) || amt <= 0) { setSendError('Enter a valid amount'); return }
    const bal = parseFloat(ethBalance)
    if (amt >= bal) { setSendError('Insufficient balance'); return }

    setSending(true)
    setOpen(false)
    showPending(`Sending ${sendAmount} ETH...`)
    try {
      const txHash = await sessionWallet.client.sendTransaction({
        to: sendTo,
        value: parseEther(sendAmount),
      })

      showPending('Waiting for confirmation...')
      // Note: sendTransaction doesn't need waitForTransactionReceipt here —
      // the toast system shows confirmed immediately for speed
      showConfirmed(txHash, `Sent ${sendAmount} ETH`)

      supabase.from('wallet_transactions').insert({
        wallet_address: sessionWallet.address.toLowerCase(),
        type: 'refund',
        label: `Sent ${sendAmount} ETH to ${truncateAddress(sendTo)}`,
        tx_hash: txHash,
      }).then(() => {})

      setSendTo('')
      setSendAmount('')
      setShowSend(false)
      await loadBalances()
    } catch (e) {
      showFailed(e)
      setSendError(e.shortMessage || e.message || 'Send failed')
      setOpen(true)
    } finally {
      setSending(false)
    }
  }

  if (!sessionWallet) return null

  const displayed = showAll ? txs : txs.slice(0, 5)

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>

      {/* ── Navbar trigger pill ── */}
      <button
        onClick={() => { setOpen(v => !v); if (open) setShowSend(false) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: open ? 'rgba(223,219,207,0.08)' : 'rgba(20,20,20,0.9)',
          border: `1px solid ${open ? 'rgba(223,219,207,0.28)' : 'rgba(223,219,207,0.15)'}`,
          borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
          color: '#DFDBCF', fontFamily: 'var(--font-body)', fontSize: 13,
          fontWeight: 500, transition: 'all 0.2s ease',
          backdropFilter: 'blur(12px)',
          boxShadow: open ? '0 0 20px rgba(223,219,207,0.06)' : 'none',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.borderColor = 'rgba(223,219,207,0.3)'
            e.currentTarget.style.background = 'rgba(223,219,207,0.06)'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = 'rgba(223,219,207,0.15)'
            e.currentTarget.style.background = 'rgba(20,20,20,0.9)'
          }
        }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: '#DFDBCF',
          boxShadow: '0 0 6px rgba(223,219,207,0.7)', flexShrink: 0, display: 'inline-block',
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#DFDBCF' }}>
          {rloBalance}
        </span>
        <span style={{ color: 'rgba(223,219,207,0.4)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em' }}>
          RLO
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', marginLeft: 2, opacity: 0.5 }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="#DFDBCF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: 300,
          background: 'rgba(14,14,14,0.97)',
          backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid rgba(223,219,207,0.12)', borderRadius: 16, zIndex: 1000,
          boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(223,219,207,0.04)',
          overflow: 'hidden', animation: 'rcw-drop-in 0.18s ease',
        }}>

          {/* Top accent */}
          <div style={{
            height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(223,219,207,0.4) 40%, rgba(201,168,76,0.3) 70%, transparent)',
          }} />

          <div style={{ padding: '18px 18px 16px' }}>

            {/* ── Header ── */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'rgba(139,139,139,0.6)',
                fontFamily: 'var(--font-body)',
              }}>
                Rialo Calls Wallet
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh balances"
                style={{
                  background: 'none', border: 'none', padding: 4,
                  cursor: refreshing ? 'default' : 'pointer',
                  color: 'rgba(139,139,139,0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 5, transition: 'color 0.2s',
                }}
                onMouseEnter={e => { if (!refreshing) e.currentTarget.style.color = 'rgba(223,219,207,0.55)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(139,139,139,0.45)' }}
              >
                <svg
                  width="11" height="11" viewBox="0 0 24 24" fill="none"
                  style={{
                    animation: refreshing ? 'rcw-spin 0.8s linear infinite' : 'none',
                    transition: 'opacity 0.2s',
                  }}
                >
                  <path d="M21 12a9 9 0 01-9 9c-2.76 0-5.23-1.24-6.92-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M3 12a9 9 0 019-9c2.76 0 5.23 1.24 6.92 3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M21 3v4h-4M3 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* ── Address row: address + copy + send ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(223,219,207,0.04)',
              border: '1px solid rgba(223,219,207,0.08)',
              borderRadius: 9, padding: '9px 10px',
              marginBottom: 14,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#DFDBCF', boxShadow: '0 0 5px rgba(223,219,207,0.55)',
                display: 'inline-block', flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'rgba(223,219,207,0.7)', flex: 1,
              }}>
                {truncateAddress(sessionWallet.address)}
              </span>
              <button
                onClick={copyAddress}
                style={{
                  background: copied ? 'rgba(74,222,128,0.12)' : 'rgba(223,219,207,0.07)',
                  border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(223,219,207,0.1)'}`,
                  borderRadius: 5, padding: '3px 8px',
                  color: copied ? '#4ade80' : 'rgba(223,219,207,0.45)',
                  cursor: 'pointer', fontSize: 10, fontWeight: 600,
                  fontFamily: 'var(--font-body)', transition: 'all 0.2s ease',
                }}
              >
                {copied ? '✓' : 'Copy'}
              </button>
              <div style={{ width: 1, height: 14, background: 'rgba(223,219,207,0.1)' }} />
              <button
                onClick={() => setShowSend(v => !v)}
                style={{
                  background: showSend ? 'rgba(201,168,76,0.1)' : 'rgba(223,219,207,0.06)',
                  border: `1px solid ${showSend ? 'rgba(201,168,76,0.25)' : 'rgba(223,219,207,0.1)'}`,
                  borderRadius: 5, padding: '3px 8px',
                  color: showSend ? '#C9A84C' : 'rgba(223,219,207,0.45)',
                  cursor: 'pointer', fontSize: 10, fontWeight: 600,
                  fontFamily: 'var(--font-body)', transition: 'all 0.2s ease',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                  <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Send
              </button>
            </div>

            {/* ── Send ETH panel (inline, themed) ── */}
            {showSend && (
              <form onSubmit={handleSend} style={{ marginBottom: 14 }}>
                <div style={{
                  background: 'rgba(223,219,207,0.02)',
                  border: '1px solid rgba(223,219,207,0.08)',
                  borderRadius: 10, padding: '12px',
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'rgba(201,168,76,0.6)',
                    marginBottom: 10,
                  }}>
                    Send ETH · Sepolia
                  </div>
                  <input
                    type="text"
                    value={sendTo}
                    onChange={e => { setSendTo(e.target.value); setSendError('') }}
                    placeholder="Recipient address 0x..."
                    style={{
                      width: '100%', background: 'rgba(10,10,10,0.6)',
                      border: '1px solid rgba(223,219,207,0.1)', borderRadius: 7,
                      padding: '8px 10px', color: '#DFDBCF', fontSize: 11,
                      outline: 'none', boxSizing: 'border-box',
                      fontFamily: 'var(--font-mono)', marginBottom: 6,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="number"
                      value={sendAmount}
                      onChange={e => { setSendAmount(e.target.value); setSendError('') }}
                      placeholder="Amount ETH"
                      step="0.0001" min="0"
                      style={{
                        flex: 1, background: 'rgba(10,10,10,0.6)',
                        border: '1px solid rgba(223,219,207,0.1)', borderRadius: 7,
                        padding: '8px 10px', color: '#DFDBCF', fontSize: 11,
                        outline: 'none', boxSizing: 'border-box',
                        fontFamily: 'var(--font-mono)',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={sending}
                      style={{
                        background: 'rgba(201,168,76,0.12)',
                        border: '1px solid rgba(201,168,76,0.25)',
                        borderRadius: 7, padding: '8px 14px',
                        color: sending ? 'rgba(201,168,76,0.4)' : '#C9A84C',
                        cursor: sending ? 'not-allowed' : 'pointer',
                        fontSize: 11, fontWeight: 700,
                        fontFamily: 'var(--font-body)',
                        transition: 'all 0.2s ease', flexShrink: 0,
                      }}
                    >
                      {sending ? '...' : 'Send →'}
                    </button>
                  </div>
                  {sendError && (
                    <div style={{ color: '#D94F4F', fontSize: 10, marginTop: 6, lineHeight: 1.4 }}>
                      ⚠ {sendError}
                    </div>
                  )}
                  <div style={{ color: 'rgba(139,139,139,0.4)', fontSize: 10, marginTop: 6 }}>
                    Balance: {ethBalance} ETH
                  </div>
                </div>
              </form>
            )}

            {/* ── Balance rows ── */}
            <div style={{
              background: 'rgba(223,219,207,0.03)',
              border: '1px solid rgba(223,219,207,0.08)',
              borderRadius: 12, overflow: 'hidden', marginBottom: 14,
            }}>
              {/* ETH */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderBottom: '1px solid rgba(223,219,207,0.06)',
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(139,139,139,0.55)', marginBottom: 3 }}>
                    ETH · Gas
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: '#DFDBCF', letterSpacing: '-0.02em' }}>
                    {ethBalance}
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(223,219,207,0.35)', marginLeft: 5 }}>ETH</span>
                  </div>
                </div>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(223,219,207,0.05)', border: '1px solid rgba(223,219,207,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L4.5 12.6L12 16.2L19.5 12.6L12 2Z" fill="rgba(223,219,207,0.6)" />
                    <path d="M4.5 13.8L12 22L19.5 13.8L12 17.4L4.5 13.8Z" fill="rgba(223,219,207,0.4)" />
                  </svg>
                </div>
              </div>
              {/* RLO */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(223,219,207,0.45)', marginBottom: 3 }}>
                    RLO · Arena
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: '#DFDBCF', letterSpacing: '-0.02em' }}>
                    {rloBalance}
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(223,219,207,0.35)', marginLeft: 5 }}>RLO</span>
                  </div>
                </div>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(223,219,207,0.05)', border: '1px solid rgba(223,219,207,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src="/rialo-symbol.png" alt="RLO" style={{ width: 16, height: 16, objectFit: 'contain', opacity: 0.75 }} />
                </div>
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ borderTop: '1px solid rgba(223,219,207,0.06)', marginBottom: 12 }} />

            {/* ── Recent activity ── */}
            <div>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'rgba(139,139,139,0.5)',
                fontFamily: 'var(--font-body)', marginBottom: 8,
              }}>
                Recent Activity
              </div>

              {txs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '14px 0', color: 'rgba(85,85,85,0.8)', fontSize: 12, fontStyle: 'italic' }}>
                  No activity yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {displayed.map((tx, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '7px 9px', borderRadius: 7,
                        background: 'rgba(223,219,207,0.02)',
                        border: '1px solid rgba(223,219,207,0.04)',
                        transition: 'background 0.15s', cursor: 'default',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(223,219,207,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(223,219,207,0.02)'}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 11 }}>{TX_TYPE_ICON[tx.type] || '·'}</span>
                          <span style={{
                            color: 'rgba(223,219,207,0.65)', fontSize: 11, fontWeight: 500,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {tx.label}
                          </span>
                        </div>
                        <span style={{ color: 'rgba(139,139,139,0.45)', fontSize: 10, marginLeft: 16 }}>
                          {timeAgo(tx.created_at)}
                        </span>
                      </div>
                      {tx.amount != null && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#DFDBCF', flexShrink: 0, marginLeft: 8 }}>
                          {parseFloat(tx.amount).toFixed(1)}{' '}
                          <span style={{ color: 'rgba(201,168,76,0.5)', fontSize: 9 }}>RLO</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {txs.length > 5 && !showAll && (
                <button
                  onClick={() => setShowAll(true)}
                  style={{
                    background: 'none', border: 'none',
                    color: 'rgba(139,139,139,0.45)', cursor: 'pointer',
                    fontSize: 10, width: '100%', textAlign: 'center',
                    padding: '6px 0 0', fontFamily: 'var(--font-body)',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(223,219,207,0.5)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(139,139,139,0.45)'}
                >
                  Show more ↓
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      <style>{`
        @keyframes rcw-drop-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes rcw-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
