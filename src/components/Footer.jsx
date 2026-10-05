import React from 'react'

const FOOTER_LINKS = [
  { label: 'Rialo Calls', href: 'https://rialocalls.vercel.app' },
  { label: 'Rialo',    href: 'https://rialo.io/' },
  { label: 'Latch',    href: 'https://onlatch.com/' },
  { label: 'Rialo X',  href: 'https://x.com/RialoHQ' },
  { label: 'Discord',  href: 'https://discord.gg/RialoProtocol' },
]

export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid rgba(223,219,207,0.06)',
      padding: '24px 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px',
      backgroundColor: '#0A0A0A',
    }}>
      <span style={{ color: '#555555', fontSize: '13px', fontFamily: 'var(--font-mono, monospace)' }}>
        Built on Rialo
      </span>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {FOOTER_LINKS.map(({ label, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#555555',
              fontSize: '13px',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.target.style.color = '#DFDBCF'}
            onMouseLeave={e => e.target.style.color = '#555555'}
          >
            {label}
          </a>
        ))}
      </div>
    </footer>
  )
}
