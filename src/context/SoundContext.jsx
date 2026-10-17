import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const SoundContext = createContext(null)

const CACHE_NAME = 'rialo-audio-cache-v2'

const AUDIO_MANIFEST = {
  click: '/audio/click.mp3',
  bgMusic: '/audio/flying-relaxing-sleep-music-for.mp3',
  claimSounds: [
    '/audio/whatsapp-claim-1.mp3',
    '/audio/whatsapp-claim-2.mp3',
    '/audio/whatsapp-claim-3.mp3',
    '/audio/whatsapp-claim-4.mp3',
  ],
}

/**
 * Smart Audio Cache:
 * Downloads and persists audio assets in browser Cache Storage.
 * Creates local Blob URLs for zero-latency, 100% offline-ready playback.
 */
async function getCachedAudioUrl(url) {
  if (typeof window === 'undefined') return url
  try {
    if ('caches' in window) {
      const cache = await caches.open(CACHE_NAME)
      let res = await cache.match(url)
      if (!res) {
        const netRes = await fetch(url)
        if (netRes.ok) {
          await cache.put(url, netRes.clone())
          res = netRes
        }
      }
      if (res && res.ok) {
        const blob = await res.blob()
        return URL.createObjectURL(blob)
      }
    }
  } catch (e) {
    console.debug('Audio cache fallback to direct URL:', e)
  }
  return url
}

