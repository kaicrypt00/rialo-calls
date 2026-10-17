import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'
import { config } from './config/wagmi'
import { ToastProvider } from './context/ToastContext'
import { ProfileProvider } from './context/ProfileContext'
import { SessionWalletProvider } from './context/SessionWalletContext'
import { DataPrefetchProvider } from './context/DataPrefetchContext'
import { SoundProvider } from './context/SoundContext'
import App from './App'

// ─── Stale-chunk safety net ───────────────────────────────────────────────────
// After a Vercel redeploy, old hashed chunk URLs (e.g. /assets/index-ABC123.js)
// return 404. Any lazy import() will throw "Failed to fetch dynamically imported
// module". We catch that globally and do ONE hard reload to pick up the new build.
// A flag in sessionStorage prevents infinite reload loops.
window.addEventListener('vite:preloadError', () => {
  const reloadKey = 'rc_chunk_reload'
  if (!sessionStorage.getItem(reloadKey)) {
    sessionStorage.setItem(reloadKey, '1')
    window.location.reload()
  }
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

// Rialo Calls cream theme
const rialoTheme = darkTheme({
  accentColor: '#DFDBCF',
  accentColorForeground: '#0A0A0A',
  borderRadius: 'small',
  fontStack: 'system',
  overlayBlur: 'small',
})

// Override additional token colors
rialoTheme.colors.connectButtonBackground = '#141414'
rialoTheme.colors.connectButtonText = '#DFDBCF'
rialoTheme.colors.modalBackground = '#141414'
rialoTheme.colors.modalBorder = 'rgba(223,219,207,0.12)'
rialoTheme.colors.profileForeground = '#141414'
rialoTheme.colors.selectedOptionBorder = 'rgba(223,219,207,0.3)'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rialoTheme}>
          <BrowserRouter>
            <ToastProvider>
              <SessionWalletProvider>
                <DataPrefetchProvider>
                  <ProfileProvider>
                    <SoundProvider>
                      <App />
                    </SoundProvider>
                  </ProfileProvider>
                </DataPrefetchProvider>
              </SessionWalletProvider>
            </ToastProvider>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
