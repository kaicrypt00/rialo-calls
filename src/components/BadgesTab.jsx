import { useState, useEffect, useCallback } from 'react'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { CONTRACT_ADDRESSES, ACHIEVEMENT_REGISTRY_ABI } from '../config/contracts'
import { useSessionWallet } from '../context/SessionWalletContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../config/supabase'
import { buildXShareUrl } from '../utils/format'


// ─── Badge metadata ─────────────────────────────────────────────────────────────
const BADGE_INFO = [
  { id: 0, name: 'Starter', icon: '🔮', threshold: 1,   message: 'Made your first call on Rialo Calls.',              color: '#AEAAA0', colorRgb: '174,170,160' },
  { id: 1, name: 'Caller',  icon: '📡', threshold: 10,  message: 'Placed 10 calls. You know the game.',              color: '#C4C0B5', colorRgb: '196,192,181' },
  { id: 2, name: 'Oracle',  icon: '🌀', threshold: 50,  message: 'Placed 50 calls. The community trusts your eye.',  color: '#D2CEC4', colorRgb: '210,206,196' },
  { id: 3, name: 'OG',      icon: '👑', threshold: 100, message: 'Placed 100 calls. A legend of Rialo Calls.',       color: '#DFDBCF', colorRgb: '223,219,207' },
]


const publicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
})

