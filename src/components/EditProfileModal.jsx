import { useState } from 'react'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { CONTRACT_ADDRESSES, PROFILE_REGISTRY_ABI } from '../config/contracts'
import { supabase } from '../config/supabase'
import { useToast } from '../context/ToastContext'
import { useProfile } from '../context/ProfileContext'
import { useSessionWallet } from '../context/SessionWalletContext'
import { imageToDataUrl } from '../utils/format'

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
})

export default function EditProfileModal({ onClose }) {
  const { profile, refreshProfile, updateProfileData } = useProfile()
  const { sessionWallet } = useSessionWallet()
  const { showPending, showConfirmed, showFailed } = useToast()

  // Use the wallet_address from the loaded profile row — this is the EXACT value
  // stored in Supabase. sessionWallet.address might not be available yet at render time.
  const walletAddr = profile?.wallet_address || sessionWallet?.address?.toLowerCase() || ''

  const [name, setName]             = useState(profile?.name || '')
  const [xUsername, setXUsername]   = useState(profile?.x_username || '')
  const [bio, setBio]               = useState(profile?.bio || '')
  const [pfpFile, setPfpFile]       = useState(null)
  const [pfpPreview, setPfpPreview] = useState(profile?.pfp_url || null)
  const [uploading, setUploading]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [errors, setErrors]         = useState({})

  function handlePfpChange(e) {
    const file = e.target.files[0]
    if (!file) return
    // 1.5 MB limit — catch it early before user clicks Save
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

  function validate() {
    const errs = {}
    if (!name.trim()) errs.name = 'Full name is required'
    if (name.trim().length > 50) errs.name = 'Max 50 characters'
    if (!xUsername.trim()) errs.xUsername = 'X username is required'
    if (xUsername.replace('@', '').length > 15) errs.xUsername = 'Max 15 characters'
    if (bio.length > 160) errs.bio = 'Max 160 characters'
    return errs
  }

  async function handleUpdate() {
    if (!sessionWallet) return showFailed(new Error('Session wallet not active'))
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})

    try {
      // 1. Convert image to base64 locally (no storage bucket needed)
      setUploading(true)
      let pfpUrl = profile?.pfp_url || ''
      if (pfpFile) {
        pfpUrl = await imageToDataUrl(pfpFile)
      }
      setUploading(false)
      setSaving(true)
      showPending('Saving profile...')

      // 2. Update Supabase FIRST — this is the source of truth for display.
      //    Do this before the on-chain call so it always succeeds regardless of RPC.
      console.log('[EditProfile] Updating Supabase for wallet:', walletAddr, 'pfp_url length:', pfpUrl.length)
      const { error: profileErr } = await supabase.from('profiles').update({
        name:       name.trim(),
        bio:        bio.trim(),
        pfp_url:    pfpUrl,
        x_username: xUsername.trim().replace('@', ''),
      }).eq('wallet_address', walletAddr)
      if (profileErr) throw new Error('Profile save failed: ' + profileErr.message)

      const { error: lbErr } = await supabase.from('leaderboard').update({
        name:    name.trim(),
        pfp_url: pfpUrl,
      }).eq('wallet_address', walletAddr)
      if (lbErr) console.warn('Leaderboard update error (non-critical):', lbErr.message)

      // 3. Clear localStorage cache so refreshProfile reads fresh data from Supabase
      try { localStorage.removeItem('rc_profile_' + walletAddr) } catch {}

      // 4. On-chain update — awaited for full transparency (user sees tx confirmed)
      try {
        const hash = await sessionWallet.client.writeContract({
          address: CONTRACT_ADDRESSES.PROFILE_REGISTRY,
          abi: PROFILE_REGISTRY_ABI,
          functionName: 'updateProfile',
          args: [name.trim(), bio.trim(), '', xUsername.trim().replace('@', '')],
          gas: 200000n,
        })
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 30_000 })
        showConfirmed(hash)
      } catch (chainErr) {
        // On-chain failed but Supabase already saved — profile shows correctly.
        console.warn('On-chain update skipped:', chainErr.message)
        showConfirmed(null, 'Profile saved ✓')
      }

      // 5. Update profile context directly (no re-fetch — avoids flicker/loop)
      updateProfileData({
        name:       name.trim(),
        bio:        bio.trim(),
        pfp_url:    pfpUrl,
        x_username: xUsername.trim().replace('@', ''),
      })

      // Close modal immediately — data is already updated
      onClose()
    } catch (err) {
      showFailed(err)
    } finally {
      setUploading(false)
      setSaving(false)
    }
  }

  const isBusy = uploading || saving

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Profile</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* PFP */}
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
              <label htmlFor="edit-pfp" style={{ cursor: 'pointer' }}>
                <span className="btn btn-ghost btn-sm">Change Photo</span>
                <input id="edit-pfp" type="file" accept="image/*" onChange={handlePfpChange} style={{ display: 'none' }} />
              </label>
              {errors.pfp && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.pfp}</div>}
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 4 }}>Max 1.5 MB</div>
            </div>
          </div>
        </div>

        {/* Name */}
        <div className="form-group">
          <label className="form-label">Full Name *</label>
          <input type="text" className="input" maxLength={50} value={name}
            onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {errors.name && <span className="form-error">{errors.name}</span>}
            <span className="char-counter">{name.length}/50</span>
          </div>
        </div>

        {/* X Username */}
        <div className="form-group">
          <label className="form-label">X Username * (without @)</label>
          <input type="text" className="input" maxLength={15} value={xUsername}
            onChange={e => { setXUsername(e.target.value.replace('@', '')); setErrors(p => ({ ...p, xUsername: '' })) }} />
          {errors.xUsername && <span className="form-error">{errors.xUsername}</span>}
        </div>

        {/* Bio */}
        <div className="form-group">
          <label className="form-label">Bio (optional)</label>
          <textarea className="input textarea" maxLength={160} value={bio}
            onChange={e => { setBio(e.target.value); setErrors(p => ({ ...p, bio: '' })) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {errors.bio && <span className="form-error">{errors.bio}</span>}
            <span className="char-counter">{bio.length}/160</span>
          </div>
        </div>

        <div style={{
          background: 'rgba(223,219,207,0.06)',
          border: '1px solid rgba(223,219,207,0.15)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text-secondary)',
        }}>
          ℹ Profile updates are signed by your Rialo Calls Wallet — gas only.
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleUpdate}
            disabled={isBusy}
          >
            {uploading ? 'Uploading photo...' : saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={isBusy}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
