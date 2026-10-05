import React, { useState, useEffect, useCallback } from 'react'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { POLL_REGISTRY_ADDRESS, POLL_REGISTRY_ABI } from '../config/contracts'
import { useSessionWallet } from '../context/SessionWalletContext'
import { useProfile } from '../context/ProfileContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../config/supabase'

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
})

function shortenAddress(addr) {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function timeFromUnix(unix) {
  const diff = Date.now() - Number(unix) * 1000
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function PollTab() {
  const { sessionWallet } = useSessionWallet()
  const { profile } = useProfile()
  const { showPending, showConfirmed, showFailed } = useToast()

  const [activeTab, setActiveTab] = useState('vote')
  const [polls, setPolls] = useState([])
  const [history, setHistory] = useState([])
  const [votedPolls, setVotedPolls] = useState(new Set())
  const [profileNames, setProfileNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ title: '', description: '' })
  const [hoveredPoll, setHoveredPoll] = useState(null)

  const loadPolls = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await publicClient.readContract({
        address: POLL_REGISTRY_ADDRESS,
        abi: POLL_REGISTRY_ABI,
        functionName: 'getActivePolls',
      })
      const sorted = [...data].sort((a, b) => Number(b.voteCount) - Number(a.voteCount))
      setPolls(sorted)

      const addresses = [...new Set(sorted.map(p => p.submittedBy.toLowerCase()))]
      if (addresses.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('wallet_address, name')
          .in('wallet_address', addresses)
        if (profiles) {
          const map = {}
          profiles.forEach(p => { map[p.wallet_address.toLowerCase()] = p.name })
          setProfileNames(prev => ({ ...prev, ...map }))
        }
      }
    } catch (e) {
      console.error('Load polls failed:', e)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const data = await publicClient.readContract({
        address: POLL_REGISTRY_ADDRESS,
        abi: POLL_REGISTRY_ABI,
        functionName: 'getHistory',
      })
      const reversed = [...data].reverse()
      setHistory(reversed)

      const addresses = [...new Set(reversed.map(h => h.submittedBy.toLowerCase()))]
      if (addresses.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('wallet_address, name')
          .in('wallet_address', addresses)
        if (profiles) {
          const map = {}
          profiles.forEach(p => { map[p.wallet_address.toLowerCase()] = p.name })
          setProfileNames(prev => ({ ...prev, ...map }))
        }
      }
    } catch (e) {
      console.error('Load history failed:', e)
    }
  }, [])

  const loadVotedPolls = useCallback(async () => {
    if (!sessionWallet || polls.length === 0) return
    try {
      const checks = await Promise.all(
        polls.map(p =>
          publicClient.readContract({
            address: POLL_REGISTRY_ADDRESS,
            abi: POLL_REGISTRY_ABI,
            functionName: 'hasVoted',
            args: [p.id, sessionWallet.address],
          })
        )
      )
      // Merge into existing set — never remove optimistic entries
      setVotedPolls(prev => {
        const next = new Set(prev)
        polls.forEach((p, i) => { if (checks[i]) next.add(String(p.id)) })
        return next
      })
    } catch (e) {
      console.error('Load voted polls failed:', e)
    }
  }, [sessionWallet, polls])


  useEffect(() => {
    loadPolls()
    loadHistory()
  }, [])

  useEffect(() => {
    if (polls.length > 0 && sessionWallet) loadVotedPolls()
  }, [polls, sessionWallet])

  // ── Vote ──────────────────────────────────────────────────────────────────────
  async function handleVote(poll) {
    if (!sessionWallet) return showFailed({ message: 'Activate your Rialo Calls Wallet first' })
    if (!profile) return showFailed({ message: 'You need a profile to vote' })
    const pollIdStr = String(poll.id)
    if (votedPolls.has(pollIdStr)) return

    setVoting(pollIdStr)
    showPending(`Voting on: ${poll.title}`)
    try {
      const txHash = await sessionWallet.client.writeContract({
        address: POLL_REGISTRY_ADDRESS,
        abi: POLL_REGISTRY_ABI,
        functionName: 'vote',
        args: [poll.id],
      })

      showPending('Waiting for confirmation...')
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      // Only update UI AFTER tx is confirmed
      setVotedPolls(prev => new Set([...prev, pollIdStr]))
      setPolls(prev => prev.map(p => p.id === poll.id ? { ...p, voteCount: p.voteCount + 1n } : p))
      showConfirmed(txHash, 'Vote confirmed!')

      // Log to wallet_transactions
      supabase.from('wallet_transactions').insert({
        wallet_address: sessionWallet.address.toLowerCase(),
        type: 'vote',
        label: `Voted on: ${poll.title}`,
        tx_hash: txHash,
      }).then(() => {})

      // Silent reload — keeps cards visible while vote counts update
      loadPolls(true)
    } catch (e) {
      showFailed(e)
    } finally {
      setVoting(null)
    }
  }

  // ── Submit Idea ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!sessionWallet) return showFailed({ message: 'Activate your Rialo Calls Wallet first' })
    if (!profile) return showFailed({ message: 'You need a profile to submit' })
    if (!form.title.trim()) return showFailed({ message: 'Title is required' })

    setSubmitting(true)
    showPending('Submitting idea on-chain...')
    try {
      const txHash = await sessionWallet.client.writeContract({
        address: POLL_REGISTRY_ADDRESS,
        abi: POLL_REGISTRY_ABI,
        functionName: 'submitPoll',
        args: [form.title.trim(), form.description.trim()],
      })

      showPending('Waiting for confirmation...')
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      showConfirmed(txHash, 'Idea submitted on-chain!')

      // Log to wallet_transactions
      supabase.from('wallet_transactions').insert({
        wallet_address: sessionWallet.address.toLowerCase(),
        type: 'poll_submit',
        label: `Submitted idea: ${form.title.trim()}`,
        tx_hash: txHash,
      }).then(() => {})

      setForm({ title: '', description: '' })

      // Silent reload — cards stay visible, new poll appears in list
      await loadPolls(true)

      // Switch to vote tab only after polls are refreshed
      setActiveTab('vote')
    } catch (e) {
      showFailed(e)
    } finally {
      setSubmitting(false)
    }
  }

  function getDisplayName(address) {
    return profileNames[address.toLowerCase()] || shortenAddress(address)
  }

  // Group history by round number
  const rounds = history.reduce((acc, item) => {
    const r = String(item.round)
    if (!acc[r]) acc[r] = []
    acc[r].push(item)
    return acc
  }, {})

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px',
        background: '#141414', padding: '4px', borderRadius: '10px', width: 'fit-content',
      }}>
        {[
          { id: 'vote',    label: 'Live Polls' },
          { id: 'submit',  label: 'Submit Idea' },
          { id: 'history', label: 'History' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '8px 18px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            fontSize: '13px', fontWeight: '500',
            background: activeTab === t.id ? 'rgba(223,219,207,0.1)' : 'transparent',
            color: activeTab === t.id ? '#DFDBCF' : '#555555',
            transition: 'all 0.2s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── LIVE POLLS ── */}
      {activeTab === 'vote' && (
        <div>
          {loading && (
            <div style={{ color: '#555555', textAlign: 'center', padding: '60px' }}>
              Loading polls from chain...
            </div>
          )}
          {!loading && polls.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🗳</div>
              <div style={{ color: '#DFDBCF', fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No polls yet</div>
              <div style={{ color: '#555555', fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
                Be the first to submit a bet idea for the community to vote on.
              </div>
              <button onClick={() => setActiveTab('submit')} style={{
                background: 'rgba(223,219,207,0.1)', color: '#DFDBCF',
                border: '1px solid rgba(223,219,207,0.2)',
                padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
                fontWeight: '600', fontSize: 13,
              }}>
                Submit an Idea →
              </button>
            </div>
          )}
          {!loading && polls.length > 0 && (() => {
            const totalVotes = polls.reduce((s, p) => s + Number(p.voteCount), 0)
            const RANK_STYLE = [
              { color: '#C9A84C', bg: 'rgba(201,168,76,0.08)', border: 'rgba(201,168,76,0.2)', label: '🥇' },
              { color: '#A0A0A0', bg: 'rgba(160,160,160,0.06)', border: 'rgba(160,160,160,0.15)', label: '🥈' },
              { color: '#8B6B3D', bg: 'rgba(139,107,61,0.06)', border: 'rgba(139,107,61,0.15)', label: '🥉' },
            ]
            return polls.map((poll, i) => {
              const pollIdStr = String(poll.id)
              const voted = votedPolls.has(pollIdStr)
              const isVoting = voting === pollIdStr
              const voteCount = Number(poll.voteCount)
              const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0
              const rank = RANK_STYLE[i] || { color: '#3A3A3A', bg: 'rgba(255,255,255,0.02)', border: 'rgba(223,219,207,0.06)', label: null }
              const isTop = i === 0 && voteCount > 0
              return (
                <div
                  key={pollIdStr}
                  className={`poll-card ${
                    hoveredPoll === pollIdStr
                      ? (i === 0 && voteCount > 0 ? 'hovered-gold' : 'hovered-default')
                      : ''
                  }`}
                  onMouseEnter={() => setHoveredPoll(pollIdStr)}
                  onMouseLeave={() => setHoveredPoll(null)}
                  style={{
                    background: i === 0 && voteCount > 0
                      ? 'linear-gradient(135deg, rgba(201,168,76,0.04) 0%, rgba(20,20,20,1) 60%)'
                      : '#141414',
                    border: `1px solid ${i < 3 && voteCount > 0 ? rank.border : 'rgba(223,219,207,0.07)'}`,
                    borderRadius: '14px', padding: '0', marginBottom: '10px',
                    overflow: 'hidden', position: 'relative',
                  }}>

                  {/* Top crown bar for #1 */}
                  {isTop && (
                    <div style={{
                      height: 2,
                      background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.6) 30%, rgba(201,168,76,0.8) 50%, rgba(201,168,76,0.6) 70%, transparent)',
                    }} />
                  )}

                  <div style={{ padding: '18px 20px' }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

                      {/* Rank badge */}
                      <div style={{
                        flexShrink: 0, width: 36, height: 36,
                        borderRadius: '10px',
                        background: voteCount > 0 ? rank.bg : 'rgba(223,219,207,0.03)',
                        border: `1px solid ${voteCount > 0 ? rank.border : 'rgba(223,219,207,0.06)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column',
                      }}>
                        {voteCount > 0 && i < 3 ? (
                          <span style={{ fontSize: 16 }}>{rank.label}</span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'rgba(223,219,207,0.25)' }}>
                            #{i + 1}
                          </span>
                        )}
                      </div>

                      {/* Main content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                          <div style={{
                            color: i === 0 && voteCount > 0 ? '#DFDBCF' : '#DFDBCF',
                            fontSize: '15px', fontWeight: 600, lineHeight: 1.35,
                            flex: 1,
                          }}>
                            {isTop && (
                              <span style={{
                                display: 'inline-block', fontSize: 9, fontWeight: 700,
                                letterSpacing: '0.1em', textTransform: 'uppercase',
                                color: '#C9A84C', background: 'rgba(201,168,76,0.1)',
                                border: '1px solid rgba(201,168,76,0.2)',
                                padding: '2px 6px', borderRadius: 4, marginRight: 8,
                                verticalAlign: 'middle',
                              }}>
                                Top Pick
                              </span>
                            )}
                            {poll.title}
                          </div>

                          {/* Vote button + count */}
                          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <button
                              onClick={() => handleVote(poll)}
                              disabled={voted || isVoting || !sessionWallet || !profile}
                              className={`poll-vote-btn${voted ? ' is-voted' : ''}`}
                              style={{
                                background: voted
                                  ? 'rgba(223,219,207,0.08)'
                                  : isVoting
                                    ? 'rgba(223,219,207,0.05)'
                                    : 'rgba(223,219,207,0.09)',
                                border: voted
                                  ? '1px solid rgba(223,219,207,0.18)'
                                  : isVoting
                                    ? '1px solid rgba(223,219,207,0.1)'
                                    : '1px solid rgba(223,219,207,0.18)',
                                color: voted ? '#DFDBCF' : isVoting ? '#555555' : '#DFDBCF',
                                padding: '7px 14px', borderRadius: '8px',
                                cursor: voted || isVoting || !sessionWallet || !profile ? 'default' : 'pointer',
                                fontSize: '12px', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 5,
                                minWidth: 72, justifyContent: 'center',
                                fontFamily: 'var(--font-body)',
                              }}
                            >
                              {isVoting ? (
                                <span style={{
                                  width: 10, height: 10,
                                  border: '1.5px solid rgba(223,219,207,0.3)',
                                  borderTopColor: '#DFDBCF', borderRadius: '50%',
                                  display: 'inline-block', animation: 'poll-spin 0.7s linear infinite',
                                }} />
                              ) : voted ? (
                                <>✓ Voted</>
                              ) : (
                                <>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                    <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                                    <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                  </svg>
                                  Vote
                                </>
                              )}
                            </button>
                            <div style={{ textAlign: 'center' }}>
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700,
                                color: i === 0 && voteCount > 0 ? '#C9A84C' : '#DFDBCF',
                                lineHeight: 1,
                              }}>
                                {voteCount}
                              </span>
                              <div style={{ color: '#3A3A3A', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 1 }}>
                                votes
                              </div>
                            </div>
                          </div>
                        </div>

                        {poll.description && (
                          <div style={{ color: '#555555', fontSize: '13px', marginBottom: 10, lineHeight: 1.5 }}>
                            {poll.description}
                          </div>
                        )}

                        {/* Vote progress bar */}
                        <div style={{ marginBottom: 10 }}>
                          <div style={{
                            height: 3, background: 'rgba(223,219,207,0.06)',
                            borderRadius: 4, overflow: 'hidden',
                          }}>
                            <div style={{
                              height: '100%', borderRadius: 4,
                              width: `${pct}%`,
                              background: i === 0
                                ? 'linear-gradient(90deg, rgba(201,168,76,0.6), rgba(201,168,76,0.9))'
                                : 'rgba(223,219,207,0.2)',
                              transition: 'width 0.5s ease',
                            }} />
                          </div>
                          {totalVotes > 0 && (
                            <div style={{ color: '#3A3A3A', fontSize: 10, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                              {pct}% of all votes
                            </div>
                          )}
                        </div>

                        {/* Meta row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%',
                            background: 'rgba(223,219,207,0.07)',
                            border: '1px solid rgba(223,219,207,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, fontSize: 8,
                          }}>
                            👤
                          </div>
                          <span style={{ color: '#3A3A3A', fontSize: 11 }}>
                            <span style={{ color: '#555555' }}>{getDisplayName(poll.submittedBy)}</span>
                            {' · '}
                            {timeFromUnix(poll.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          })()}
        </div>

      )}

      {/* ── SUBMIT IDEA ── */}
      {activeTab === 'submit' && (
        <div>
          {(!sessionWallet || !profile) ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ color: '#DFDBCF', fontSize: '18px', marginBottom: '8px' }}>Profile Required</div>
              <div style={{ color: '#555555', fontSize: '14px' }}>
                You need a minted profile to submit poll ideas.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{
                background: '#141414', border: '1px solid rgba(223,219,207,0.08)',
                borderRadius: '12px', padding: '24px',
              }}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#8B8B8B', fontSize: '13px', marginBottom: '8px' }}>
                    Bet Idea Title *
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="What do you want the community to call?"
                    maxLength={120}
                    disabled={submitting}
                    style={{
                      width: '100%', background: '#0A0A0A',
                      border: '1px solid rgba(223,219,207,0.15)', borderRadius: '8px',
                      padding: '12px 14px', color: '#DFDBCF', fontSize: '14px',
                      outline: 'none', boxSizing: 'border-box',
                      opacity: submitting ? 0.6 : 1,
                    }}
                  />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#8B8B8B', fontSize: '13px', marginBottom: '8px' }}>
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Add context about your bet idea..."
                    rows={4}
                    maxLength={500}
                    disabled={submitting}
                    style={{
                      width: '100%', background: '#0A0A0A',
                      border: '1px solid rgba(223,219,207,0.15)', borderRadius: '8px',
                      padding: '12px 14px', color: '#DFDBCF', fontSize: '14px',
                      outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                      opacity: submitting ? 0.6 : 1,
                    }}
                  />
                </div>
                <div style={{
                  marginBottom: '24px', padding: '12px 14px',
                  background: 'rgba(223,219,207,0.03)',
                  border: '1px solid rgba(223,219,207,0.06)', borderRadius: '8px',
                }}>
                  <div style={{ color: '#555555', fontSize: '11px', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Submitted By
                  </div>
                  <div style={{ color: '#8B8B8B', fontSize: '14px' }}>{profile.name}</div>
                </div>
                <button type="submit" disabled={submitting} style={{
                  background: submitting ? 'rgba(223,219,207,0.08)' : '#DFDBCF',
                  color: submitting ? 'rgba(223,219,207,0.4)' : '#0A0A0A',
                  border: 'none',
                  padding: '12px 24px', borderRadius: '8px',
                  fontSize: '14px', fontWeight: '600',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  width: '100%', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  {submitting && (
                    <span style={{
                      width: 14, height: 14, border: '2px solid rgba(223,219,207,0.3)',
                      borderTopColor: 'rgba(223,219,207,0.8)', borderRadius: '50%',
                      display: 'inline-block', animation: 'poll-spin 0.7s linear infinite',
                    }} />
                  )}
                  {submitting ? 'Confirming on-chain...' : 'Submit Idea'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── HISTORY ── */}
      {activeTab === 'history' && (
        <div>
          {Object.keys(rounds).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ color: '#DFDBCF', fontSize: '18px', marginBottom: '8px' }}>No history yet</div>
              <div style={{ color: '#555555', fontSize: '14px' }}>
                Past winning polls will appear here after each round closes.
              </div>
            </div>
          ) : (
            Object.keys(rounds)
              .sort((a, b) => Number(b) - Number(a))
              .map(round => (
                <div key={round} style={{ marginBottom: '32px' }}>
                  <div style={{
                    color: '#555555', fontSize: '12px',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px',
                  }}>
                    Round {round} Winners
                  </div>
                  {rounds[round].map((item, i) => (
                    <div key={`${String(item.pollId)}-${i}`} style={{
                      background: '#141414',
                      border: i === 0 ? '1px solid rgba(201,168,76,0.25)' : '1px solid rgba(223,219,207,0.06)',
                      borderRadius: '10px', padding: '16px 20px', marginBottom: '8px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: i === 0 ? '#C9A84C' : '#DFDBCF',
                          fontSize: '15px', fontWeight: '500', marginBottom: '4px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : '🥉 '}{item.title}
                        </div>
                        <div style={{ color: '#555555', fontSize: '12px' }}>
                          by {getDisplayName(item.submittedBy)}
                        </div>
                      </div>
                      <div style={{ color: '#8B8B8B', fontFamily: 'monospace', fontSize: '14px', flexShrink: 0, marginLeft: 16 }}>
                        {String(item.voteCount)} votes
                      </div>
                    </div>
                  ))}
                </div>
              ))
          )}
        </div>
      )}

      <style>{`
        @keyframes poll-spin {
          to { transform: rotate(360deg); }
        }

        /* Card hover glow */
        .poll-card {
          cursor: default;
          transition: border-color 0.22s ease, box-shadow 0.22s ease, transform 0.15s ease !important;
        }
        .poll-card:hover {
          transform: translateY(-1px);
        }
        .poll-card.hovered-default {
          border-color: rgba(223,219,207,0.22) !important;
          box-shadow: 0 0 0 1px rgba(223,219,207,0.07), 0 4px 24px rgba(0,0,0,0.4), 0 0 18px rgba(223,219,207,0.04) !important;
        }
        .poll-card.hovered-gold {
          border-color: rgba(201,168,76,0.45) !important;
          box-shadow: 0 0 0 1px rgba(201,168,76,0.12), 0 4px 28px rgba(0,0,0,0.5), 0 0 22px rgba(201,168,76,0.1) !important;
        }

        /* Vote button interactions */
        .poll-vote-btn {
          position: relative;
          overflow: hidden;
          transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.1s ease !important;
          user-select: none;
        }
        .poll-vote-btn:not(:disabled):hover {
          background: rgba(223,219,207,0.14) !important;
          border-color: rgba(223,219,207,0.32) !important;
          box-shadow: 0 0 14px rgba(223,219,207,0.08), inset 0 1px 0 rgba(223,219,207,0.06) !important;
        }
        .poll-vote-btn:not(:disabled):active {
          transform: scale(0.94);
          background: rgba(223,219,207,0.2) !important;
          box-shadow: 0 0 6px rgba(223,219,207,0.12) !important;
        }
        /* Ripple on click */
        .poll-vote-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle, rgba(223,219,207,0.18) 0%, transparent 70%);
          opacity: 0;
          transition: opacity 0.4s ease;
          pointer-events: none;
        }
        .poll-vote-btn:not(:disabled):active::after {
          opacity: 1;
          transition: opacity 0s;
        }
        /* Voted state */
        .poll-vote-btn.is-voted {
          background: rgba(223,219,207,0.08) !important;
          border-color: rgba(223,219,207,0.18) !important;
          color: #DFDBCF !important;
          cursor: default;
        }
        .poll-vote-btn.is-voted:hover {
          background: rgba(223,219,207,0.08) !important;
          border-color: rgba(223,219,207,0.18) !important;
          box-shadow: none !important;
        }
      `}</style>
    </div>
  )
}
