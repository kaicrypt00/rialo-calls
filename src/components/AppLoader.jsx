import { useEffect, useState } from 'react'

const LABELS = ['Loading', 'Connecting wallet', 'Loading profile', 'Almost ready']

/**
 * AppLoader — shown while the app is initializing (wagmi + contract + supabase + profile).
 * Once `done` prop is true, plays a fade-out animation then unmounts.
 */
export default function AppLoader({ done }) {
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)
  const [labelIdx, setLabelIdx] = useState(0)

  // Cycle through status labels every 2.5s so user knows progress is happening
  useEffect(() => {
    if (done) return
    const t = setInterval(() => {
      setLabelIdx(i => Math.min(i + 1, LABELS.length - 1))
    }, 2500)
    return () => clearInterval(t)
  }, [done])

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => setFadeOut(true), 100)
      return () => clearTimeout(t)
    }
  }, [done])

  const handleTransitionEnd = () => {
    if (fadeOut) setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      onTransitionEnd={handleTransitionEnd}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A0A0A',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.5s ease',
        pointerEvents: fadeOut ? 'none' : 'all',
      }}
    >
      {/* Ambient glow — cream/gold tone */}
      <div style={{
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(223,219,207,0.06) 0%, transparent 70%)',
        animation: 'loader-pulse 3s ease-in-out infinite',
      }} />

      {/* Rialo symbol + spinner */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
        {/* Outer spinning ring */}
        <div style={{
          position: 'absolute',
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: 'rgba(223,219,207,0.7)',
          borderRightColor: 'rgba(223,219,207,0.2)',
          animation: 'spin 1.2s linear infinite',
        }} />
        {/* Inner spinning ring */}
        <div style={{
          position: 'absolute',
          width: 72,
          height: 72,
          borderRadius: '50%',
          border: '1.5px solid transparent',
          borderTopColor: 'rgba(223,219,207,0.3)',
          borderLeftColor: 'rgba(223,219,207,0.1)',
          animation: 'spin 1.8s linear infinite reverse',
        }} />
        {/* Rialo symbol */}
        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          overflow: 'hidden',
          background: '#141414',
          border: '1px solid rgba(223,219,207,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src="/src/assets/rialo-symbol.png"
            alt="Rialo"
            style={{ width: '80%', height: '80%', objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        </div>
      </div>

      {/* Wordmark */}
      <div style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 22,
        fontWeight: 700,
        color: '#DFDBCF',
        letterSpacing: '0.02em',
        marginBottom: 8,
      }}>
        Rialo Calls
      </div>

      {/* Loading label */}
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 13,
        color: 'rgba(223,219,207,0.4)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        animation: 'loader-blink 1.4s ease-in-out infinite',
      }}>
        LOADING — {LABELS[labelIdx].toUpperCase()}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes loader-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 0.4; }
        }
        @keyframes loader-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
