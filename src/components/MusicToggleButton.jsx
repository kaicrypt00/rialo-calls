import { useSound } from '../context/SoundContext'

export default function MusicToggleButton({ className = '', style = {} }) {
  const { soundEnabled, isPlaying, toggleSound } = useSound()

  return (
    <button
      type="button"
      onClick={toggleSound}
      data-no-click-sound="true"
      className={`music-toggle-btn ${soundEnabled ? 'music-active' : 'music-muted'} ${className}`}
      title={soundEnabled ? 'Music & Sounds: ON (Click to Mute)' : 'Music & Sounds: OFF (Click to Enable)'}
      aria-label={soundEnabled ? 'Turn sound off' : 'Turn sound on'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 38,
        padding: '0 14px',
        borderRadius: 20,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.5,
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none',
        flexShrink: 0,
        ...style,
      }}
    >
      {/* Sound icon / Waveform */}
      {soundEnabled ? (
        <>
          {/* Animated 3-bar creamy equalizer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2.5,
              height: 14,
            }}
          >
            <span
              className="sound-bar sound-bar-1"
              style={{
                width: 2.5,
                background: '#DFDBCF',
                borderRadius: 2,
                height: isPlaying ? 12 : 6,
                animation: isPlaying ? 'sound-wave-1 1s ease-in-out infinite' : 'none',
              }}
            />
            <span
              className="sound-bar sound-bar-2"
              style={{
                width: 2.5,
                background: '#DFDBCF',
                borderRadius: 2,
                height: isPlaying ? 16 : 10,
                animation: isPlaying ? 'sound-wave-2 0.8s ease-in-out infinite 0.15s' : 'none',
              }}
            />
            <span
              className="sound-bar sound-bar-3"
              style={{
                width: 2.5,
                background: '#DFDBCF',
                borderRadius: 2,
                height: isPlaying ? 10 : 6,
                animation: isPlaying ? 'sound-wave-3 1.1s ease-in-out infinite 0.3s' : 'none',
              }}
            />
          </div>

          <span className="music-label" style={{ color: '#DFDBCF' }}>
            Sound ON
          </span>
        </>
      ) : (
        <>
          {/* Muted Speaker Icon */}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.6 }}
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>

          <span className="music-label" style={{ color: 'rgba(223,219,207,0.5)' }}>
            Sound OFF
          </span>
        </>
      )}
    </button>
  )
}