export function SoundProvider({ children }) {
  // Sound is ON by default when user visits, preserved across sessions in localStorage
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('rialo_sound_enabled')
      return saved !== 'false'
    } catch {
      return true
    }
  })

  const [isPlaying, setIsPlaying] = useState(false)

  // Audio references
  const bgAudioRef = useRef(null)
  const clickPoolRef = useRef([])
  const clickIndexRef = useRef(0)
  const claimPoolRef = useRef([])
  const lastClickTimeRef = useRef(0)

  // Initialize and preload all audio
  useEffect(() => {
    let isCancelled = false

    // 1. Initialise background music element
    const bgAudio = new Audio(AUDIO_MANIFEST.bgMusic)
    bgAudio.loop = true
    bgAudio.volume = 0.35 // Mellow, relaxing ambient background level
    bgAudio.preload = 'auto'
    bgAudioRef.current = bgAudio

    bgAudio.onplay = () => setIsPlaying(true)
    bgAudio.onpause = () => setIsPlaying(false)

    // 2. Initialise click pool (4 instances to prevent overlapping stutter)
    clickPoolRef.current = Array.from({ length: 4 }, () => {
      const a = new Audio(AUDIO_MANIFEST.click)
      a.volume = 0.5
      a.preload = 'auto'
      return a
    })

    // 3. Initialise claim sounds pool
    claimPoolRef.current = AUDIO_MANIFEST.claimSounds.map(url => {
      const a = new Audio(url)
      a.volume = 0.75
      a.preload = 'auto'
      return a
    })

    // 4. Smart Cache Warmup in Background:
    // Fetch into Cache Storage & upgrade elements to Blob URLs for instant cached playback
    const warmCacheAndUpgrade = async () => {
      try {
        // First upgrade click audio (lightest & highest priority)
        const clickBlobUrl = await getCachedAudioUrl(AUDIO_MANIFEST.click)
        if (!isCancelled && clickBlobUrl !== AUDIO_MANIFEST.click) {
          clickPoolRef.current.forEach(a => {
            const currentSrc = a.src
            a.src = clickBlobUrl
            a.load()
          })
        }

        // Next cache background music
        const bgBlobUrl = await getCachedAudioUrl(AUDIO_MANIFEST.bgMusic)
        if (!isCancelled && bgBlobUrl !== AUDIO_MANIFEST.bgMusic && bgAudioRef.current) {
          const wasPlaying = !bgAudioRef.current.paused
          const curTime = bgAudioRef.current.currentTime
          bgAudioRef.current.src = bgBlobUrl
          bgAudioRef.current.currentTime = curTime
          if (wasPlaying) {
            bgAudioRef.current.play().catch(() => {})
          }
        }

        // Cache the 4 claim sounds
        AUDIO_MANIFEST.claimSounds.forEach(async (url, idx) => {
          const claimBlobUrl = await getCachedAudioUrl(url)
          if (!isCancelled && claimPoolRef.current[idx] && claimBlobUrl !== url) {
            claimPoolRef.current[idx].src = claimBlobUrl
            claimPoolRef.current[idx].load()
          }
        })
      } catch (err) {
        console.debug('Background cache notice:', err)
      }
    }

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => warmCacheAndUpgrade(), { timeout: 2500 })
    } else {
      setTimeout(warmCacheAndUpgrade, 300)
    }

    // 5. Autoplay handling: attempt playback, attach gesture listener if blocked by browser policy
    const attemptAutoplay = async () => {
      if (!soundEnabled || !bgAudioRef.current) return

      try {
        await bgAudioRef.current.play()
        setIsPlaying(true)
      } catch {
        // Autoplay policy prevented immediate playback: start on first touch/click anywhere
        const onFirstInteraction = async () => {
          window.removeEventListener('pointerdown', onFirstInteraction)
          window.removeEventListener('keydown', onFirstInteraction)
          window.removeEventListener('touchstart', onFirstInteraction)

          const isSoundStillOn = localStorage.getItem('rialo_sound_enabled') !== 'false'
          if (isSoundStillOn && bgAudioRef.current) {
            try {
              await bgAudioRef.current.play()
              setIsPlaying(true)
            } catch {
              // Ignore
            }
          }
        }

        window.addEventListener('pointerdown', onFirstInteraction, { once: true })
        window.addEventListener('keydown', onFirstInteraction, { once: true })
        window.addEventListener('touchstart', onFirstInteraction, { once: true })
      }
    }

    attemptAutoplay()

    return () => {
      isCancelled = true
      if (bgAudioRef.current) {
        bgAudioRef.current.pause()
        bgAudioRef.current = null
      }
    }
  }, [])

  // Sync background audio when soundEnabled changes
  useEffect(() => {
    const bg = bgAudioRef.current
    if (!bg) return

    if (soundEnabled) {
      bg.play().then(() => setIsPlaying(true)).catch(() => {})
    } else {
      bg.pause()
      setIsPlaying(false)
    }
  }, [soundEnabled])

  // Toggle Sound ON / OFF
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev
      try {
        localStorage.setItem('rialo_sound_enabled', String(next))
      } catch {}

      const bg = bgAudioRef.current
      if (bg) {
        if (next) {
          bg.play().then(() => setIsPlaying(true)).catch(() => {})
        } else {
          bg.pause()
          setIsPlaying(false)
        }
      }
      return next
    })
  }, [])

  // Play button click sound
  const playClickSound = useCallback(() => {
    if (!soundEnabled) return

    const now = Date.now()
    if (now - lastClickTimeRef.current < 35) return // debounce rapid bubble events
    lastClickTimeRef.current = now

    const pool = clickPoolRef.current
    if (!pool || pool.length === 0) return

    const audio = pool[clickIndexRef.current]
    clickIndexRef.current = (clickIndexRef.current + 1) % pool.length

    try {
      audio.currentTime = 0
      audio.play().catch(() => {})
    } catch {}
  }, [soundEnabled])

  // Play random WhatsApp audio for claim winning
  const playClaimSound = useCallback(() => {
    if (!soundEnabled) return

    const pool = claimPoolRef.current
    if (!pool || pool.length === 0) return

    const randomIndex = Math.floor(Math.random() * pool.length)
    const audio = pool[randomIndex]

    try {
      audio.currentTime = 0
      audio.play().catch(() => {})
    } catch {}
  }, [soundEnabled])

  // Global document click listener for buttons & interactive elements
  useEffect(() => {
    const handleDocumentClick = (e) => {
      if (!soundEnabled) return

      const target = e.target.closest(
        'button, a, [role="button"], input[type="button"], input[type="submit"], .nav-link, .tab-btn, .clickable'
      )

      if (target) {
        if (target.dataset.noClickSound) return
        playClickSound()
      }
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => {
      document.removeEventListener('click', handleDocumentClick, true)
    }
  }, [soundEnabled, playClickSound])

  return (
    <SoundContext.Provider
      value={{
        soundEnabled,
        isPlaying,
        toggleSound,
        playClickSound,
        playClaimSound,
      }}
    >
      {children}
    </SoundContext.Provider>
  )
}

export function useSound() {
  const ctx = useContext(SoundContext)
  if (!ctx) {
    throw new Error('useSound must be used within a SoundProvider')
  }
  return ctx
}
