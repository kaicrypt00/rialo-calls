import { useState, useEffect } from 'react'
import { createPublicClient, http, parseEther } from 'viem'
import { sepolia } from 'viem/chains'
import { CONTRACT_ADDRESSES, PROFILE_REGISTRY_ABI } from '../config/contracts'
import { supabase } from '../config/supabase'
import { useToast } from '../context/ToastContext'
import { useProfile } from '../context/ProfileContext'
import { useSessionWallet } from '../context/SessionWalletContext'
import { uploadToSupabase, imageToDataUrl } from '../utils/format'
import { EXPLORER_URL } from '../config/wagmi'

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
})

export default function MintProfileModal() {
  const { showPending, showConfirmed, showFailed } = useToast()
  const { refreshProfile, setShowMintModal } = useProfile()
  const { sessionWallet, hasSessionWallet, createSessionWallet, isCreating, ethBalance } = useSessionWallet()

  const [name, setName]           = useState('')
  const [xUsername, setXUsername] = useState('')
  const [bio, setBio]             = useState('')
  const [pfpFile, setPfpFile]     = useState(null)
  const [pfpPreview, setPfpPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors]       = useState({})
  const [pfpUrl, setPfpUrl]       = useState('')
  const [mintFee, setMintFee]     = useState(null)
  const [minting, setMinting]     = useState(false)
  const [txHash, setTxHash]       = useState(null)
  const [done, setDone]           = useState(false)

  // Close modal after successful mint — profile context refreshes automatically
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => {
      setShowMintModal(false)
    }, 2000)
    return () => clearTimeout(timer)
  }, [done])

  // Load the on-chain MINT_FEE
  useEffect(() => {
    publicClient.readContract({
      address: CONTRACT_ADDRESSES.PROFILE_REGISTRY,
      abi: PROFILE_REGISTRY_ABI,
      functionName: 'MINT_FEE',
    }).then(fee => setMintFee(fee)).catch(() => setMintFee(parseEther('0.001')))
  }, [])

  function handlePfpChange(e) {
    const file = e.target.files[0]
    if (!file) return
    // 1.5 MB limit — block immediately, before user clicks Mint
    if (file.size > 1.5 * 1024 * 1024) {
      setErrors(p => ({ ...p, pfp: `Image too large (${(file.size/1024/1024).toFixed(1)} MB). Max is 1.5 MB.` }))
      return
    }
    setErrors(p => ({ ...p, pfp: '' }))
    setPfpFile(file)
    setPfpPreview(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  // pfpDataUrl is passed directly — do NOT read pfpUrl state here (it may be stale)
  async function saveProfileToSupabase(pfpDataUrl = '') {
    if (!sessionWallet) return
    const wallet = sessionWallet.address.toLowerCase()
    try {
      await supabase.from('profiles').upsert({
        wallet_address: wallet,
        name: name.trim(),
        bio: bio.trim(),
        pfp_url: pfpDataUrl,
        x_username: xUsername.trim().replace('@', ''),
        minted_at: new Date().toISOString(),
      })
      // Create leaderboard entry
      await supabase.from('leaderboard').upsert({
        wallet_address: wallet,
        name: name.trim(),
        pfp_url: pfpDataUrl,
        total_calls: 0,
        wins: 0,
        losses: 0,
        win_rate: 0,
        total_volume: 0,
        total_pnl: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'wallet_address' })
      await refreshProfile()
    } catch (err) {
      console.error('Profile save error:', err)
    }
  }

  function validate() {
    const errs = {}
    if (!name.trim()) errs.name = 'Full name is required'
    if (name.trim().length > 50) errs.name = 'Max 50 characters'
    if (!xUsername.trim()) errs.xUsername = 'X username is required'
    if (xUsername.replace('@', '').length > 15) errs.xUsername = 'Max 15 characters'
    if (bio.length > 160) errs.bio = 'Max 160 characters'
    return errs
  }

  async function handleMint() {
    // Must have session wallet first
    if (!hasSessionWallet) {
      try { await createSessionWallet() } catch { return }
    }
    if (!sessionWallet) return

    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setUploading(true)

    let url = ''
    if (pfpFile) {
      try {
        // Resize + convert to base64 locally — no Supabase storage bucket needed
        url = await imageToDataUrl(pfpFile)
        setPfpUrl(url)
      } catch (uploadErr) {
        console.warn('PFP convert failed, minting without photo:', uploadErr)
        showFailed('Photo processing failed — minting without picture. Add one later in Edit Profile.')
      }
    }
    setUploading(false)
    setMinting(true)

    try {
      showPending('Minting your profile...')
      const fee = mintFee || parseEther('0.001')
      const hash = await sessionWallet.client.writeContract({
        address: CONTRACT_ADDRESSES.PROFILE_REGISTRY,
        abi: PROFILE_REGISTRY_ABI,
        functionName: 'mintProfile',
        // Pass '' for pfpHash on-chain — base64 would cost millions of gas.
        // The actual photo is stored in Supabase via saveProfileToSupabase below.
        args: [name.trim(), bio.trim(), '', xUsername.trim().replace('@', '')],
        value: fee,
        gas: 300000n,
      })

      await publicClient.waitForTransactionReceipt({ hash })
      setTxHash(hash)
      setDone(true)
      showConfirmed(hash)
      // Pass url directly — state setter setPfpUrl is async and would be stale here
      await saveProfileToSupabase(url)
    } catch (err) {
      // If profile already exists on-chain, refresh state and close gracefully
      const msg = err.shortMessage || err.message || ''
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
        await refreshProfile()
        setShowMintModal(false)
        return
      }
      showFailed(err)
    } finally {
      setMinting(false)
    }
  }

  // Format fee for display
  const feeDisplay = mintFee
    ? (Number(mintFee) / 1e18).toFixed(4) + ' ETH'
    : '...'

  const lowGas = parseFloat(ethBalance || '0') < 0.005

  // Success state
  if (done) {
    return (
      <div className="modal-overlay">
        <div className="modal-box" style={{ textAlign: 'center', gap: 16 }}>
          <div style={{ fontSize: 56 }}>🎉</div>
          <h2 className="modal-title">Profile Minted!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Welcome to Rialo Calls. Your profile is now live onchain.
          </p>
          {txHash && (
            <a
              href={`${EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="toast-link"
              style={{ fontSize: 14, display: 'inline-block' }}
            >
              View on Etherscan →
            </a>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Redirecting you to the app...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        {/* Header */}
        <div className="modal-header">
          <div>
            <div style={{ fontSize: 28, marginBottom: 6 }}>
              <img src="/rialo-symbol.png" alt="Rialo" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            </div>
            <h2 className="modal-title">Set Up Your Profile</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              Welcome to Rialo Calls. Set up your profile to start calling.
            </p>
          </div>
          <button
            className="modal-close"
            onClick={() => setShowMintModal(false)}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* No session wallet — must activate first */}
        {!hasSessionWallet && (
          <div style={{
            background: 'rgba(223,219,207,0.05)',
            border: '1px solid rgba(223,219,207,0.15)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 8,
            fontSize: 13, color: 'var(--text-secondary)',
          }}>
            You need to activate your <strong style={{ color: 'var(--accent-primary)' }}>Rialo Calls Wallet</strong> first. It takes one signature — no gas needed.
          </div>
        )}

        {/* PFP Upload */}
        <div className="form-group">
          <label className="form-label">Profile Picture</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {pfpPreview ? (
              <img src={pfpPreview} alt="Preview" className="file-upload-preview" />
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--bg-elevated)',
                border: '2px dashed var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, color: 'var(--text-tertiary)',
              }}>📷</div>
            )}
            <div>
              <label htmlFor="pfp-upload" style={{ cursor: 'pointer' }}>
                <span className="btn btn-ghost btn-sm">
                  {pfpPreview ? 'Change Photo' : 'Upload Photo'}
                </span>
                <input
                  id="pfp-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePfpChange}
                  style={{ display: 'none' }}
                />
              </label>
              {errors.pfp && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.pfp}</div>}
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 4 }}>Max 1.5 MB · JPG, PNG, WebP</div>
            </div>
          </div>
        </div>

        {/* Full Name */}
        <div className="form-group">
          <label className="form-label">Full Name *</label>
          <input
            type="text" className="input" placeholder="Your name"
            maxLength={50} value={name}
            onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {errors.name && <span className="form-error">{errors.name}</span>}
            <span className="char-counter">{name.length}/50</span>
          </div>
        </div>

        {/* X Username */}
        <div className="form-group">
          <label className="form-label">X Username * (without @)</label>
          <input
            type="text" className="input" placeholder="yourhandle"
            maxLength={15} value={xUsername}
            onChange={e => { setXUsername(e.target.value.replace('@', '')); setErrors(p => ({ ...p, xUsername: '' })) }}
          />
          {errors.xUsername && <span className="form-error">{errors.xUsername}</span>}
        </div>

        {/* Bio */}
        <div className="form-group">
          <label className="form-label">Bio (optional)</label>
          <textarea
            className="input textarea" placeholder="Tell the community who you are..."
            maxLength={160} value={bio}
            onChange={e => { setBio(e.target.value); setErrors(p => ({ ...p, bio: '' })) }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {errors.bio && <span className="form-error">{errors.bio}</span>}
            <span className="char-counter">{bio.length}/160</span>
          </div>
        </div>

        {/* Fee info */}
        <div style={{
          background: 'rgba(223,219,207,0.04)',
          border: '1px solid rgba(223,219,207,0.1)',
          borderRadius: 8, padding: '10px 14px',
          fontSize: 13, color: 'var(--text-secondary)',
        }}>
          Minting costs <strong style={{ color: 'var(--accent-primary)' }}>{feeDisplay}</strong> + gas from your Rialo Calls Wallet.
        </div>

        {/* Low gas warning */}
        {hasSessionWallet && lowGas && (
          <div style={{
            background: 'rgba(191,169,106,0.06)',
            border: '1px solid rgba(191,169,106,0.2)',
            borderRadius: 8, padding: '10px 14px',
            fontSize: 13, color: 'var(--amber)',
          }}>
            ⚠ Your Rialo Calls Wallet has low ETH ({ethBalance} ETH). Visit the Faucet to get Sepolia ETH before minting.
          </div>
        )}

        {/* Submit */}
        <button
          className="btn btn-primary-pulse btn-lg"
          style={{ width: '100%' }}
          onClick={handleMint}
          disabled={minting || uploading || isCreating}
        >
          {isCreating ? 'Activating wallet...' :
           uploading ? 'Uploading photo...' :
           minting ? 'Minting...' :
           !hasSessionWallet ? 'Activate Wallet & Mint Profile' :
           `Mint Profile — ${feeDisplay}`}
        </button>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
          This modal cannot be dismissed without minting
        </p>
      </div>
    </div>
  )
}
