import { useState, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { parseUnits, formatUnits, createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { CONTRACT_ADDRESSES, BETTING_POOL_ABI, RLO_ABI, SIDE } from '../config/contracts'
import { supabase } from '../config/supabase'
import { useToast } from '../context/ToastContext'
import { useProfile } from '../context/ProfileContext'
import { useSessionWallet } from '../context/SessionWalletContext'
import { formatRitual, formatCountdown, calcOdds, validateBetAmount } from '../utils/format'
import { EXPLORER_URL } from '../config/wagmi'
import { Link } from 'react-router-dom'

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
})

export default function PredictionCard({ prediction, onBetPlaced }) {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { navState, setShowMintModal } = useProfile()
  const { sessionWallet, hasSessionWallet, createSessionWallet, isCreating, loadBalances } = useSessionWallet()
  const { showPending, showConfirmed, showFailed } = useToast()

  const [betSide, setBetSide]     = useState(null)
  const [betAmount, setBetAmount] = useState('')
  const [betError, setBetError]   = useState('')
  const [betPending, setBetPending] = useState(false)
  const [claimPending, setClaimPending] = useState(false)
  const [refundPending, setRefundPending] = useState(false)
  const [timeLeft, setTimeLeft]   = useState(0)
  const [userBetData, setUserBetData] = useState(null)
  const [bettingLocked, setBettingLocked] = useState(false)
  const [claimableAmount, setClaimableAmount] = useState(null)
  const betInsertedRef = useRef(null)

  const isSettled  = ['yes_wins', 'no_wins'].includes(prediction.status)
  const isRefunded = prediction.status === 'refunded'
  const isDeleted  = prediction.status === 'deleted'

  // Use session wallet address for on-chain reads
  const readAddress = sessionWallet?.address || address

  // Load on-chain data via publicClient (no wagmi hooks — they use main wallet)
  useEffect(() => {
    if (!readAddress || isDeleted) return
    loadChainData()
  }, [readAddress, prediction.id, isDeleted])

  async function loadChainData() {
    try {
      const [locked, bet] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.BETTING_POOL,
          abi: BETTING_POOL_ABI,
          functionName: 'isBettingLocked',
          args: [BigInt(prediction.id)],
        }),
        readAddress ? publicClient.readContract({
          address: CONTRACT_ADDRESSES.BETTING_POOL,
          abi: BETTING_POOL_ABI,
          functionName: 'getUserBet',
          args: [BigInt(prediction.id), readAddress],
        }) : null,
      ])
      setBettingLocked(locked)
      setUserBetData(bet || null)

      if (bet && Number(bet[0]) > 0 && (isSettled || isRefunded)) {
        const claimable = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.BETTING_POOL,
          abi: BETTING_POOL_ABI,
          functionName: 'getClaimableAmount',
          args: [BigInt(prediction.id), readAddress],
        })
        setClaimableAmount(claimable)
      }
    } catch (e) {
      console.error('loadChainData error:', e)
    }
  }

  // Countdown timer
  useEffect(() => {
    if (isDeleted || prediction.no_deadline || !prediction.deadline) return
    const deadline = new Date(prediction.deadline).getTime()
    function tick() { setTimeLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000))) }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [prediction.deadline, prediction.no_deadline, isDeleted])

  if (isDeleted) return null

  const yesPoolNum = parseFloat(prediction.yes_pool || 0)
  const noPoolNum  = parseFloat(prediction.no_pool  || 0)
  const totalPool  = (yesPoolNum + noPoolNum).toFixed(1)
  const yesWei = BigInt(Math.round(yesPoolNum * 1e18))
  const noWei  = BigInt(Math.round(noPoolNum  * 1e18))
  const { yesPct, noPct } = calcOdds(yesWei, noWei)

  const userSide    = userBetData?.[0]
  const userAmount  = userBetData?.[1]
  const userClaimed = userBetData?.[2]
  const hasBet      = !!(userSide && Number(userSide) > 0)

  const isExpired   = !prediction.no_deadline && prediction.deadline && (timeLeft <= 0)
  const isLocked    = prediction.status === 'locked' || bettingLocked || isExpired
  const showBetButtons = !isLocked && !isSettled && !isRefunded && !hasBet
  const winnerSide  = prediction.status === 'yes_wins' ? 'YES' : prediction.status === 'no_wins' ? 'NO' : null
  const canClaim    = isSettled && hasBet && !userClaimed && winnerSide && (
    (winnerSide === 'YES' && Number(userSide) === SIDE.YES) ||
    (winnerSide === 'NO'  && Number(userSide) === SIDE.NO)
  )
  const canRefund   = isRefunded && hasBet && !userClaimed
  const { text: countdownText, level: countdownLevel } = (!prediction.no_deadline && !isSettled && !isRefunded)
    ? formatCountdown(timeLeft)
    : { text: null, level: null }

  // ─── PLACE BET via Session Wallet (RLO ERC-20) ──────────────────────────────
  async function handlePlaceBet() {
    if (!isConnected) { openConnectModal?.(); return }
    if (!hasSessionWallet) {
      try { await createSessionWallet() } catch { return }
    }
    if (navState === 2) { setShowMintModal(true); return }
    if (isExpired || isLocked) { setBetError('Betting is closed for this market.'); return }
    const err = validateBetAmount(betAmount)
    if (err) { setBetError(err); return }
    if (!sessionWallet) return

    setBetError('')
    setBetPending(true)
    try {
      const amountWei = parseUnits(betAmount, 18)

      // 1. Check allowance first
      const allowance = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.RLO_TOKEN,
        abi: RLO_ABI,
        functionName: 'allowance',
        args: [sessionWallet.address, CONTRACT_ADDRESSES.BETTING_POOL],
      })

      // 2. Approve exact amount if needed
      if (allowance < amountWei) {
        showPending('Approving RLO...')
        const approveTxHash = await sessionWallet.client.writeContract({
          address: CONTRACT_ADDRESSES.RLO_TOKEN,
          abi: RLO_ABI,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.BETTING_POOL, amountWei],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash })
      }

      // 3. Place bet
      showPending('Placing your Call...')
      const txHash = await sessionWallet.client.writeContract({
        address: CONTRACT_ADDRESSES.BETTING_POOL,
        abi: BETTING_POOL_ABI,
        functionName: 'placeBet',
        args: [BigInt(prediction.id), betSide === 'YES' ? SIDE.YES : SIDE.NO, amountWei],
        gas: 250000n,
      })

      await publicClient.waitForTransactionReceipt({ hash: txHash })
      showConfirmed(txHash)

      if (betInsertedRef.current !== txHash) {
        betInsertedRef.current = txHash
        await insertBetToSupabase(txHash, parseFloat(betAmount))
        // Log to wallet_transactions
        supabase.from('wallet_transactions').insert({
          wallet_address: sessionWallet.address.toLowerCase(),
          type: 'bet',
          label: `Bet ${betSide} — ${prediction.title.slice(0, 50)}${prediction.title.length > 50 ? '...' : ''}`,
          amount: parseFloat(betAmount),
          tx_hash: txHash,
        }).then(() => {})
      }

      await loadChainData()
      await loadBalances()
      setBetSide(null); setBetAmount(''); setBetError('')
      if (onBetPlaced) onBetPlaced()
    } catch (e) {
      showFailed(e)
    } finally {
      setBetPending(false)
    }
  }

  // ─── CLAIM WINNINGS via Session Wallet ──────────────────────────────────────
  async function handleClaim() {
    if (!sessionWallet) return
    setClaimPending(true)
    try {
      showPending('Claiming your winnings...')
      const txHash = await sessionWallet.client.writeContract({
        address: CONTRACT_ADDRESSES.BETTING_POOL,
        abi: BETTING_POOL_ABI,
        functionName: 'claimWinnings',
        args: [BigInt(prediction.id)],
        gas: 200000n,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      showConfirmed(txHash)
      await loadChainData()
      await loadBalances()
      await updateWinInSupabase()
      // Log to wallet_transactions
      const payout = claimableAmount ? parseFloat(formatUnits(claimableAmount, 18)) : 0
      supabase.from('wallet_transactions').insert({
        wallet_address: sessionWallet.address.toLowerCase(),
        type: 'claim',
        label: `Claimed winnings — ${prediction.title.slice(0, 50)}${prediction.title.length > 50 ? '...' : ''}`,
        amount: payout,
        tx_hash: txHash,
      }).then(() => {})
    } catch (e) {
      showFailed(e)
    } finally {
      setClaimPending(false)
    }
  }

  // ─── CLAIM REFUND via Session Wallet ────────────────────────────────────────
  async function handleRefund() {
    if (!sessionWallet) return
    setRefundPending(true)
    try {
      showPending('Claiming your refund...')
      const txHash = await sessionWallet.client.writeContract({
        address: CONTRACT_ADDRESSES.BETTING_POOL,
        abi: BETTING_POOL_ABI,
        functionName: 'claimRefund',
        args: [BigInt(prediction.id)],
        gas: 150000n,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      showConfirmed(txHash)
      await loadChainData()
      await loadBalances()
      if (sessionWallet?.address) {
        supabase.from('bets').update({ result: 'refunded' })
          .eq('prediction_id', prediction.id)
          .eq('wallet_address', sessionWallet.address.toLowerCase())
          .then(() => {})
        // Log to wallet_transactions
        const refundAmt = userAmount ? parseFloat(formatUnits(userAmount, 18)) : 0
        supabase.from('wallet_transactions').insert({
          wallet_address: sessionWallet.address.toLowerCase(),
          type: 'refund',
          label: `Refund — ${prediction.title.slice(0, 50)}${prediction.title.length > 50 ? '...' : ''}`,
          amount: refundAmt,
          tx_hash: txHash,
        }).then(() => {})
      }
    } catch (e) {
      showFailed(e)
    } finally {
      setRefundPending(false)
    }
  }

  // ─── SUPABASE helpers ────────────────────────────────────────────────────────
  async function insertBetToSupabase(txHash, betAmtNum) {
    const wallet = sessionWallet?.address?.toLowerCase()
    if (!wallet) return
    try {
      await supabase.from('bets').insert({
        prediction_id: prediction.id,
        wallet_address: wallet,
        side: betSide,
        amount: betAmtNum,
        result: 'pending',
        payout: 0,
        tx_hash: txHash,
      })

      const { data: existing } = await supabase
        .from('leaderboard')
        .select('total_volume, total_calls')
        .eq('wallet_address', wallet)
        .single()

      if (existing) {
        await supabase.from('leaderboard').update({
          total_volume: (existing.total_volume || 0) + betAmtNum,
          total_calls:  (existing.total_calls  || 0) + 1,
          updated_at:   new Date().toISOString(),
        }).eq('wallet_address', wallet)
      } else {
        await supabase.from('leaderboard').insert({
          wallet_address: wallet,
          name: null, pfp_url: null,
          total_calls: 1, wins: 0, losses: 0,
          win_rate: 0, total_pnl: 0, total_volume: betAmtNum,
        })
      }

      const poolField = betSide === 'YES' ? 'yes_pool' : 'no_pool'
      const poolCurrent = betSide === 'YES' ? yesPoolNum : noPoolNum
      await supabase.from('predictions_display').update({
        [poolField]: poolCurrent + betAmtNum,
      }).eq('id', prediction.id)
    } catch (err) {
      console.error('Supabase bet insert:', err)
    }
  }

  async function updateWinInSupabase() {
    const wallet = sessionWallet?.address?.toLowerCase()
    if (!wallet || !userAmount || !claimableAmount) return
    const payout  = parseFloat(formatUnits(claimableAmount, 18))
    const betAmt  = parseFloat(formatUnits(userAmount, 18))
    try {
      // Check if bet was already marked 'won' by admin's declare (which also credited leaderboard)
      const { data: existingBet } = await supabase.from('bets')
        .select('result').eq('prediction_id', prediction.id).eq('wallet_address', wallet).single()
      const alreadyCredited = existingBet?.result === 'won'

      // Always update payout on the bet record
      await supabase.from('bets').update({ result: 'won', payout })
        .eq('prediction_id', prediction.id).eq('wallet_address', wallet)

      // Only update leaderboard wins/pnl if NOT already credited by admin declare
      if (!alreadyCredited) {
        const { data: row } = await supabase.from('leaderboard')
          .select('wins, total_pnl, win_rate, total_calls, losses').eq('wallet_address', wallet).single()
        if (row) {
          const wins    = (row.wins || 0) + 1
          const losses  = row.losses || 0
          const winRate = (wins + losses) > 0 ? parseFloat(((wins / (wins + losses)) * 100).toFixed(2)) : 0
          await supabase.from('leaderboard').update({
            wins,
            total_pnl:  parseFloat(((row.total_pnl || 0) + (payout - betAmt)).toFixed(8)),
            win_rate:   winRate,
            updated_at: new Date().toISOString(),
          }).eq('wallet_address', wallet)
        }
      }
    } catch (e) { console.error(e) }
  }


  const anyPending = betPending || claimPending || refundPending

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="glass-card glass-card-hover prediction-card">

      {/* ── Banner image ── */}
      <div style={{ position: 'relative', height: 192, overflow: 'hidden', borderRadius: '16px 16px 0 0', flexShrink: 0 }}>
        {prediction.banner_url ? (
          <img
            src={prediction.banner_url}
            alt={prediction.title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #141414 0%, #1C1C1C 60%, #141414 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56,
          }}>🔮</div>
        )}

        {/* Status badge */}
        <div style={{ position: 'absolute', top: 14, left: 14 }}>
          {isSettled ? (
            <span className={`status-pill ${prediction.status === 'yes_wins' ? 'status-settled-yes' : 'status-settled-no'}`}>
              {prediction.status === 'yes_wins' ? '✓ YES WINS' : '✗ NO WINS'}
            </span>
          ) : isRefunded ? (
            <span className="status-pill status-refunded">REFUNDED</span>
          ) : isLocked ? (
            <span className="status-pill status-locked">{isExpired ? '🔒 EXPIRED' : '🔒 LOCKED'}</span>
          ) : (
            <span className="status-pill status-live">
              <span className="live-dot" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* ── Card body ── */}
      <div style={{ padding: '22px 22px 26px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Title */}
        <div>
          <div className="prediction-card-title" style={{ marginBottom: 6 }}>{prediction.title}</div>
          {prediction.description && (
            <div className="prediction-card-desc">{prediction.description}</div>
          )}
        </div>

        {/* Pool + Timer row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          paddingBottom: 18, borderBottom: '1px solid rgba(223,219,207,0.08)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Pool Total
            </span>
            <span className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-primary)' }}>
              {totalPool} RLO
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'right' }}>
            {prediction.no_deadline ? (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Deadline</span>
                <span className="font-mono" style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 600 }}>Open ∞</span>
              </>
            ) : isSettled || isRefunded ? (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Settled</span>
                <span className="font-mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {prediction.settled_at ? new Date(prediction.settled_at).toLocaleDateString() : '—'}
                </span>
              </>
            ) : isLocked ? (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ends In</span>
                <span className="font-mono" style={{ fontSize: 15, color: 'var(--danger)', fontWeight: 700 }}>⏱ BETS CLOSED</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ends In</span>
                <span className="font-mono" style={{
                  fontSize: 16, fontWeight: 700,
                  color: countdownLevel === 'danger' ? 'var(--danger)' : countdownLevel === 'warning' ? 'var(--amber)' : 'var(--text-primary)',
                }}>
                  ⏱ {countdownText || '—'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Your bet indicator */}
        {hasBet && (
          <div style={{
            background: 'rgba(223,219,207,0.06)',
            border: '1px solid rgba(223,219,207,0.15)',
            borderRadius: 8, padding: '10px 16px', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>You called</span>
            <strong style={{ color: Number(userSide) === SIDE.YES ? 'var(--accent-primary)' : 'var(--danger)' }}>
              {Number(userSide) === SIDE.YES ? 'YES' : 'NO'}
            </strong>
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <span className="font-mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {userAmount ? parseFloat(formatUnits(userAmount, 18)).toFixed(1) : '?'} RLO
            </span>
          </div>
        )}

        {/* ── YES / NO section ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Odds row — always visible */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* YES odds */}
            <div style={{
              background: betSide === 'YES' ? 'rgba(223,219,207,0.1)' : 'rgba(20,20,20,0.8)',
              border: betSide === 'YES' ? '1.5px solid rgba(223,219,207,0.5)' : '1px solid rgba(223,219,207,0.2)',
              borderRadius: 12, padding: '16px 12px', textAlign: 'center',
              transition: 'all 0.2s ease',
            }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 6, letterSpacing: '0.1em' }}>YES</span>
              <span className="font-mono" style={{ display: 'block', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{yesPct}%</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {yesPoolNum.toFixed(1)} RLO
              </span>
            </div>
            {/* NO odds */}
            <div style={{
              background: betSide === 'NO' ? 'rgba(217,79,79,0.1)' : 'rgba(20,20,20,0.8)',
              border: betSide === 'NO' ? '1.5px solid rgba(217,79,79,0.6)' : '1px solid rgba(217,79,79,0.3)',
              borderRadius: 12, padding: '16px 12px', textAlign: 'center',
              transition: 'all 0.2s ease',
            }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--danger)', marginBottom: 6, letterSpacing: '0.1em' }}>NO</span>
              <span className="font-mono" style={{ display: 'block', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{noPct}%</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {noPoolNum.toFixed(1)} RLO
              </span>
            </div>
          </div>

          {/* Bet buttons row — shown when no side selected yet */}
          {!betSide && showBetButtons && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="btn-stitch-yes" style={{ padding: '12px', fontSize: 14 }} onClick={() => {
                if (!isConnected) { openConnectModal?.(); return }
                if (navState === 2) { setShowMintModal(true); return }
                setBetSide('YES')
              }}>Bet YES</button>
              <button className="btn-stitch-no" style={{ padding: '12px', fontSize: 14 }} onClick={() => {
                if (!isConnected) { openConnectModal?.(); return }
                if (navState === 2) { setShowMintModal(true); return }
                setBetSide('NO')
              }}>Bet NO</button>
            </div>
          )}

          {/* Amount input — full width below both columns when a side is picked */}
          {betSide && (
            <div style={{
              background: 'rgba(20,20,20,0.8)',
              border: `1.5px solid ${betSide === 'YES' ? 'rgba(223,219,207,0.3)' : 'rgba(217,79,79,0.4)'}`,
              borderRadius: 12, padding: '16px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: betSide === 'YES' ? 'var(--accent-primary)' : 'var(--danger)', letterSpacing: '0.05em' }}>
                Calling {betSide} — enter amount
              </div>
              <input
                type="number" className="bet-input-field" autoFocus
                placeholder="Amount in RLO (min 10)" min="10" step="1"
                value={betAmount}
                onChange={e => { setBetAmount(e.target.value); setBetError('') }}
                style={{ width: '100%' }}
              />
              {betError && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{betError}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <button
                  className={betSide === 'YES' ? 'btn btn-primary' : 'btn btn-danger'}
                  onClick={handlePlaceBet} disabled={anyPending}
                  style={{ fontWeight: 700 }}
                >
                  {betPending ? 'Confirming…' : `Confirm ${betSide}`}
                </button>
                <button className="btn btn-ghost" disabled={anyPending}
                  onClick={() => { setBetSide(null); setBetAmount(''); setBetError('') }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Settled / Refunded banner */}
        {(isSettled || isRefunded) && (
          <div style={{
            marginTop: 4, padding: '18px 20px',
            background: winnerSide === 'YES' ? 'rgba(223,219,207,0.05)' :
                        winnerSide === 'NO'  ? 'rgba(217,79,79,0.05)' : 'rgba(191,169,106,0.05)',
            border: `1px solid ${
              winnerSide === 'YES' ? 'rgba(223,219,207,0.2)' :
              winnerSide === 'NO'  ? 'rgba(217,79,79,0.3)' : 'rgba(191,169,106,0.3)'
            }`,
            borderRadius: 14, textAlign: 'center',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                color: winnerSide === 'YES' ? 'var(--accent-primary)' :
                       winnerSide === 'NO'  ? 'var(--danger)' : 'var(--amber)',
                marginBottom: 6,
              }}>
                {winnerSide === 'YES' ? '🏆 YES SIDE WINS' :
                 winnerSide === 'NO'  ? '✗ NO SIDE WINS' : '↩ MARKET REFUNDED'}
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {isRefunded ? 'Head over to your profile to claim your refund.' : 'Head over to your profile to claim your winnings.'}
              </span>
            </div>
            <Link to="/profile" style={{ textDecoration: 'none' }}>
              <button className="btn btn-sm" style={{
                width: '100%',
                background: 'rgba(223,219,207,0.08)',
                color: 'var(--accent-primary)',
                border: '1px solid rgba(223,219,207,0.2)',
                fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12,
              }}>
                Go to Profile →
              </button>
            </Link>
          </div>
        )}

        {/* Claim winnings */}
        {canClaim && (
          <button
            className="btn btn-primary-pulse" style={{ width: '100%' }}
            onClick={handleClaim} disabled={anyPending}
          >
            {claimPending ? 'Claiming…' : `🏆 Claim ${claimableAmount ? parseFloat(formatUnits(claimableAmount, 18)).toFixed(1) : '?'} RLO`}
          </button>
        )}

        {/* Claim refund */}
        {canRefund && (
          <button
            className="btn btn-ghost" style={{ width: '100%', borderColor: 'var(--amber)', color: 'var(--amber)' }}
            onClick={handleRefund} disabled={anyPending}
          >
            {refundPending ? 'Claiming…' : '↩ Claim Refund'}
          </button>
        )}
      </div>
    </div>
  )
}
