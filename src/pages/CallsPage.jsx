import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useDataCache } from '../context/DataPrefetchContext'
import Navbar from '../components/Navbar'
import PredictionCard from '../components/PredictionCard'
import PollTab from '../components/PollTab'
import Footer from '../components/Footer'
import ErrorBoundary from '../components/ErrorBoundary'

const TABS = [
  { id: 'all_calls',       label: 'All Calls' },
  { id: 'community_calls', label: 'Community Calls' },
  { id: 'official_calls',  label: 'Official Calls' },
  { id: 'polls',           label: 'The Poll' },
]

export default function CallsPage() {
  const { allPredictions, refetchPredictions } = useDataCache()

  // Local state only used when cache is cold (first 300ms of app life)
  const [localPredictions, setLocalPredictions] = useState(null)
  const [localLoading, setLocalLoading] = useState(false)

  const [activeTab, setActiveTab] = useState('all_calls')
  const [visibleCount, setVisibleCount] = useState(8)

  // Fallback: if cache still cold when this page mounts, fetch own data
  useEffect(() => {
    if (allPredictions === null) {
      fetchOwnData()
    }
  }, [])

  // Sync local data when cache arrives (in case it arrived after mount)
  useEffect(() => {
    if (allPredictions !== null) setLocalPredictions(null)
  }, [allPredictions])

  async function fetchOwnData() {
    setLocalLoading(true)
    try {
      const { data } = await supabase
        .from('predictions_display')
        .select('*')
        .order('created_at', { ascending: false })
      setLocalPredictions(data || [])
    } catch (err) {
      console.error('Failed to fetch predictions:', err)
    } finally {
      setLocalLoading(false)
    }
  }

  // Realtime subscription — invalidates cache on any change
  useEffect(() => {
    const channel = supabase
      .channel('predictions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions_display' }, () => {
        try { localStorage.removeItem('rc_cache_predictions') } catch {}
        refetchPredictions()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // Refetch on window focus (keep data fresh)
  useEffect(() => {
    function handleFocus() { refetchPredictions() }
    function handleVisible() { if (document.visibilityState === 'visible') refetchPredictions() }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [])

  const handleBetPlaced = useCallback(() => {
    refetchPredictions()
  }, [])

  // Use cache if available, fallback to local fetch data
  const source = allPredictions ?? localPredictions ?? []
  const loading = allPredictions === null && localLoading

  const filteredPredictions = source.filter(p => {
    const statusMatch = ['open', 'locked'].includes(p.status)
    const categoryMatch = activeTab === 'all_calls' || p.category === activeTab
    return statusMatch && categoryMatch
  })

  const displayedPredictions = filteredPredictions.slice(0, visibleCount)
  const hasMore = filteredPredictions.length > visibleCount


  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      backgroundImage: `
        radial-gradient(circle at 15% 30%, rgba(223,219,207,0.02) 0%, transparent 40%),
        radial-gradient(circle at 85% 70%, rgba(28,28,28,0.5) 0%, transparent 45%)
      `,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Navbar />

      <main style={{
        maxWidth: 1120,
        margin: '0 auto',
        padding: '40px 24px 80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
        position: 'relative',
        zIndex: 10,
        flex: 1,
        width: '100%',
      }}>
        {/* Page heading */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            {activeTab === 'polls' ? 'The Poll' : 'Active Calls'}
          </h1>
        </div>

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: '4px', padding: '4px', background: '#141414', borderRadius: '10px', width: 'fit-content' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setVisibleCount(8) }}
              style={{
                padding: '9px 20px',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                background: activeTab === tab.id ? 'rgba(223,219,207,0.1)' : 'transparent',
                color: activeTab === tab.id ? '#DFDBCF' : '#555555',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>


        {/* Content */}
        {activeTab === 'polls' ? (
          <PollTab />
        ) : (
          <>
            {/* Loading skeletons */}
            {loading && source.length === 0 ? (
              <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
                  gap: 24,
              }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="glass-card" style={{ height: 380, borderRadius: 16 }}>
                    <div className="skeleton" style={{ height: 160, borderRadius: '16px 16px 0 0' }} />
                    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="skeleton" style={{ height: 20, width: '80%', borderRadius: 6 }} />
                      <div className="skeleton" style={{ height: 14, width: '60%', borderRadius: 6 }} />
                      <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedPredictions.length === 0 ? (
              <div className="glass-card" style={{
                textAlign: 'center',
                padding: '80px 24px',
                borderRadius: 24,
              }}>
                <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.6 }}>
                  🎯
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
                  No active calls
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
                  No open predictions in this category yet.
                </p>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
                  gap: 24,
                }}>
                  {displayedPredictions.map(pred => (
                    <ErrorBoundary key={pred.id}>
                      <PredictionCard
                        prediction={pred}
                        onBetPlaced={handleBetPlaced}
                      />
                    </ErrorBoundary>
                  ))}
                </div>

                {hasMore && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button
                      onClick={() => setVisibleCount(v => v + 8)}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(223,219,207,0.2)',
                        color: '#DFDBCF',
                        padding: '12px 32px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      Load More
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}

