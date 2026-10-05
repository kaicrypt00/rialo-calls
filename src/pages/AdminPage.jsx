import { useEffect, useState, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { createPublicClient, http, parseEther } from 'viem'
import { sepolia } from 'viem/chains'
import { CONTRACT_ADDRESSES, BETTING_POOL_ABI, POLL_REGISTRY_ADDRESS, POLL_REGISTRY_ABI } from '../config/contracts'
import { supabase } from '../config/supabase'
import { useToast } from '../context/ToastContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { uploadToSupabase, formatRitualNum } from '../utils/format'

// Dedicated public client for PollRegistry reads
const pollPublicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
})

// Year 2099 unix timestamp for no-deadline predictions
const YEAR_2099_TS = 4070908800

export default function AdminPage() {
  const { address } = useAccount()
  const [adminTab, setAdminTab] = useState('predictions')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% -20%, rgba(223,219,207,0.03) 0%, transparent 50%), #0A0A0A',
    }}>
      <Navbar />

      <main style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '100px 24px 80px',
      }}>
        {/* Header */}
        <header style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 700,
            color: 'var(--accent-primary)',
            marginBottom: 8,
          }}>
            Arena Operations
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            Command center for prediction market deployment and settlement.
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
            Admin: {address}
          </p>
        </header>

        {/* Top-level Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: 4,
          background: 'rgba(20,20,20,0.85)',
          padding: 4,
          borderRadius: 10,
          border: '1px solid rgba(223,219,207,0.08)',
          width: 'fit-content',
          marginBottom: 28,
        }}>
          {[
            { id: 'predictions', label: '📊 Predictions', },
            { id: 'polls',       label: '🗳 Poll Management', },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setAdminTab(tab.id)}
              style={{
                background: adminTab === tab.id ? 'rgba(223,219,207,0.1)' : 'transparent',
                color: adminTab === tab.id ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                border: 'none',
                padding: '8px 20px',
                borderRadius: 7,
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Predictions Tab */}
        {adminTab === 'predictions' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 16,
          }}
          className="admin-grid"
          >
            {/* Left Column: Templates + Create Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <AdminGlassCard title="Templates" icon="📁">
                <TemplatesInlineSection />
              </AdminGlassCard>

              <AdminGlassCard title="Create Prediction" icon="➕">
                <CreatePredictionSection />
              </AdminGlassCard>
            </div>

            {/* Right Column: Manage Predictions */}
            <AdminGlassCard title="Manage Predictions" icon="📊">
              <ManagePredictionsSection />
            </AdminGlassCard>
          </div>
        )}

        {/* Polls Tab */}
        {adminTab === 'polls' && (
          <AdminGlassCard title="Poll Management" icon="🗳">
            <AdminPollsTab />
          </AdminGlassCard>
        )}
      </main>
      <Footer />
    </div>
  )
}

function AdminGlassCard({ title, icon, children }) {
  return (
    <div style={{
      background: 'rgba(20,20,20,0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(223,219,207,0.08)',
      borderRadius: 16,
      padding: 24,
      transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = 'rgba(223,219,207,0.2)'
      e.currentTarget.style.boxShadow = '0 8px 32px rgba(223,219,207,0.04)'
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = 'rgba(223,219,207,0.08)'
      e.currentTarget.style.boxShadow = 'none'
    }}
    >
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 18,
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ color: 'var(--accent-primary)' }}>{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  )
}



