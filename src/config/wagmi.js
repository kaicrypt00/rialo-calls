import { createConfig, http } from 'wagmi'
import { sepolia } from 'viem/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [sepolia],
  connectors: [
    injected(),
    walletConnect({
      projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
    }),
  ],
  transports: {
    [sepolia.id]: http('https://ethereum-sepolia-rpc.publicnode.com'),
  },
})

// Keep wagmiConfig as alias for backward compat with any imports
export const wagmiConfig = config

export const EXPLORER_URL = 'https://sepolia.etherscan.io'
