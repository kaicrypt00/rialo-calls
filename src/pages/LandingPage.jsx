import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { supabase } from '../config/supabase'

export default function LandingPage() {
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const [stats, setStats] = useState({ activeCalls: 0, totalCallers: 0 })

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const [callsRes, callersRes] = await Promise.all([
        supabase.from('predictions_display').select('*', { count: 'exact', head: true }).in('status', ['open', 'locked']),
        supabase.from('leaderboard').select('*', { count: 'exact', head: true }),
      ])
      setStats({
        activeCalls: callsRes.count ?? 0,
        totalCallers: callersRes.count ?? 0,
      })
    } catch (e) {
      // silent
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 20%, rgba(223,219,207,0.04) 0%, transparent 60%), #0A0A0A',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <nav style={{
        position: 'fixed',
        top: 0,
        width: '100%',
        zIndex: 100,
        height: 64,
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(223,219,207,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}>
            <img src="/rialo-symbol.png" alt="Rialo Calls" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18, fontWeight: 700,
            color: 'var(--accent-primary)',
            letterSpacing: -0.5,
          }}>Rialo Calls</span>
        </div>
        <ConnectButton label="Connect Wallet" showBalance={false} chainStatus="none" />
      </nav>



      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 24px',
        paddingTop: 100,
        paddingBottom: 60,
        gap: 0,
        position: 'relative',
        zIndex: 2,
      }}>
        {/* Main heading — gradient clip */}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(52px, 10vw, 96px)',
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: -2,
          marginBottom: 20,
          background: 'linear-gradient(180deg, #fff 0%, #DFDBCF 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Rialo Calls
        </h1>

        {/* Subheading */}
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(18px, 3vw, 28px)',
          fontWeight: 600,
          color: 'rgba(223,219,207,0.75)',
          marginBottom: 20,
          letterSpacing: 0.5,
        }}>
          Where the Community Calls What Happens Next
        </h2>

        {/* Description */}
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 16,
          color: 'rgba(139,139,139,0.85)',
          maxWidth: 560,
          lineHeight: 1.6,
          marginBottom: 40,
        }}>
          Rialo Calls is a community prediction platform. Stake your claim, forecast
          outcomes, and earn rewards in the ultimate digital arena.
        </p>

        {/* CTA button */}
        <button
          className="landing-cta-btn"
          onClick={() => navigate('/calls')}
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: '#DFDBCF',
            color: '#0A0A0A',
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            padding: '18px 48px',
            borderRadius: 12,
            border: '1px solid rgba(223,219,207,0.4)',
            cursor: 'pointer',
            textTransform: 'uppercase',
            animation: 'pulse-shadow 2s infinite',
            transition: 'transform 0.3s ease',
            marginBottom: 64,
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {/* Shimmer overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0) 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 2.5s infinite',
            pointerEvents: 'none',
          }} />
          <span style={{ position: 'relative', zIndex: 1 }}>Enter the Arena</span>
        </button>

        {/* Live Stats Row */}
        <div
          className="glass-card landing-stats-card"
          style={{
            display: 'flex',
            gap: 0,
            padding: '32px 48px',
            borderRadius: 24,
            maxWidth: 560,
            width: '100%',
            border: '1px solid rgba(223,219,207,0.2)',
            background: 'rgba(28,28,28,0.8)',
            backdropFilter: 'blur(20px)',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.5s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-8px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          {/* Hover gradient */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(223,219,207,0.08), transparent, rgba(223,219,207,0.08))',
            pointerEvents: 'none',
          }} />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 700,
              color: 'var(--accent-primary)',
              letterSpacing: -1,
            }}>
              {stats.activeCalls || '—'}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(139,139,139,0.8)',
              textTransform: 'uppercase',
              letterSpacing: 3,
            }}>
              Active Calls
            </span>
          </div>

          {/* Vertical divider */}
          <div className="landing-stats-divider" style={{
            width: 1,
            background: 'linear-gradient(180deg, transparent, rgba(223,219,207,0.3), transparent)',
            alignSelf: 'stretch',
            margin: '0 24px',
          }} />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 700,
              color: 'var(--accent-primary)',
              letterSpacing: -1,
            }}>
              {stats.totalCallers || '—'}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(139,139,139,0.8)',
              textTransform: 'uppercase',
              letterSpacing: 3,
            }}>
              Total Callers
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
