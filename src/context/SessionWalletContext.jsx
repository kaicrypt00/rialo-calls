import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  formatEther,
  formatUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { RLO_ABI, CONTRACT_ADDRESSES } from '../config/contracts'

const SESSION_KEY_PREFIX = 'rc_sw_'
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

const SIGN_MESSAGE =
  'Rialo Calls: Activate your Rialo Calls Wallet.\n\n' +
  'This creates a secure session wallet for seamless betting without transaction popups.\n\n' +
  'This signature is deterministic and costs no gas. ' +
  'Your main wallet funds and assets cannot be accessed through this signature.'

const SessionWalletContext = createContext(null)

export function SessionWalletProvider({ children }) {
  const { address: mainAddress, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [sessionWallet, setSessionWallet] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  const [ethBalance, setEthBalance] = useState('0')
  const [rloBalance, setRloBalance] = useState('0')
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)
  const [recentTxs, setRecentTxs] = useState([])

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  })

  // On mount or wallet change: restore session wallet from localStorage
  useEffect(() => {
    if (!isConnected || !mainAddress) {
      setSessionWallet(null)
      setEthBalance('0')
      setRloBalance('0')
      return
    }
    const stored = localStorage.getItem(SESSION_KEY_PREFIX + mainAddress.toLowerCase())
    if (stored) {
      try {
        const account = privateKeyToAccount(stored)
        const client = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) })
        setSessionWallet({ client, address: account.address, account })
        // Tell ProfileContext the session address immediately
        window.dispatchEvent(new CustomEvent('rialo:session-wallet-ready', { detail: { address: account.address } }))
      } catch {
        localStorage.removeItem(SESSION_KEY_PREFIX + mainAddress.toLowerCase())
      }
    }
  }, [mainAddress, isConnected])

  // Load balances whenever session wallet changes
  useEffect(() => {
    if (sessionWallet) loadBalances()
    else { setEthBalance('0'); setRloBalance('0') }
  }, [sessionWallet?.address])

  const loadBalances = useCallback(async () => {
    if (!sessionWallet) return
    setIsLoadingBalances(true)
    try {
      const [eth, rlo] = await Promise.all([
        publicClient.getBalance({ address: sessionWallet.address }),
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.RLO_TOKEN,
          abi: RLO_ABI,
          functionName: 'balanceOf',
          args: [sessionWallet.address],
        }),
      ])
      setEthBalance(parseFloat(formatEther(eth)).toFixed(4))
      setRloBalance(parseFloat(formatUnits(rlo, 18)).toFixed(2))
    } catch (e) {
      console.error('Balance load failed:', e)
    } finally {
      setIsLoadingBalances(false)
    }
  }, [sessionWallet])

  const createSessionWallet = useCallback(async () => {
    if (!mainAddress) throw new Error('Connect your main wallet first')
    setIsCreating(true)
    try {
      const signature = await signMessageAsync({ message: SIGN_MESSAGE })
      const privateKey = keccak256(signature)
      const account = privateKeyToAccount(privateKey)
      const client = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) })
      localStorage.setItem(SESSION_KEY_PREFIX + mainAddress.toLowerCase(), privateKey)
      const wallet = { client, address: account.address, account }
      setSessionWallet(wallet)
      // Tell ProfileContext the session address immediately
      window.dispatchEvent(new CustomEvent('rialo:session-wallet-ready', { detail: { address: account.address } }))
      // After creating, ensure RLO approval for BettingPool
      setTimeout(() => ensureRLOApproval(wallet), 1000)
      return wallet
    } finally {
      setIsCreating(false)
    }
  }, [mainAddress, signMessageAsync])

  const ensureRLOApproval = useCallback(async (wallet) => {
    const sw = wallet || sessionWallet
    if (!sw) return
    try {
      const MAX = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
      const allowance = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.RLO_TOKEN,
        abi: RLO_ABI,
        functionName: 'allowance',
        args: [sw.address, CONTRACT_ADDRESSES.BETTING_POOL],
      })
      const threshold = BigInt(100) * BigInt(10 ** 18)
      if (allowance < threshold) {
        await sw.client.writeContract({
          address: CONTRACT_ADDRESSES.RLO_TOKEN,
          abi: RLO_ABI,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.BETTING_POOL, MAX],
        })
        console.log('✅ RLO approved for BettingPool')
      }
    } catch (e) {
      console.error('RLO approval failed:', e)
    }
  }, [sessionWallet])

  const clearSessionWallet = useCallback(() => {
    if (mainAddress) localStorage.removeItem(SESSION_KEY_PREFIX + mainAddress.toLowerCase())
    setSessionWallet(null)
    setEthBalance('0')
    setRloBalance('0')
  }, [mainAddress])

  return (
    <SessionWalletContext.Provider
      value={{
        sessionWallet,
        hasSessionWallet: !!sessionWallet,
        isCreating,
        createSessionWallet,
        clearSessionWallet,
        ensureRLOApproval,
        ethBalance,
        rloBalance,
        loadBalances,
        isLoadingBalances,
        recentTxs,
        setRecentTxs,
      }}
    >
      {children}
    </SessionWalletContext.Provider>
  )
}

export const useSessionWallet = () => {
  const ctx = useContext(SessionWalletContext)
  if (!ctx) throw new Error('useSessionWallet must be used within SessionWalletProvider')
  return ctx
}
