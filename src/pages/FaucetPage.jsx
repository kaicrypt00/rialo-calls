import React, { useState, useEffect, useRef } from 'react'
import { useSessionWallet } from '../context/SessionWalletContext'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { CONTRACT_ADDRESSES, RLO_ABI } from '../config/contracts'
import toast from 'react-hot-toast'
import Footer from '../components/Footer'
import Navbar from '../components/Navbar'

const publicClient = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') })

// Wait for a tx to be mined then return the receipt
async function waitForReceipt(hash) {
  return publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 60_000 })
}

const CLAIM_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

function formatCountdown(ms) {
  if (ms <= 0) return null
  const days  = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  if (days > 0) return `${days}d ${hours}h`
  const mins  = Math.floor((ms % 3600000) / 60000)
  return `${hours}h ${mins}m`
}

export default function FaucetPage() {
  const { sessionWallet, rloBalance, ethBalance, loadBalances } = useSessionWallet()
  const [lastClaimed, setLastClaimed] = useState(null)
  const [isClaiming, setIsClaiming] = useState(false)
  const [countdown, setCountdown]   = useState(null)
  const [claimed, setClaimed]       = useState(false) // success flash

  useEffect(() => {
    if (sessionWallet) checkLastClaimed()
  }, [sessionWallet])

  useEffect(() => {
    if (!lastClaimed) return
    const tick = () => {
      const next      = Number(lastClaimed) * 1000 + CLAIM_INTERVAL_MS
      const remaining = next - Date.now()
      setCountdown(remaining > 0 ? remaining : 0)
    }
    tick()
    const interval = setInterval(tick, 10000)
    return () => clearInterval(interval)
  }, [lastClaimed])

  async function checkLastClaimed() {
    try {
      const ts = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.RLO_TOKEN,
        abi: RLO_ABI,
        functionName: 'lastClaimed',
        args: [sessionWallet.address],
      })
      setLastClaimed(ts)
    } catch {}
  }

  async function handleClaim() {
    if (!sessionWallet) return toast.error('Activate your Rialo Calls Wallet first')
    setIsClaiming(true)
    try {
      // Send tx and get hash
      const hash = await sessionWallet.client.writeContract({
        address: CONTRACT_ADDRESSES.RLO_TOKEN,
        abi: RLO_ABI,
        functionName: 'claim',
      })
      // Wait for the block to be mined before reading state
      await waitForReceipt(hash)
      toast.success('1,000 RLO claimed!')
      setClaimed(true)
      setTimeout(() => setClaimed(false), 3000)
      // Now on-chain state is confirmed — update timer + balance immediately
      await checkLastClaimed()
      await loadBalances()
      // Second poll after 4s to catch any RPC propagation lag
      setTimeout(async () => {
        await checkLastClaimed()
        await loadBalances()
      }, 4000)
    } catch (e) {
      toast.error(e.shortMessage || 'Claim failed')
    } finally {
      setIsClaiming(false)
    }
  }

  const canClaim = sessionWallet && (!lastClaimed || countdown === 0)

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Top cream radial glow */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 400,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(223,219,207,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <Navbar />

      <main style={{
        flex: 1, position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '80px 24px 60px',
      }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>

        <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 6vw, 52px)',
            fontWeight: 800,
            color: '#DFDBCF',
            letterSpacing: -2,
            marginBottom: 12,
            background: 'linear-gradient(180deg, #fff 0%, #DFDBCF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Rialo Faucet
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 16, color: 'rgba(139,139,139,0.9)',
            maxWidth: 460, margin: '0 auto',
            lineHeight: 1.6,
          }}>
            Claim free ETH for gas and RLO tokens to start placing calls in the Arena.
          </p>
        </div>

        {/* ── Balance Cards (if wallet connected) ── */}
        {sessionWallet && (
          <div style={{
            display: 'flex', gap: 16, marginBottom: 48, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {[
              {
                label: 'ETH Balance',
                ticker: 'ETH',
                value: ethBalance,
                sub: 'Gas wallet · Sepolia',
                accentFrom: 'rgba(223,219,207,0.5)',
                accentTo: 'rgba(139,139,139,0.15)',
              },
              {
                label: 'RLO Balance',
                ticker: 'RLO',
                value: rloBalance,
                sub: 'Arena token · Claimable',
                accentFrom: 'rgba(201,168,76,0.55)',
                accentTo: 'rgba(191,169,106,0.1)',
              },
            ].map(({ label, ticker, value, sub, accentFrom, accentTo }) => (
              <div
                key={label}
                className="faucet-balance-card"
                style={{
                  position: 'relative',
                  background: 'rgba(20,20,20,0.75)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid rgba(223,219,207,0.1)',
                  borderRadius: 18,
                  padding: '22px 28px',
                  minWidth: 200,
                  overflow: 'hidden',
                  cursor: 'default',
                  transition: 'transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-3px)'
                  e.currentTarget.style.borderColor = 'rgba(223,219,207,0.22)'
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(223,219,207,0.07)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.borderColor = 'rgba(223,219,207,0.1)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Animated top-edge accent line */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: `linear-gradient(90deg, transparent 0%, ${accentFrom} 40%, ${accentTo} 80%, transparent 100%)`,
                  borderRadius: '18px 18px 0 0',
                  animation: 'faucet-bar-glow 3s ease-in-out infinite alternate',
                }} />

                {/* Subtle radial inner glow */}
                <div style={{
                  position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
                  width: 160, height: 80,
                  background: `radial-gradient(ellipse at 50% 0%, ${accentFrom.replace('0.5', '0.06').replace('0.55', '0.07')} 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />

                {/* Label */}
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(139,139,139,0.7)',
                  marginBottom: 10,
                }}>
                  {label}
                </div>

                {/* Value row */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 26,
                    fontWeight: 700,
                    color: '#DFDBCF',
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                  }}>
                    {value}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'rgba(223,219,207,0.4)',
                    letterSpacing: '0.08em',
                  }}>
                    {ticker}
                  </span>
                </div>

                {/* Sub-label */}
                <div style={{
                  marginTop: 8,
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  color: 'rgba(85,85,85,0.9)',
                  letterSpacing: '0.02em',
                }}>
                  {sub}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Cards ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 560 }}>

          {/* Step 1 — Sepolia ETH */}
          <div style={{
            background: 'rgba(20,20,20,0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(223,219,207,0.1)',
            borderRadius: 20,
            padding: '28px 28px',
            position: 'relative',
            overflow: 'hidden',
            transition: 'border-color 0.3s, box-shadow 0.3s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(223,219,207,0.25)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(223,219,207,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(223,219,207,0.1)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            {/* Step badge */}
            <div style={{
              position: 'absolute', top: 20, right: 24,
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              color: 'rgba(139,139,139,0.5)', letterSpacing: 2, textTransform: 'uppercase',
            }}>STEP 01</div>

            {/* Corner accent */}
            <div style={{
              position: 'absolute', top: 0, left: 0,
              width: 60, height: 3,
              background: 'linear-gradient(90deg, rgba(223,219,207,0.4), transparent)',
              borderRadius: '20px 0 0 0',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#DFDBCF', marginBottom: 3 }}>
                  Get Sepolia ETH
                </div>
                <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                  Required to pay network gas fees
                </div>
              </div>
            </div>

            <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 20 }}>
              You need Sepolia testnet ETH to execute transactions. Google's faucet provides 0.05 ETH for free — enough for hundreds of calls.
            </p>

            <a
              href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(223,219,207,0.1)',
                color: '#DFDBCF',
                border: '1px solid rgba(223,219,207,0.25)',
                padding: '11px 22px',
                borderRadius: 10,
                textDecoration: 'none',
                fontSize: 14, fontWeight: 600,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(223,219,207,0.18)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(223,219,207,0.1)'; e.currentTarget.style.transform = 'none' }}
            >
              Open Google Faucet ↗
            </a>
          </div>

          {/* Step 2 — Claim RLO */}
          <div style={{
            background: 'rgba(20,20,20,0.85)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${canClaim ? 'rgba(223,219,207,0.25)' : 'rgba(223,219,207,0.1)'}`,
            borderRadius: 20,
            padding: '28px 28px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: canClaim ? '0 0 40px rgba(223,219,207,0.06)' : 'none',
            transition: 'border-color 0.3s, box-shadow 0.3s',
          }}>
            {/* Step badge */}
            <div style={{
              position: 'absolute', top: 20, right: 24,
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              color: 'rgba(139,139,139,0.5)', letterSpacing: 2, textTransform: 'uppercase',
            }}>STEP 02</div>

            {/* Corner accent — glows when claimable */}
            <div style={{
              position: 'absolute', top: 0, left: 0,
              width: canClaim ? 120 : 60, height: 3,
              background: `linear-gradient(90deg, rgba(223,219,207,${canClaim ? 0.7 : 0.2}), transparent)`,
              borderRadius: '20px 0 0 0',
              transition: 'width 0.5s ease, opacity 0.5s ease',
            }} />

            {/* Shimmer when claimable */}
            {canClaim && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'linear-gradient(105deg, transparent 40%, rgba(223,219,207,0.03) 50%, transparent 60%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 3s infinite',
              }} />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#DFDBCF', marginBottom: 3 }}>
                  Claim 1,000 RLO
                </div>
                <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                  Free every 30 days · No limits
                </div>
              </div>
            </div>

            <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 24 }}>
              RLO is the token you use to place bets in the Arena. Claim 1,000 RLO every 30 days and start making calls.
            </p>

            {/* Action area */}
            {!sessionWallet ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(223,219,207,0.04)',
                border: '1px solid rgba(223,219,207,0.08)',
                borderRadius: 10, padding: '14px 18px',
                color: '#555', fontSize: 14,
              }}>
                <span style={{ fontSize: 18 }}>🔒</span>
                Activate your Rialo Calls Wallet from the navbar first
              </div>
            ) : canClaim ? (
              <button
                onClick={handleClaim}
                disabled={isClaiming}
                style={{
                  position: 'relative', overflow: 'hidden',
                  background: claimed ? 'rgba(223,219,207,0.2)' : '#DFDBCF',
                  color: '#0A0A0A',
                  border: 'none',
                  padding: '14px 32px',
                  borderRadius: 12,
                  fontSize: 15, fontWeight: 700,
                  cursor: isClaiming ? 'not-allowed' : 'pointer',
                  opacity: isClaiming ? 0.8 : 1,
                  width: '100%',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: 0.5,
                  boxShadow: claimed ? '0 0 30px rgba(223,219,207,0.3)' : '0 4px 20px rgba(223,219,207,0.15)',
                  transition: 'all 0.3s ease',
                  transform: 'none',
                  animation: !isClaiming ? 'faucet-btn-pulse 2.5s ease-in-out infinite' : 'none',
                }}
                onMouseEnter={e => { if (!isClaiming) e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(223,219,207,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(223,219,207,0.15)' }}
              >
                {/* Shimmer */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite',
                }} />
                <span style={{ position: 'relative', zIndex: 1 }}>
                  {claimed ? '✓ 1,000 RLO Claimed!' : isClaiming ? 'Claiming...' : 'Claim 1,000 RLO →'}
                </span>
              </button>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(223,219,207,0.04)',
                border: '1px solid rgba(223,219,207,0.08)',
                borderRadius: 12, padding: '16px 20px',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#444', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Next Claim</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#DFDBCF' }}>
                    {formatCountdown(countdown)}
                  </div>
                </div>
                <div style={{
                  width: 48, height: 48,
                  borderRadius: '50%',
                  border: '1.5px solid rgba(223,219,207,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                  flexShrink: 0,
                  animation: 'faucet-orbit 4s linear infinite',
                }}>⏳</div>
              </div>
            )}
          </div>

          {/* Low ETH warning */}
          {sessionWallet && parseFloat(ethBalance) < 0.005 && (
            <div style={{
              background: 'rgba(191,169,106,0.07)',
              border: '1px solid rgba(191,169,106,0.2)',
              borderRadius: 14,
              padding: '16px 20px',
              display: 'flex', alignItems: 'flex-start', gap: 12,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <div>
                <div style={{ color: '#BFA96A', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Low ETH Balance</div>
                <div style={{ color: 'rgba(191,169,106,0.7)', fontSize: 13, lineHeight: 1.5 }}>
                  Your Rialo Calls Wallet needs ETH for gas. Deposit Sepolia ETH to{' '}
                  <span
                    style={{ fontFamily: 'var(--font-mono)', cursor: 'pointer', textDecoration: 'underline', opacity: 0.9 }}
                    onClick={() => { navigator.clipboard.writeText(sessionWallet.address); toast.success('Address copied!') }}
                  >
                    {sessionWallet.address.slice(0, 10)}...
                  </span>
                </div>
              </div>
            </div>
          )}


        </div>
      </main>

      <Footer />

      <style>{`
        @keyframes faucet-pulse {
          0%, 100% { box-shadow: 0 0 40px rgba(223,219,207,0.12), 0 0 80px rgba(223,219,207,0.06); transform: translateY(0); }
          50%       { box-shadow: 0 0 60px rgba(223,219,207,0.2),  0 0 120px rgba(223,219,207,0.1); transform: translateY(-4px); }
        }
        @keyframes faucet-btn-pulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(223,219,207,0.15); }
          50%       { box-shadow: 0 4px 36px rgba(223,219,207,0.28); }
        }
        @keyframes faucet-orbit {
          from { transform: rotate(0deg)   translateX(28px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(28px) rotate(-360deg); }
        }
      `}</style>
    </div>
  )
}
