import { formatEther, parseEther } from 'viem'

// Shorten wallet address: 0xAbCd...1234
export function shortAddress(addr) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

// Format RITUAL amount from BigInt wei
export function formatRitual(wei) {
  if (wei === undefined || wei === null) return '0'
  try {
    const eth = parseFloat(formatEther(BigInt(wei)))
    if (eth === 0) return '0'
    return eth.toFixed(3)
  } catch {
    return '0'
  }
}

// Format numeric RITUAL (already in ether units, from Supabase)
export function formatRitualNum(num) {
  if (!num) return '0'
  const n = parseFloat(num)
  if (n === 0) return '0'
  return n.toFixed(3)
}

// Calculate odds for YES/NO sides
export function calcOdds(yesPool, noPool) {
  const yes = parseFloat(formatEther(BigInt(yesPool || 0)))
  const no  = parseFloat(formatEther(BigInt(noPool  || 0)))
  const total = yes + no
  if (total === 0) return { yesPct: 50, noPct: 50, yesMulti: 0, noMulti: 0 }
  const yesPct = Math.round((yes / total) * 100)
  const noPct  = 100 - yesPct
  const yesMulti = yes > 0 ? (total / yes).toFixed(2) : '∞'
  const noMulti  = no  > 0 ? (total / no).toFixed(2)  : '∞'
  return { yesPct, noPct, yesMulti, noMulti }
}

// Format countdown from seconds remaining
export function formatCountdown(secondsLeft) {
  if (secondsLeft <= 0) return { text: 'BETS CLOSED', level: 'closed' }
  const d = Math.floor(secondsLeft / 86400)
  const h = Math.floor((secondsLeft % 86400) / 3600)
  const m = Math.floor((secondsLeft % 3600) / 60)
  const s = secondsLeft % 60

  if (secondsLeft < 300)  return { text: 'BETS CLOSING SOON', level: 'danger' }
  if (secondsLeft < 3600) return { text: `${m}m ${s}s`,        level: 'warning' }
  if (d > 0)              return { text: `${d}d ${h}h ${m}m ${s}s`, level: 'normal' }
  return { text: `${h}h ${m}m ${s}s`, level: 'normal' }
}

// Format relative time (2 mins ago, etc.)
export function timeAgo(dateStr) {
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60)   return `${diffSecs}s ago`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60)   return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24)  return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

// Format date as Month Year
export function formatMonthYear(ts) {
  if (!ts) return ''
  const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Get status string for display
export function getStatusString(status) {
  const map = { 0: 'open', 1: 'locked', 2: 'yes_wins', 3: 'no_wins', 4: 'refunded', 5: 'deleted' }
  return map[status] ?? 'unknown'
}

// Build X share URL
export function buildXShareUrl(text) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
}

// Copy to clipboard
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// Validate minimum bet (RLO — minimum 10 RLO)
export function validateBetAmount(amount) {
  const n = parseFloat(amount)
  if (isNaN(n) || n <= 0) return 'Please enter a valid amount'
  if (n < 10) return 'Minimum bet is 10 RLO'
  return null
}

// Format RLO amount (alias for formatRitual, kept for semantic clarity)
export function formatRLO(wei) {
  return formatRitual(wei)
}

/**
 * Resize an image file client-side and return a base64 JPEG data URL.
 * Stored directly in Supabase text column — no storage bucket or CORS needed.
 * Max file size enforced here before processing.
 * @param {File} file - The image file to process
 * @param {number} maxPx - Max width/height in pixels (default 200)
 * @param {number} quality - JPEG quality 0-1 (default 0.72)
 * @param {number} maxBytes - Max input file size in bytes (default 1.5MB)
 */
export function imageToDataUrl(file, maxPx = 200, quality = 0.72, maxBytes = 1.5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`Image too large. Maximum allowed size is 1.5 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`))
      return
    }
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const canvas = document.createElement('canvas')
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height))
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')) }
    img.src = objectUrl
  })
}

// Upload file to Supabase storage.
// Automatically creates the bucket (public) if it doesn't exist yet.
export async function uploadToSupabase(supabase, bucket, file, path) {
  // First attempt
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (!error) {
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
    return urlData.publicUrl
  }

  // If bucket doesn't exist, create it then retry
  const msg = error?.message?.toLowerCase() || ''
  if (msg.includes('bucket not found') || msg.includes('not found')) {
    // Create the bucket as public so uploaded images can be served
    const { error: createErr } = await supabase.storage.createBucket(bucket, {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    })
    if (createErr && !createErr.message?.toLowerCase().includes('already exists')) {
      throw new Error(`Storage bucket "${bucket}" doesn't exist and couldn't be created. Please create it in your Supabase dashboard → Storage.`)
    }

    // Retry upload after bucket creation
    const { data: retryData, error: retryErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type })
    if (retryErr) throw retryErr
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
    return urlData.publicUrl
  }

  throw error
}