// ─── Main component ──────────────────────────────────────────────────────────────
export default function BadgesTab() {
  const { sessionWallet } = useSessionWallet()
  const { showPending, showConfirmed, showFailed } = useToast()

  const [badgeStatuses, setBadgeStatuses] = useState([false, false, false, false])
  const [betCount, setBetCount]           = useState(0)
  const [eligibleIds, setEligibleIds]     = useState([])
  const [mintingBadge, setMintingBadge]   = useState(null)
  const [loading, setLoading]             = useState(false)

  const loadData = useCallback(async (silent = false) => {
    if (!sessionWallet) return
    if (!silent) setLoading(true)
    try {
      const addr = sessionWallet.address
      // Use hasBadge individually — single bool return, no struct parsing issues
      const [s0, s1, s2, s3, count, eligible] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'hasBadge', args: [addr, 0] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'hasBadge', args: [addr, 1] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'hasBadge', args: [addr, 2] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'hasBadge', args: [addr, 3] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'getBetCount', args: [addr] }),
        publicClient.readContract({ address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY, abi: ACHIEVEMENT_REGISTRY_ABI, functionName: 'getEligibleBadges', args: [addr] }),
      ])

      const chainStatuses = [!!s0, !!s1, !!s2, !!s3]

      // Merge: optimistically-earned badges can never flip back to false
      setBadgeStatuses(prev => prev.map((wasTrue, i) => wasTrue || chainStatuses[i]))
      setBetCount(Number(count))
      setEligibleIds((eligible || []).map(n => Number(n)).filter(id => !chainStatuses[id]))

    } catch (e) {
      console.error('Badge load failed:', e)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [sessionWallet])

  useEffect(() => { loadData() }, [loadData])

  async function handleMintBadge(badgeId) {
    if (!sessionWallet || mintingBadge !== null) return
    setMintingBadge(badgeId)
    showPending(`Minting ${BADGE_INFO[badgeId].name} badge...`)
    try {
      const txHash = await sessionWallet.client.writeContract({
        address: CONTRACT_ADDRESSES.ACHIEVEMENT_REGISTRY,
        abi: ACHIEVEMENT_REGISTRY_ABI,
        functionName: 'mintBadge',
        args: [badgeId],
        value: BigInt('1000000000000000'),
      })
      showPending('Waiting for confirmation...')
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      // ── Optimistic update: show Earned immediately ──
      setBadgeStatuses(prev => prev.map((v, i) => i === badgeId ? true : v))
      setEligibleIds(prev => prev.filter(id => id !== badgeId))

      showConfirmed(txHash, `${BADGE_INFO[badgeId].name} badge minted!`)

      // Log to session wallet history
      supabase.from('wallet_transactions').insert({
        wallet_address: sessionWallet.address.toLowerCase(),
        type: 'claim',
        label: `Minted ${BADGE_INFO[badgeId].name} badge`,
        tx_hash: txHash,
      }).then(() => {})

      loadData(true) // silent background sync
    } catch (e) {
      showFailed(e)
    } finally {
      setMintingBadge(null)
    }
  }

  // ── No wallet ────────────────────────────────────────────────────────────────
  if (!sessionWallet) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔮</div>
        <div style={{ color: '#DFDBCF', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Session Wallet Required</div>
        <div style={{ color: '#555555', fontSize: 14 }}>Activate your Rialo Calls wallet to view and mint achievement badges.</div>
      </div>
    )
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '80px 20px', color: '#555555', fontSize: 13 }}>Loading badges from chain...</div>
  }

  const earned    = badgeStatuses.filter(Boolean).length
  const nextBadge = BADGE_INFO.find((b, i) => !badgeStatuses[i] && !eligibleIds.includes(b.id))

  return (
    <div>
      {/* ── Stats header ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        background: '#0A0A0A',
        border: '1px solid rgba(223,219,207,0.07)',
        borderRadius: 14, overflow: 'hidden', marginBottom: 28,
      }}>
        {[
          { label: 'Total Calls',    value: betCount,   mono: true  },
          { label: 'Badges Earned',  value: `${earned} / 4`, mono: true  },
          { label: 'Next Unlock',    value: nextBadge ? `${nextBadge.threshold - Math.min(betCount, nextBadge.threshold)} calls` : earned === 4 ? '🏆 All earned!' : 'Ready to mint!', mono: false },
        ].map((s, i) => (
          <div key={i} style={{
            background: '#0A0A0A', padding: '16px 20px',
            borderRight: i < 2 ? '1px solid rgba(223,219,207,0.06)' : 'none',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#555555', marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: s.mono ? 22 : 13, fontWeight: 700, color: '#DFDBCF', fontFamily: s.mono ? 'var(--font-mono)' : 'var(--font-body)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Eligible alert ───────────────────────────────────────────────────── */}
      {eligibleIds.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(223,219,207,0.04)',
          border: '1px solid rgba(223,219,207,0.15)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 24,
        }}>
          <span style={{ fontSize: 18 }}>🎉</span>
          <span style={{ color: '#DFDBCF', fontSize: 13, fontWeight: 600 }}>
            {eligibleIds.map(id => BADGE_INFO[id]?.name).join(' & ')} badge{eligibleIds.length > 1 ? 's' : ''} ready to mint!
          </span>
        </div>
      )}

      {/* ── Badge grid ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {BADGE_INFO.map((badge, idx) => {
          const minted   = badgeStatuses[idx]
          const eligible = !minted && eligibleIds.includes(badge.id)
          const progress = Math.min(betCount, badge.threshold)
          const pct      = Math.round((progress / badge.threshold) * 100)
          return (
            <BadgeCard
              key={badge.id}
              badge={badge}
              minted={minted}
              eligible={eligible}
              progress={progress}
              pct={pct}
              onMint={() => handleMintBadge(badge.id)}
              mintPending={mintingBadge === badge.id}
              address={sessionWallet.address}
            />
          )
        })}
      </div>

      {/* ── Keyframes ────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes badge-spin        { to { transform: rotate(360deg); } }
        @keyframes badge-float       { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes badge-edge-spin   { to { transform: rotate(360deg); } }
        @keyframes badge-eligible-glow {
          0%,100% { box-shadow: 0 0 0 1px rgba(223,219,207,0.1); }
          50%     { box-shadow: 0 0 18px rgba(223,219,207,0.12), 0 0 0 1px rgba(223,219,207,0.2); }
        }

        /* Spinning conic border for earned badges */
        .badge-earned-shell {
          position: relative;
          border-radius: 18px;
          overflow: hidden;
        }
        .badge-earned-shell::before {
          content: '';
          position: absolute;
          width: 200%; height: 200%;
          top: -50%; left: -50%;
          background: conic-gradient(
            transparent 0deg,
            transparent 145deg,
            rgba(223,219,207,0.9) 165deg,
            rgba(223,219,207,0.5)  180deg,
            rgba(223,219,207,0.9) 195deg,
            transparent 215deg,
            transparent 360deg
          );
          animation: badge-edge-spin 1.6s linear infinite;
          z-index: 0;
        }
      `}</style>
    </div>
  )
}

// ─── Badge Card ──────────────────────────────────────────────────────────────────
function BadgeCard({ badge, minted, eligible, progress, pct, onMint, mintPending, address }) {
  const [hovered, setHovered] = useState(false)

  function handleShareX() {
    const text = `Just earned the ${badge.name} badge on Rialo Calls 🔮\n${badge.message}\nhttps://rialocalls.vercel.app`
    window.open(buildXShareUrl(text), '_blank')
  }

  // ══ EARNED ══════════════════════════════════════════════════════════════════
  if (minted) {
    return (
      <div
        className="badge-earned-shell"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Card body on top of spinning border */}
        <div style={{
          position: 'relative', zIndex: 1,
          margin: '1.5px', borderRadius: '16px',
          background: `linear-gradient(155deg, rgba(${badge.colorRgb},0.12) 0%, #0B0B0B 45%, #0D0D0D 100%)`,
          padding: '24px 20px 20px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'transform 0.2s ease',
          cursor: 'default',
        }}>


          {/* Corner radiance */}
          <div style={{
            position: 'absolute', top: 0, right: 0, width: 110, height: 110,
            background: `radial-gradient(circle at top right, rgba(${badge.colorRgb},0.2), transparent 65%)`,
            pointerEvents: 'none',
          }} />

          {/* ✓ Earned pill */}
          <div style={{
            position: 'absolute', top: 12, right: 12,
            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 5,
            background: `rgba(${badge.colorRgb},0.18)`,
            border: `1px solid rgba(${badge.colorRgb},0.4)`,
            color: badge.color,
          }}>✓ Earned</div>

          {/* Icon — glowing + floating */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: `radial-gradient(circle, rgba(${badge.colorRgb},0.25) 0%, rgba(${badge.colorRgb},0.06) 70%)`,
            border: `1.5px solid rgba(${badge.colorRgb},0.45)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
            boxShadow: `0 0 28px rgba(${badge.colorRgb},0.35), 0 0 10px rgba(${badge.colorRgb},0.15)`,
            animation: 'badge-float 3s ease-in-out infinite',
          }}>{badge.icon}</div>

          {/* Name */}
          <div style={{ fontSize: 16, fontWeight: 800, color: badge.color, letterSpacing: '0.02em', textAlign: 'center' }}>
            {badge.name}
          </div>

          {/* Achievement message */}
          <div style={{ fontSize: 11, color: 'rgba(223,219,207,0.4)', textAlign: 'center', lineHeight: 1.5, padding: '0 4px' }}>
            {badge.message}
          </div>

          {/* Share on X */}
          <button
            onClick={handleShareX}
            style={{
              width: '100%', marginTop: 4,
              background: 'rgba(223,219,207,0.05)',
              border: '1px solid rgba(223,219,207,0.12)',
              borderRadius: 10, padding: '10px 0',
              color: 'rgba(223,219,207,0.45)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
              fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              letterSpacing: '0.02em',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(223,219,207,0.1)'; e.currentTarget.style.color = '#DFDBCF'; e.currentTarget.style.borderColor = 'rgba(223,219,207,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(223,219,207,0.05)'; e.currentTarget.style.color = 'rgba(223,219,207,0.45)'; e.currentTarget.style.borderColor = 'rgba(223,219,207,0.12)' }}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>𝕏</span> Share on X
          </button>

        </div>
      </div>
    )
  }

  // ══ ELIGIBLE / LOCKED ════════════════════════════════════════════════════════
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#0D0D0D',
        border: eligible
          ? '1px solid rgba(223,219,207,0.2)'
          : hovered ? '1px solid rgba(223,219,207,0.11)' : '1px solid rgba(223,219,207,0.05)',
        borderRadius: 16, padding: '24px 20px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        position: 'relative', overflow: 'hidden',
        transition: 'border-color 0.25s, transform 0.2s',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        animation: eligible ? 'badge-eligible-glow 2.2s ease-in-out infinite' : 'none',
      }}
    >
      {/* Status pill */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        padding: '3px 7px', borderRadius: 5,
        background: eligible ? 'rgba(223,219,207,0.08)' : 'rgba(255,255,255,0.02)',
        border: eligible ? '1px solid rgba(223,219,207,0.18)' : '1px solid rgba(255,255,255,0.04)',
        color: eligible ? '#DFDBCF' : '#2E2E2E',
      }}>{eligible ? 'Ready' : 'Locked'}</div>

      {/* Icon — dim/grey */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'rgba(255,255,255,0.02)',
        border: eligible ? '1px solid rgba(223,219,207,0.16)' : '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 30,
        filter: eligible ? 'saturate(0.35) opacity(0.65)' : 'grayscale(1) opacity(0.18)',
      }}>{badge.icon}</div>

      {/* Name */}
      <div style={{ fontSize: 15, fontWeight: 700, color: eligible ? '#DFDBCF' : '#3A3A3A', letterSpacing: '0.01em' }}>
        {badge.name}
      </div>
      <div style={{ fontSize: 11, color: '#2E2E2E', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {badge.threshold} bet{badge.threshold !== 1 ? 's' : ''}
      </div>

      {/* Mint button */}
      {eligible && (
        <button
          onClick={onMint} disabled={mintPending}
          style={{
            width: '100%',
            background: mintPending ? 'rgba(223,219,207,0.04)' : 'linear-gradient(135deg, rgba(223,219,207,0.12) 0%, rgba(223,219,207,0.06) 100%)',
            border: '1px solid rgba(223,219,207,0.2)', borderRadius: 9, padding: '10px 0',
            color: mintPending ? 'rgba(223,219,207,0.25)' : '#DFDBCF',
            fontSize: 12, fontWeight: 700, cursor: mintPending ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s', marginTop: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontFamily: 'var(--font-body)', letterSpacing: '0.03em',
          }}
          onMouseEnter={e => { if (!mintPending) { e.currentTarget.style.background = 'linear-gradient(135deg,rgba(223,219,207,0.18) 0%,rgba(223,219,207,0.1) 100%)'; e.currentTarget.style.boxShadow = '0 0 14px rgba(223,219,207,0.08)' }}}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg,rgba(223,219,207,0.12) 0%,rgba(223,219,207,0.06) 100%)'; e.currentTarget.style.boxShadow = 'none' }}
        >
          {mintPending
            ? <><span style={{ width:10, height:10, border:'1.5px solid rgba(223,219,207,0.2)', borderTopColor:'#DFDBCF', borderRadius:'50%', display:'inline-block', animation:'badge-spin 0.7s linear infinite' }} /> Minting...</>
            : <>🔮 Mint — 0.001 ETH</>
          }
        </button>
      )}

      {/* Progress bar */}
      {!eligible && (
        <div style={{ width: '100%', marginTop: 4 }}>
          <div style={{ height: 3, background: 'rgba(223,219,207,0.04)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              height: '100%', borderRadius: 3, width: `${pct}%`,
              background: pct > 50
                ? `linear-gradient(90deg, rgba(${badge.colorRgb},0.3), rgba(${badge.colorRgb},0.5))`
                : 'rgba(223,219,207,0.1)',
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#2E2E2E' }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{progress} / {badge.threshold}</span>
            <span>{pct}%</span>
          </div>
          <div style={{ fontSize: 11, color: '#2E2E2E', marginTop: 4, textAlign: 'center' }}>
            {badge.threshold - progress} more call{badge.threshold - progress !== 1 ? 's' : ''} needed
          </div>
        </div>
      )}
    </div>
  )
}
