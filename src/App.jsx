import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useProfile } from './context/ProfileContext'
import { useDataCache } from './context/DataPrefetchContext'
import { isAdmin } from './config/contracts'
import LandingPage from './pages/LandingPage'
import CallsPage from './pages/CallsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import FaucetPage from './pages/FaucetPage'
import MintProfileModal from './components/MintProfileModal'
import AppLoader from './components/AppLoader'
import ParticleBackground from './components/ParticleBackground'

function AdminGuard({ children }) {
  const { address } = useAccount()
  if (!isAdmin(address)) return <Navigate to="/calls" replace />
  return children
}

export default function App() {
  const { showMintModal, appInitialized } = useProfile()
  const { warmCache } = useDataCache()

  // Once the app finishes its critical boot, silently warm the data cache
  // during browser idle time — so every page navigation after this is instant.
  useEffect(() => {
    if (appInitialized) warmCache()
  }, [appInitialized])

  return (
    <>
      {/* Global floating particles — fixed position, survives all navigation */}
      <ParticleBackground />

      {/* Navbar sweep glow — fixed at navbar bottom, never remounts so animation flows continuously */}
      <div className="navbar-sweep-glow" />

      {/* Branded loading screen — covers page until wagmi + contract + supabase all ready */}
      <AppLoader done={appInitialized} />

      {/* Undismissable profile mint modal — only after full initialization */}
      {appInitialized && showMintModal && <MintProfileModal />}

      <Routes>
        <Route path="/"            element={<LandingPage />} />
        <Route path="/calls"       element={<CallsPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/profile"     element={<ProfilePage />} />
        <Route path="/faucet"      element={<FaucetPage />} />
        <Route path="/admin"       element={
          <AdminGuard><AdminPage /></AdminGuard>
        } />
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
