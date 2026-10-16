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

// Top-level error boundary — catches any unhandled runtime error so the app
// never goes completely blank. Shows a minimal recovery screen instead.
class RootErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { crashed: false } }
  static getDerivedStateFromError() { return { crashed: true } }
  render() {
    if (this.state.crashed) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0A0A0A',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <img src="/rialo-symbol.png" alt="Rialo" style={{ width: 48, opacity: 0.6 }} />
          <p style={{ color: 'rgba(223,219,207,0.5)', fontFamily: 'Inter, sans-serif', fontSize: 14, margin: 0 }}>
            Something went wrong. Please refresh the page.
          </p>
          <button
            onClick={() => { this.setState({ crashed: false }); window.location.href = '/' }}
            style={{
              background: '#DFDBCF', color: '#0A0A0A', border: 'none',
              padding: '10px 24px', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: 14,
            }}
          >
            Back to Home
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

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
    <RootErrorBoundary>
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
    </RootErrorBoundary>
  </React.StrictMode>
)