// ============================================================
// Section 1 — Create Prediction
// ============================================================
function CreatePredictionSection() {
  const { showPending, showConfirmed, showFailed } = useToast()

  const [title, setTitle]         = useState('')
  const [desc, setDesc]           = useState('')
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState(null)
  const [bannerUrl, setBannerUrl] = useState('')
  const [noDeadline, setNoDeadline] = useState(false)
  const [deadline, setDeadline]   = useState('')
  const [category, setCategory]   = useState('community_calls')
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview]     = useState(false)
  const [errors, setErrors]       = useState({})
  const [templates, setTemplates] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)

  const publicClient = usePublicClient()
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { isSuccess, isError, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash })
  const [published, setPublished] = useState(false)

  useEffect(() => { fetchTemplates() }, [])

  useEffect(() => {
    if (writeError) showFailed(writeError)
  }, [writeError])

  async function fetchTemplates() {
    const { data } = await supabase.from('templates').select('*').order('created_at', { ascending: false })
    setTemplates(data || [])
  }

  if (isSuccess && txHash && !published) {
    setPublished(true)
    showConfirmed(txHash)
    // Insert into predictions_display after tx confirms — must include on-chain ID
    ;(async () => {
      try {
        // Wait for chain to index the new prediction
        await new Promise(r => setTimeout(r, 3000))

        // Read the new prediction ID from contract (totalPredictions = latest ID)
        const newId = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.BETTING_POOL,
          abi: BETTING_POOL_ABI,
          functionName: 'totalPredictions',
        })

        // deadline: NOT NULL in schema — use far-future ISO for no_deadline
        const YEAR_2099_ISO = '2099-01-01T00:00:00.000Z'
        const { error: sbErr } = await supabase.from('predictions_display').insert({
          id: Number(newId),   // on-chain prediction ID — required, not auto-generated
          title: title.trim(),
          description: desc.trim(),
          banner_url: bannerUrl || '',
          deadline: noDeadline ? YEAR_2099_ISO : new Date(deadline).toISOString(),
          no_deadline: noDeadline,
          status: 'open',
          yes_pool: 0,
          no_pool: 0,
          category: category || 'community_calls',
        })
        if (sbErr) console.error('Supabase insert error:', sbErr.message)
        resetForm()
      } catch (e) {
        console.error('Supabase insert error:', e)
      }
    })()
  }

  if (isError) showFailed(receiptError)

  function resetForm() {
    setTitle(''); setDesc(''); setBannerFile(null); setBannerPreview(null)
    setBannerUrl(''); setDeadline(''); setNoDeadline(false); setErrors({})
    setCategory('community_calls'); setPublished(false)
  }

  async function handleBannerChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setErrors(p => ({ ...p, banner: 'Max 5MB' })); return }
    setBannerFile(file)
    // M1 fix: revoke previous object URL to prevent memory leak
    setBannerPreview(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  function validate() {
    const errs = {}
    if (!title.trim()) errs.title = 'Title is required'
    if (title.trim().length > 120) errs.title = 'Max 120 characters'
    if (!noDeadline) {
      if (!deadline) errs.deadline = 'Set a deadline or choose No Deadline'
      else {
        const dl = new Date(deadline).getTime()
        if (dl < Date.now() + 10 * 60 * 1000) errs.deadline = 'Deadline must be at least 10 minutes in the future'
      }
    }
    return errs
  }

  async function handlePublish() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setUploading(true)

    try {
      let url = bannerUrl
      if (bannerFile) {
        const path = `banner_${Date.now()}`
        url = await uploadToSupabase(supabase, 'banners', bannerFile, path)
        setBannerUrl(url)
      }

      // Sepolia uses UNIX SECONDS for block timestamps (standard EVM behaviour)
      let chainNowSec
      try {
        const latestBlock = await publicClient.getBlock({ blockTag: 'latest' })
        chainNowSec = BigInt(latestBlock.timestamp) // already in seconds on Sepolia
      } catch {
        chainNowSec = BigInt(Math.floor(Date.now() / 1000))
      }

      const SEC_30_DAYS  = BigInt(30 * 24 * 3600)
      const SEC_75_YEARS = BigInt(75 * 365 * 24 * 3600)

      // no-deadline = 75 chain-years ahead; real deadline = 30 chain-days (admin locks manually)
      const contractDeadline = noDeadline ? chainNowSec + SEC_75_YEARS : chainNowSec + SEC_30_DAYS

      showPending('Publishing prediction...')
      writeContract({
        address: CONTRACT_ADDRESSES.BETTING_POOL,
        abi: BETTING_POOL_ABI,
        functionName: 'createPrediction',
        args: [title.trim(), desc.trim(), url, contractDeadline],
      })
    } catch (err) {
      showFailed(err)
    } finally {
      setUploading(false)
    }
  }

  async function handleSaveTemplate() {
    if (!title.trim()) return
    await supabase.from('templates').insert({ title: title.trim(), description: desc.trim() })
    fetchTemplates()
  }

  function handleLoadTemplate(tmpl) {
    setTitle(tmpl.title)
    setDesc(tmpl.description)
    setShowTemplates(false)
  }

  // Minimum datetime for input (now + 10 mins)
  const minDatetime = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16)

  return (
    <div className="admin-section">
      <div className="admin-section-title">📝 Create New Prediction</div>

      {/* Load template dropdown */}
      {templates.length > 0 && (
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowTemplates(s => !s)}>
            Load Template ▾
          </button>
          {showTemplates && (
            <div style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 10, marginTop: 6, overflow: 'hidden',
            }}>
              {templates.map(t => (
                <div
                  key={t.id}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}
                  onClick={() => handleLoadTemplate(t)}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(45,212,164,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  {t.title}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Title */}
      <div className="form-group">
        <label className="form-label">Title *</label>
        <input
          type="text" className="input" maxLength={120}
          placeholder="Will Rialo Calls break 10K community members?"
          value={title}
          onChange={e => { setTitle(e.target.value); setErrors(p => ({ ...p, title: '' })) }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {errors.title && <span className="form-error">{errors.title}</span>}
          <span className="char-counter">{title.length}/120</span>
        </div>
      </div>

      {/* Description */}
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea
          className="input textarea" rows={3}
          placeholder="Context about this prediction..."
          value={desc}
          onChange={e => setDesc(e.target.value)}
          style={{ minHeight: 80 }}
        />
      </div>

      {/* Banner image */}
      <div className="form-group">
        <label className="form-label">Banner Image (JPG/PNG/WebP, max 5MB)</label>
        <div className="file-upload-area">
          {bannerPreview ? (
            <div style={{ position: 'relative' }}>
              <img src={bannerPreview} alt="Banner" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8 }} />
              <button
                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '2px 6px' }}
                onClick={() => { setBannerFile(null); setBannerPreview(null); setBannerUrl('') }}
              >✕</button>
            </div>
          ) : (
            <label htmlFor="banner-upload" style={{ cursor: 'pointer', display: 'block' }}>
              <div style={{ fontSize: 32, color: 'var(--text-tertiary)' }}>🖼</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Click to upload banner image</div>
              <input id="banner-upload" type="file" accept="image/jpeg,image/png,image/webp"
                onChange={handleBannerChange} style={{ display: 'none' }} />
            </label>
          )}
        </div>
        {errors.banner && <span className="form-error">{errors.banner}</span>}
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
          Best: <strong style={{ color: 'var(--text-secondary)' }}>2:1 ratio</strong> (e.g. 1280×640px) · JPG/PNG/WebP · Max 5MB
        </div>
      </div>

      {/* Deadline toggle */}
      <div className="form-group">
        <label className="form-label">Deadline</label>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button
            className={`btn btn-sm ${!noDeadline ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setNoDeadline(false)}
          >
            Set Deadline
          </button>
          <button
            className={`btn btn-sm ${noDeadline ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setNoDeadline(true)}
          >
            No Deadline
          </button>
        </div>

        {!noDeadline && (
          <input
            type="datetime-local"
            className="input"
            min={minDatetime}
            value={deadline}
            onChange={e => { setDeadline(e.target.value); setErrors(p => ({ ...p, deadline: '' })) }}
          />
        )}

        {noDeadline && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 0' }}>
            ℹ No deadline — betting stays open until you manually lock it via Lock Betting.
          </div>
        )}

        {errors.deadline && <span className="form-error">{errors.deadline}</span>}
      </div>

      {/* Category */}
      <div className="form-group">
        <label className="form-label">Category</label>
        <select
          className="input"
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ cursor: 'pointer' }}
        >
          <option value="community_calls">Community Call</option>
          <option value="official_calls">Official Call</option>
        </select>
      </div>


      {/* Preview */}
      {preview && (
        <div style={{ border: '1px solid rgba(45,212,164,0.2)', borderRadius: 12, overflow: 'hidden', padding: 0 }}>
          <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Preview — this is how the card will look</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>~card size</span>
          </div>
          {/* Constrain to real card width so preview is accurate */}
          <div style={{ maxWidth: 400, margin: '12px auto' }}>
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              {bannerPreview && (
                <div style={{ width: '100%', height: 192, overflow: 'hidden', borderRadius: '16px 16px 0 0', position: 'relative' }}>
                  <img src={bannerPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ padding: '16px 16px 20px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
                  {title || 'Prediction title...'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{desc || 'Description...'}</div>
                {noDeadline && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>No deadline</div>}
                {!noDeadline && deadline && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--accent-primary)' }}>
                    Deadline: {new Date(deadline).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={handlePublish}
          disabled={isPending || uploading}
        >
          {uploading ? 'Uploading...' : isPending ? 'Publishing...' : '🚀 Publish Prediction'}
        </button>
        <button className="btn btn-ghost" onClick={() => setPreview(s => !s)}>
          {preview ? 'Hide Preview' : '👁 Preview'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleSaveTemplate} disabled={!title.trim()}>
          💾 Save Template
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Section 2 — Manage Predictions
// ============================================================
function ManagePredictionsSection() {
  const { showPending, showConfirmed, showFailed } = useToast()
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)

  // Active tx tracking
  const [activePredId, setActivePredId] = useState(null)
  const [activeAction, setActiveAction] = useState(null)
  const [activeWinnerSide, setActiveWinnerSide] = useState(null)

  // Modals
  const [extendModal, setExtendModal] = useState(null)
  const [lockModal, setLockModal]     = useState(null)
  const [declareModal, setDeclareModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isSuccess, isError, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash })

  // C3 fix: guard so handleTxSuccess only runs once per confirmed tx hash
  const handledTxRef = useRef(null)

  const [activeTab, setActiveTab] = useState('active')

  useEffect(() => { fetchPredictions() }, [activeTab])

  // Realtime subscription — auto-refreshes when admin publishes a new prediction
  useEffect(() => {
    const channel = supabase
      .channel('admin-predictions-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'predictions_display',
      }, () => {
        fetchPredictions()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const [forceRemoveId, setForceRemoveId] = useState(null)

  useEffect(() => {
    if (isSuccess && txHash && handledTxRef.current !== txHash) {
      handledTxRef.current = txHash
      showConfirmed(txHash)
      handleTxSuccess()
    }
    if (isError) {
      showFailed(receiptError)
      // If the error is 'prediction not found', offer force DB removal
      const msg = receiptError?.message || receiptError?.toString() || ''
      if (msg.toLowerCase().includes('prediction not found') && activePredId) {
        setForceRemoveId(activePredId)
      }
      setActivePredId(null); setActiveAction(null)
    }
  }, [isSuccess, isError])

  async function fetchPredictions() {
    setLoading(true)
    const statuses = activeTab === 'active' ? ['open', 'locked'] : ['yes_wins', 'no_wins']
    const { data } = await supabase
      .from('predictions_display')
      .select('*')
      .in('status', statuses)
      .order('created_at', { ascending: false })
    setPredictions(data || [])
    setLoading(false)
  }

  async function handleTxSuccess() {
    // Update Supabase after contract confirms
    if (activeAction === 'lock' && activePredId) {
      await supabase.from('predictions_display').update({ status: 'locked' }).eq('id', activePredId)
    }
    if (activeAction === 'unlock' && activePredId) {
      await supabase.from('predictions_display').update({ status: 'open' }).eq('id', activePredId)
    }
    if (activeAction === 'declare' && activePredId && activeWinnerSide) {
      const winner = activeWinnerSide
      await supabase.from('predictions_display').update({
        status: winner === 'YES' ? 'yes_wins' : 'no_wins',
        winner,
        settled_at: new Date().toISOString(),
      }).eq('id', activePredId)
      // Update bets results
      const losingSide = winner === 'YES' ? 'NO' : 'YES'
      await supabase.from('bets').update({ result: 'lost' })
        .eq('prediction_id', activePredId).eq('side', losingSide)
      await supabase.from('bets').update({ result: 'won' })
        .eq('prediction_id', activePredId).eq('side', winner)



      // Fetch all bets for this prediction to calculate pools and update leaderboard
      try {
        const [{ data: loserBets }, { data: winnerBets }] = await Promise.all([
          supabase.from('bets').select('wallet_address, amount')
            .eq('prediction_id', activePredId).eq('side', losingSide),
          supabase.from('bets').select('wallet_address, amount')
            .eq('prediction_id', activePredId).eq('side', winner),
        ])

        // Pool sizes calculated directly from bets — no extra DB query needed
        const winningPool = (winnerBets || []).reduce((s, b) => s + parseFloat(b.amount || 0), 0)
        const losingPool  = (loserBets  || []).reduce((s, b) => s + parseFloat(b.amount || 0), 0)

        // Update LOSERS
        for (const lb of (loserBets || [])) {
          const { data: row } = await supabase.from('leaderboard')
            .select('wins, losses, total_pnl').eq('wallet_address', lb.wallet_address).single()
          if (row) {
            const newLosses  = (row.losses || 0) + 1
            const newWins    = row.wins || 0
            const winRate    = (newWins + newLosses) > 0 ? (newWins / (newWins + newLosses)) * 100 : 0
            await supabase.from('leaderboard').update({
              losses:    newLosses,
              total_pnl: parseFloat(((row.total_pnl || 0) - parseFloat(lb.amount || 0)).toFixed(8)),
              win_rate:  parseFloat(winRate.toFixed(2)),
            }).eq('wallet_address', lb.wallet_address)
          }
        }

        // Update WINNERS
        for (const wb of (winnerBets || [])) {
          const betAmt = parseFloat(wb.amount || 0)
          const profit = winningPool > 0 ? (betAmt / winningPool) * losingPool : 0
          const { data: row } = await supabase.from('leaderboard')
            .select('wins, losses, total_pnl').eq('wallet_address', wb.wallet_address).single()
          if (row) {
            const newWins  = (row.wins || 0) + 1
            const newLosses = row.losses || 0
            const winRate  = (newWins + newLosses) > 0 ? (newWins / (newWins + newLosses)) * 100 : 0
            await supabase.from('leaderboard').update({
              wins:      newWins,
              total_pnl: parseFloat(((row.total_pnl || 0) + profit).toFixed(8)),
              win_rate:  parseFloat(winRate.toFixed(2)),
            }).eq('wallet_address', wb.wallet_address)
          }
        }
      } catch (err) {
        console.error('Leaderboard update after declare failed:', err)
      }
    }
    if (activeAction === 'delete' && activePredId) {
      const { data: pred } = await supabase.from('predictions_display').select('banner_url').eq('id', activePredId).single()
      if (pred?.banner_url) {
        const parts = pred.banner_url.split('/banners/')
        if (parts.length > 1) await supabase.storage.from('banners').remove([parts[1]])
      }
      await supabase.from('predictions_display').delete().eq('id', activePredId)
      await supabase.from('bets').delete().eq('prediction_id', activePredId)
    }
    if (activeAction === 'extend' && activePredId && extendModal) {
      await supabase.from('predictions_display').update({
        deadline: new Date(extendModal.newDeadline).toISOString()
      }).eq('id', activePredId)
    }

    setActivePredId(null); setActiveAction(null)
    setExtendModal(null); setLockModal(null); setDeclareModal(null); setDeleteModal(null)
    fetchPredictions()
  }

  function doLock(pred) {
    setActivePredId(pred.id); setActiveAction('lock')
    setLockModal(null)
    showPending('Locking betting...')
    writeContract({
      address: CONTRACT_ADDRESSES.BETTING_POOL,
      abi: BETTING_POOL_ABI,
      functionName: 'lockBetting',
      args: [BigInt(pred.id)],
      gas: 150000n,
    })
  }

  function doUnlock(pred) {
    setActivePredId(pred.id); setActiveAction('unlock')
    showPending('Unlocking betting...')
    writeContract({
      address: CONTRACT_ADDRESSES.BETTING_POOL,
      abi: BETTING_POOL_ABI,
      functionName: 'unlockBetting',
      args: [BigInt(pred.id)],
      gas: 150000n,
    })
  }

  function doDeclare(pred, side) {
    setActivePredId(pred.id); setActiveAction('declare')
    setActiveWinnerSide(side === 1 ? 'YES' : 'NO')
    setDeclareModal(null)
    showPending('Declaring winner...')
    // Sepolia BettingPool: no ETH fee required for declareWinner
    writeContract({
      address: CONTRACT_ADDRESSES.BETTING_POOL,
      abi: BETTING_POOL_ABI,
      functionName: 'declareWinner',
      args: [BigInt(pred.id), side],
      gas: 200000n,
    })
  }

  function doExtend(pred, newDeadline) {
    setActivePredId(pred.id); setActiveAction('extend')
    setExtendModal({ ...extendModal, newDeadline })
    showPending('Extending deadline...')
    // Sepolia uses Unix seconds for timestamps
    const deadlineSec = BigInt(Math.floor(new Date(newDeadline).getTime() / 1000))
    writeContract({
      address: CONTRACT_ADDRESSES.BETTING_POOL,
      abi: BETTING_POOL_ABI,
      functionName: 'extendDeadline',
      args: [BigInt(pred.id), deadlineSec],
      gas: 150000n,
    })
  }

  function doDelete(pred) {
    setActivePredId(pred.id); setActiveAction('delete')
    setDeleteModal(null)
    showPending('Deleting prediction...')
    writeContract({
      address: CONTRACT_ADDRESSES.BETTING_POOL,
      abi: BETTING_POOL_ABI,
      functionName: 'deletePrediction',
      args: [BigInt(pred.id)],
      gas: 150000n,
    })
  }

  const isBusy = isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header & Tab Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div className="admin-section-title" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--gold)', margin: 0 }}>
          {activeTab === 'active' ? '📋 Active Predictions' : '📜 Settled History'}
        </div>
        <div style={{
          display: 'flex', gap: 4, background: 'rgba(20,20,20,0.85)',
          padding: 4, borderRadius: 8, border: '1px solid var(--border-subtle)'
        }}>
          <button
            onClick={() => setActiveTab('active')}
            style={{
              background: activeTab === 'active' ? 'rgba(45,212,164,0.15)' : 'transparent',
              color: activeTab === 'active' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
              border: 'none', padding: '6px 16px', borderRadius: 6,
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s ease'
            }}
          >
            Active
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              background: activeTab === 'history' ? 'rgba(45,212,164,0.15)' : 'transparent',
              color: activeTab === 'history' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
              border: 'none', padding: '6px 16px', borderRadius: 6,
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s ease'
            }}
          >
            History
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
          ))}
        </div>
      ) : predictions.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-title">
            {activeTab === 'active' ? 'No active predictions' : 'No settled predictions in history'}
          </div>
          <div className="empty-state-subtitle">
            {activeTab === 'active' ? 'Create a new prediction in the Create tab.' : 'Settled predictions will appear here.'}
          </div>
        </div>
      ) : (
        predictions.map(pred => (
          <div key={pred.id} className="admin-prediction-row">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                  {pred.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>ID: <span className="font-mono">{pred.id}</span></span>
                  <span>Status: <strong style={{
                    color: pred.status === 'locked' ? 'var(--amber)' :
                           pred.status === 'yes_wins' || pred.status === 'no_wins' ? 'var(--accent-primary)' : 'var(--text-secondary)'
                  }}>
                    {pred.status.toUpperCase()}
                  </strong></span>
                  {pred.winner && (
                    <span>Winner: <strong style={{ color: pred.winner === 'YES' ? 'var(--accent-primary)' : 'var(--danger)' }}>{pred.winner}</strong></span>
                  )}
                  {pred.settled_at && (
                    <span>Settled: {new Date(pred.settled_at).toLocaleDateString()}</span>
                  )}
                  {!pred.no_deadline && pred.deadline && !pred.deadline?.startsWith('2099') && (
                    <span>Deadline: {new Date(pred.deadline).toLocaleString()}</span>
                  )}
                  {pred.no_deadline && <span style={{ color: 'var(--text-secondary)' }}>No Deadline ∞</span>}
                  <span className="font-mono">YES: {formatRitualNum(pred.yes_pool)} / NO: {formatRitualNum(pred.no_pool)} RLO</span>
                </div>
              </div>
              <span className={`status-pill ${
                pred.status === 'locked' ? 'status-locked' :
                pred.status === 'yes_wins' ? 'status-settled-yes' :
                pred.status === 'no_wins' ? 'status-settled-no' : 'status-live'
              }`} style={{ flexShrink: 0 }}>
                {pred.status === 'locked' ? 'LOCKED' :
                 pred.status === 'yes_wins' ? 'YES WINS' :
                 pred.status === 'no_wins' ? 'NO WINS' : 'LIVE'}
              </span>
            </div>

            <div className="admin-prediction-actions">
              {activeTab === 'history' ? (
                <button
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => setDeleteModal(pred)}
                  disabled={isBusy}
                >
                  🗑 Remove from History
                </button>
              ) : (
                <>
                  {/* Extend Deadline — only for open predictions with a real deadline */}
                  {!pred.no_deadline && pred.status !== 'locked' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExtendModal({ ...pred, newDeadline: '' })}
                      disabled={isBusy}
                    >
                      📅 Extend Deadline
                    </button>
                  )}

                  {/* Lock/Unlock Betting */}
                  {pred.status !== 'locked' ? (
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(191,169,106,0.1)', color: 'var(--amber)', border: '1px solid rgba(191,169,106,0.3)' }}
                      onClick={() => setLockModal(pred)}
                      disabled={isBusy}
                    >
                      🔒 Lock Betting
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(223,219,207,0.06)', color: 'var(--text-secondary)', border: '1px solid rgba(223,219,207,0.15)' }}
                      onClick={() => doUnlock(pred)}
                      disabled={isBusy}
                    >
                      🔓 Unlock Betting
                    </button>
                  )}

                  {/* Declare Winner */}
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setDeclareModal(pred)}
                    disabled={isBusy}
                  >
                    🏆 Declare Winner
                  </button>

                  {/* Delete */}
                  <button
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => setDeleteModal(pred)}
                    disabled={isBusy}
                  >
                    🗑 Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))
      )}

      {/* ---- Modals ---- */}

      {/* Extend Deadline Modal */}
      {extendModal && (
        <AdminModal title="Extend Deadline" onClose={() => setExtendModal(null)}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Max +24 hours from now. Can only be done once per prediction.
          </p>
          <div className="form-group">
            <label className="form-label">New Deadline</label>
            <input
              type="datetime-local"
              className="input"
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              max={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
              value={extendModal.newDeadline}
              onChange={e => setExtendModal(p => ({ ...p, newDeadline: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!extendModal.newDeadline || isBusy}
              onClick={() => doExtend(extendModal, extendModal.newDeadline)}
            >
              Extend Deadline
            </button>
            <button className="btn btn-ghost" onClick={() => setExtendModal(null)}>Cancel</button>
          </div>
        </AdminModal>
      )}

      {/* Lock Betting Modal */}
      {lockModal && (
        <AdminModal title="Lock Betting" onClose={() => setLockModal(null)}>
          <div style={{
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 8, padding: 14, fontSize: 14, color: 'var(--amber)', marginBottom: 16,
          }}>
            ⚠ Lock betting immediately? No one will be able to place new bets after this. This cannot be undone.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => doLock(lockModal)} disabled={isBusy}>
              Yes, Lock Now
            </button>
            <button className="btn btn-ghost" onClick={() => setLockModal(null)}>Cancel</button>
          </div>
        </AdminModal>
      )}

      {/* Declare Winner Modal */}
      {declareModal && (
        <AdminModal title={`Declare Winner — ${declareModal.title?.slice(0, 40)}`} onClose={() => setDeclareModal(null)}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Select the winning side. This triggers payouts for all winning bettors.
            This action is permanent.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-yes"
              style={{ flex: 1, padding: '14px 8px' }}
              onClick={() => doDeclare(declareModal, 1)}
              disabled={isBusy}
            >
              ✓ YES Wins
            </button>
            <button
              className="btn btn-no"
              style={{ flex: 1, padding: '14px 8px' }}
              onClick={() => doDeclare(declareModal, 2)}
              disabled={isBusy}
            >
              ✗ NO Wins
            </button>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setDeclareModal(null)}>
            Cancel
          </button>
        </AdminModal>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <AdminModal title="Delete Prediction" onClose={() => setDeleteModal(null)}>
          <div style={{
            background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.2)',
            borderRadius: 8, padding: 14, fontSize: 14, color: 'var(--danger)', marginBottom: 16,
          }}>
            ⚠ Are you sure? Removing this prediction will completely delete it, its bets, and its banner image from the database.
          </div>
          <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-danger" style={{ flex: 1 }}
                onClick={() => {
                  // C2 fix: Do NOT delete from Supabase here.
                  // handleTxSuccess() is the single source of truth for all DB changes.
                  // For settled predictions (yes_wins/no_wins), skip the blockchain call
                  // and let handleTxSuccess handle the Supabase-only cleanup.
                  if (deleteModal.status === 'yes_wins' || deleteModal.status === 'no_wins') {
                    // Settled predictions can't be deleted on-chain — DB-only removal
                    ;(async () => {
                      const targetId = deleteModal.id
                      const bannerUrl = deleteModal.banner_url
                      if (bannerUrl) {
                        const parts = bannerUrl.split('/banners/')
                        if (parts.length > 1) await supabase.storage.from('banners').remove([parts[1]])
                      }
                      await supabase.from('predictions_display').delete().eq('id', targetId)
                      await supabase.from('bets').delete().eq('prediction_id', targetId)
                      setDeleteModal(null)
                      fetchPredictions()
                    })()
                  } else {
                    // Active prediction: only fire the blockchain tx.
                    // handleTxSuccess will delete from Supabase after confirmation.
                    doDelete(deleteModal)
                    setDeleteModal(null)
                  }
                }}
                disabled={isBusy}
              >
                Yes, Permanently Delete
              </button>
              <button className="btn btn-ghost" onClick={() => setDeleteModal(null)}>Cancel</button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Force Remove modal — shown when contract reverts with 'prediction not found' */}
      {forceRemoveId && (
        <AdminModal title="On-Chain Prediction Not Found" onClose={() => setForceRemoveId(null)}>
          <div style={{
            background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.2)',
            borderRadius: 8, padding: 14, fontSize: 13, color: 'var(--danger)', marginBottom: 16,
          }}>
            The contract returned <strong>"prediction not found"</strong> for ID <code style={{ fontFamily: 'var(--font-mono)' }}>{forceRemoveId}</code>.
            <br /><br />
            This means the prediction was already deleted on-chain (possibly a duplicate that was cleaned up), but the Supabase record still exists.
            You can safely remove it from the database.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-danger"
              style={{ flex: 1 }}
              onClick={async () => {
                await supabase.from('predictions_display').update({ status: 'deleted' }).eq('id', forceRemoveId)
                await supabase.from('bets').update({ result: 'refunded' }).eq('prediction_id', forceRemoveId)
                setForceRemoveId(null)
                fetchPredictions()
              }}
            >
              Remove Orphaned Record from DB
            </button>
            <button className="btn btn-ghost" onClick={() => setForceRemoveId(null)}>Dismiss</button>
          </div>
        </AdminModal>
      )}
    </div>
  )
}

