import { useEffect, useRef } from 'react'

/**
 * ParticleBackground — 3-tier layered system
 *
 * Tier 1 — Tiny stars (55): very small, slow drift, subtle twinkle
 * Tier 2 — Medium orbs  (35): mid-size glowing, gentle float, visible glow
 * Tier 3 — Wisps        (15): large, very slow, barely visible — depth/atmosphere
 *
 * Total: 105 particles. Balanced: atmospheric without being distracting.
 */
export default function ParticleBackground() {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const particles = []

    function spawn({ minSize, maxSize, minOpacity, maxOpacity, minDur, maxDur, glowMult, count }) {
      for (let i = 0; i < count; i++) {
        const el        = document.createElement('div')
        const size      = Math.random() * (maxSize - minSize) + minSize
        const opacity   = Math.random() * (maxOpacity - minOpacity) + minOpacity
        const dur       = (Math.random() * (maxDur - minDur) + minDur) * 1000
        const delay     = Math.random() * -40 * 1000
        const x         = Math.random() * 100
        const y         = Math.random() * 100
        const drift     = (Math.random() * 80 - 40)          // ±40px horizontal
        const rise      = Math.random() * 300 + 100           // 100–400px up
        const glow      = size * glowMult

        el.style.cssText = `
          position: absolute;
          width: ${size}px;
          height: ${size}px;
          background: #DFDBCF;
          border-radius: 50%;
          left: ${x}%;
          top: ${y}%;
          opacity: 0;
          box-shadow: 0 0 ${glow}px ${glow * 0.5}px rgba(223,219,207,${opacity * 0.8});
          pointer-events: none;
          will-change: transform, opacity;
        `

        // Keyframes: fade in → hold → drift up → fade out
        el.animate(
          [
            { transform: 'translate(0, 0) scale(0.8)',                           opacity: 0 },
            { transform: 'translate(0, 0) scale(1)',                             opacity: opacity,       offset: 0.10 },
            { transform: `translate(${drift * 0.4}px, -${rise * 0.4}px) scale(1.05)`, opacity: opacity, offset: 0.45 },
            { transform: `translate(${drift * 0.7}px, -${rise * 0.7}px) scale(1)`,    opacity: opacity * 0.7, offset: 0.75 },
            { transform: `translate(${drift}px, -${rise}px) scale(0.8)`,         opacity: 0 },
          ],
          { duration: dur, delay, iterations: Infinity, easing: 'ease-in-out' }
        )

        container.appendChild(el)
        particles.push(el)
      }
    }

    // Tier 1 — Tiny twinkle stars: numerous, very subtle
    spawn({ minSize: 0.6, maxSize: 1.8, minOpacity: 0.08, maxOpacity: 0.28, minDur: 20, maxDur: 38, glowMult: 2,   count: 55 })

    // Tier 2 — Medium glowing orbs: visible glow, mid-speed float
    spawn({ minSize: 1.8, maxSize: 3.5, minOpacity: 0.18, maxOpacity: 0.45, minDur: 14, maxDur: 26, glowMult: 3.5, count: 35 })

    // Tier 3 — Soft wisps: large, barely visible, super slow — creates depth
    spawn({ minSize: 3.5, maxSize: 6.0, minOpacity: 0.04, maxOpacity: 0.12, minDur: 30, maxDur: 55, glowMult: 5,   count: 15 })

    return () => particles.forEach(p => p.remove())
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    />
  )
}
