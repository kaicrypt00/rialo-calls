import { useNavigate, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { sepolia } from 'viem/chains'
import { useProfile } from '../context/ProfileContext'
import { useSessionWallet } from '../context/SessionWalletContext'
import { isAdmin } from '../config/contracts'
import RialoCallsWallet from './RialoCallsWallet'

const ADMIN_ONE = '0x2601Ab18C41Eb4cCbb31A6961Dc0BBb8a946E195'
const ADMIN_TWO = '0x18C8D508988DdEACF1ED081e6f371630FE5245B8'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { profile, navState, appInitialized, setShowMintModal } = useProfile()
  const { hasSessionWallet, createSessionWallet, isCreating } = useSessionWallet()

  const wrongNetwork = isConnected && chain?.id !== sepolia.id
  const showAdmin = address && (
    address.toLowerCase() === ADMIN_ONE.toLowerCase() ||
    address.toLowerCase() === ADMIN_TWO.toLowerCase()
  )

  const navLinks = [
    { label: 'Markets',     path: '/calls' },
    { label: 'Leaderboard', path: '/leaderboard' },
    { label: 'Profile',     path: '/profile' },
    { label: 'Faucet',      path: '/faucet' },
  ]

  // navState from ProfileContext:
  // 1 = not connected
  // 2 = connected, no profile  
  // 3 = connected, has profile
  // We layer session wallet on top:
  // connected but no session wallet → show "Activate Wallet" button
  // connected + session wallet → show RialoCallsWallet pill

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          {/* Logo */}
          <div className="navbar-logo" onClick={() => navigate('/')}>
            <div className="navbar-logo-icon">
              <img
                src="/rialo-symbol.png"
                alt="Rialo"
                style={{ width: '28px', height: '28px', objectFit: 'contain' }}
              />
            </div>
            <span className="navbar-logo-text">Rialo Calls</span>
          </div>

          {/* Center nav links */}
          <div className="navbar-center">
            {navLinks.map(link => (
              <button
                key={link.path}
                className={`nav-link ${location.pathname === link.path ? 'nav-link-active' : ''}`}
                onClick={() => navigate(link.path)}
              >
                {link.label}
              </button>
            ))}
            {showAdmin && (
              <button
                className={`nav-link ${location.pathname === '/admin' ? 'nav-link-active' : ''}`}
                onClick={() => navigate('/admin')}
                style={{ color: 'var(--gold)' }}
              >
                Admin
              </button>
            )}
          </div>

          {/* Right — wallet state */}
          <div className="navbar-right">
            {!appInitialized ? (
              <div style={{
                width: 120, height: 36,
                borderRadius: 8,
                background: 'rgba(223,219,207,0.06)',
                animation: 'skeleton-pulse 1.4s ease-in-out infinite',
              }} />
            ) : (
              <>
                {/* State 1: not connected */}
                {navState === 1 && (
                  <ConnectButton
                    label="Connect Wallet"
                    showBalance={false}
                    chainStatus="none"
                    accountStatus="address"
                  />
                )}

                {/* State 2 or 3: connected but no session wallet — show activate button */}
                {navState !== 1 && !hasSessionWallet && (
                  <button
                    onClick={createSessionWallet}
                    disabled={isCreating}
                    style={{
                      background: '#DFDBCF',
                      color: '#0A0A0A',
                      border: 'none',
                      padding: '9px 18px',
                      borderRadius: '8px',
                      cursor: isCreating ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      fontSize: '14px',
                      opacity: isCreating ? 0.7 : 1,
                    }}
                  >
                    {isCreating ? 'Activating...' : 'Activate Rialo Calls Wallet'}
                  </button>
                )}

                {/* Session wallet active — show RCW pill */}
                {hasSessionWallet && <RialoCallsWallet />}

                {/* State 2: session wallet active but no profile */}
                {navState === 2 && hasSessionWallet && (
                  <button className="btn btn-primary" onClick={() => setShowMintModal(true)}>
                    Set Up Profile
                  </button>
                )}

                {/* State 3: fully onboarded */}
                {navState === 3 && profile && hasSessionWallet && (
                  <div className="profile-pill" onClick={() => navigate('/profile')}>
                    <div className="profile-pill-avatar">
                      {profile.pfp_url
                        ? <img src={profile.pfp_url} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                        : profile.name?.[0]?.toUpperCase() || '?'
                      }
                    </div>
                    <span className="profile-pill-name">{profile.name}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Wrong network banner */}
      {wrongNetwork && (
        <div className="network-banner">
          <span>⚠ Switch to Ethereum Sepolia to continue</span>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--danger)', color: '#fff', padding: '4px 12px', marginLeft: 8 }}
            onClick={() => switchChain({ chainId: sepolia.id })}
          >
            Switch Network
          </button>
        </div>
      )}
    </>
  )
}