// ============================================================
// Section 3 — Templates
// ============================================================
function TemplatesSection() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchTemplates() }, [])

  async function fetchTemplates() {
    setLoading(true)
    const { data } = await supabase.from('templates').select('*').order('created_at', { ascending: false })
    setTemplates(data || [])
    setLoading(false)
  }

  async function handleDelete(id) {
    await supabase.from('templates').delete().eq('id', id)
    fetchTemplates()
  }

  return (
    <div className="admin-section">
      <div className="admin-section-title">💾 Saved Templates</div>
      {loading ? (
        <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
      ) : templates.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
          No templates saved yet. Save a template from the Create Prediction form.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map(t => (
            <div key={t.id} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 10, padding: '12px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                {t.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description}
                  </div>
                )}
              </div>
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={() => handleDelete(t.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// TemplatesInlineSection — alias used in the 2-column layout
function TemplatesInlineSection() {
  return <TemplatesSection />
}

// ============================================================
// Section 4 — Poll Management (Admin) — on-chain via PollRegistry
// ============================================================
function AdminPollsTab() {
  const { showConfirmed, showFailed } = useToast()
  const { writeContractAsync } = useWriteContract()
  const [polls, setPolls]       = useState([])
  const [history, setHistory]   = useState([])
  const [selected, setSelected] = useState(new Set())
  const [names, setNames]       = useState({})
  const [loading, setLoading]   = useState(true)
  const [closing, setClosing]   = useState(false)
  const [currentRound, setCurrentRound] = useState(1)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [pollsData, histData, round] = await Promise.all([
        pollPublicClient.readContract({ address: POLL_REGISTRY_ADDRESS, abi: POLL_REGISTRY_ABI, functionName: 'getActivePolls' }),
        pollPublicClient.readContract({ address: POLL_REGISTRY_ADDRESS, abi: POLL_REGISTRY_ABI, functionName: 'getHistory' }),
        pollPublicClient.readContract({ address: POLL_REGISTRY_ADDRESS, abi: POLL_REGISTRY_ABI, functionName: 'currentRound' }),
      ])
      const sorted = [...pollsData].sort((a, b) => Number(b.voteCount) - Number(a.voteCount))
      setPolls(sorted)
      setHistory([...histData].reverse())
      setCurrentRound(Number(round))

      // Fetch profile display names
      const addrs = [...new Set([
        ...sorted.map(p => p.submittedBy.toLowerCase()),
        ...histData.map(h => h.submittedBy.toLowerCase()),
      ])]
      if (addrs.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('wallet_address, name').in('wallet_address', addrs)
        if (profiles) {
          const map = {}
          profiles.forEach(p => { map[p.wallet_address.toLowerCase()] = p.name })
          setNames(map)
        }
      }
    } catch (e) {
      showFailed('Failed to load polls from chain')
    } finally {
      setLoading(false)
    }
  }

  function getName(addr) {
    return names[addr?.toLowerCase()] || (addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '?')
  }

  function toggleSelect(id) {
    const idStr = String(id)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idStr)) {
        next.delete(idStr)
      } else if (next.size < 3) {
        next.add(idStr)
      }
      return next
    })
  }

  async function handleDelete(pollId) {
    try {
      await writeContractAsync({
        address: POLL_REGISTRY_ADDRESS,
        abi: POLL_REGISTRY_ABI,
        functionName: 'deletePoll',
        args: [pollId],
      })
      setPolls(prev => prev.filter(p => String(p.id) !== String(pollId)))
      setSelected(prev => { const next = new Set(prev); next.delete(String(pollId)); return next })
      showConfirmed('Poll deleted on-chain')
    } catch (e) {
      showFailed(e)
    }
  }

  async function handleCloseRound() {
    if (selected.size !== 3) return
    const winnerIds = [...selected].map(id => BigInt(id))
    setClosing(true)
    try {
      await writeContractAsync({
        address: POLL_REGISTRY_ADDRESS,
        abi: POLL_REGISTRY_ABI,
        functionName: 'closeRound',
        args: [[winnerIds[0], winnerIds[1], winnerIds[2]]],
      })
      showConfirmed(`Round ${currentRound} closed. Winners saved on-chain.`)
      setSelected(new Set())
      await loadAll()
    } catch (e) {
      showFailed(e)
    } finally {
      setClosing(false)
    }
  }

  // Group history by round
  const rounds = history.reduce((acc, item) => {
    const r = String(item.round)
    if (!acc[r]) acc[r] = []
    acc[r].push(item)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header + Close Round Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
            Check 3 winners → Close Round. Winners saved on-chain. All current polls archived automatically.
          </p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            Round #{currentRound} · {polls.length} active poll{polls.length !== 1 ? 's' : ''} · {selected.size}/3 selected
          </p>
        </div>
        <button
          onClick={handleCloseRound}
          disabled={selected.size !== 3 || closing}
          style={{
            background: selected.size === 3 ? 'var(--gold)' : 'rgba(223,219,207,0.06)',
            color: selected.size === 3 ? '#0A0A0A' : 'var(--text-tertiary)',
            border: 'none', padding: '10px 20px', borderRadius: 8,
            cursor: selected.size === 3 && !closing ? 'pointer' : 'not-allowed',
            fontWeight: 700, fontSize: 13, transition: 'all 0.2s ease',
            flexShrink: 0, opacity: closing ? 0.7 : 1,
          }}
        >
          {closing ? 'Closing...' : `🏆 Close Round (${selected.size}/3)`}
        </button>
      </div>

      {/* Active Polls List */}
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Active Polls — ranked by votes
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 10 }} />
            ))}
          </div>
        ) : polls.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: 'var(--text-tertiary)', fontSize: 14,
            border: '1px dashed rgba(223,219,207,0.1)', borderRadius: 12,
          }}>
            No active polls this round. Users can submit ideas from Calls → The Poll tab.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {polls.map((poll, i) => {
              const idStr = String(poll.id)
              const isSelected = selected.has(idStr)
              return (
                <div
                  key={idStr}
                  style={{
                    background: isSelected ? 'rgba(201,168,76,0.06)' : 'var(--bg-surface)',
                    border: isSelected ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(223,219,207,0.07)',
                    borderRadius: 10, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(poll.id)}
                    disabled={!isSelected && selected.size >= 3}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--gold)', flexShrink: 0 }}
                  />
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: i === 0 ? 'var(--gold)' : 'var(--text-tertiary)', flexShrink: 0, width: 24, textAlign: 'center' }}>
                    #{i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: isSelected ? 'var(--gold)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {poll.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      by {getName(poll.submittedBy)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700 }}>
                      {String(poll.voteCount)}
                    </div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>votes</div>
                  </div>
                  <button
                    onClick={() => handleDelete(poll.id)}
                    style={{
                      background: 'rgba(217,79,79,0.08)', border: '1px solid rgba(217,79,79,0.2)',
                      color: 'var(--danger)', padding: '6px 12px', borderRadius: 6,
                      cursor: 'pointer', fontSize: 12, flexShrink: 0, transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(217,79,79,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(217,79,79,0.08)'}
                  >
                    🗑 Delete
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}

// ============================================================
// Reusable Admin Modal
// ============================================================
function AdminModal({ title, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
