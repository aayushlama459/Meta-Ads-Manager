'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function ScheduleForm() {
  const router = useRouter()

  // Mode: 'search' or 'manual'
  const [mode, setMode] = useState('search')

  // Campaign search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const dropdownRef = useRef(null)
  const searchTimeout = useRef(null)

  // Manual mode
  const [manualCampaignId, setManualCampaignId] = useState('')
  const [manualCampaignName, setManualCampaignName] = useState('')
  const [manualAdAccountId, setManualAdAccountId] = useState('')

  // Common fields
  const [action, setAction] = useState('PAUSE')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [note, setNote] = useState('')

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search campaigns with debounce
  useEffect(() => {
    if (mode !== 'search') return
    if (searchQuery.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/campaigns/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults(Array.isArray(data) ? data : [])
        setShowDropdown(true)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setSearchLoading(false)
      }
    }, 400)
  }, [searchQuery, mode])

  function selectCampaign(campaign) {
    setSelectedCampaign(campaign)
    setSearchQuery(campaign.name)
    setShowDropdown(false)
  }

  function clearSelection() {
    setSelectedCampaign(null)
    setSearchQuery('')
    setSearchResults([])
  }

  function handleModeToggle(newMode) {
    setMode(newMode)
    setSelectedCampaign(null)
    setSearchQuery('')
    setSearchResults([])
    setManualCampaignId('')
    setManualCampaignName('')
    setManualAdAccountId('')
    setErrorMsg('')
    setSuccessMsg('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    const campaign_id = mode === 'search' ? selectedCampaign?.id : manualCampaignId.trim()
    const campaign_name = mode === 'search' ? selectedCampaign?.name : manualCampaignName.trim()
    const ad_account_id = mode === 'search' ? selectedCampaign?.account_id : manualAdAccountId.trim()

    if (!campaign_id) {
      setErrorMsg(mode === 'search' ? 'Please select a campaign from the dropdown' : 'Please enter a Campaign ID')
      return
    }

    if (!scheduleDate || !scheduleTime) {
      setErrorMsg('Please select both date and time')
      return
    }

    const scheduled_time_nepal = `${scheduleDate} ${scheduleTime}`

    setSubmitting(true)
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id,
          campaign_name,
          ad_account_id,
          action,
          scheduled_time_nepal,
          note: note.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to schedule')
        return
      }

      setSuccessMsg(
        `Successfully scheduled ${action} for "${campaign_name || campaign_id}" on ${scheduled_time_nepal} NPT`
      )

      // Reset form
      setSelectedCampaign(null)
      setSearchQuery('')
      setManualCampaignId('')
      setManualCampaignName('')
      setManualAdAccountId('')
      setScheduleDate('')
      setScheduleTime('')
      setNote('')
    } catch (err) {
      setErrorMsg('Network error: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Get today's date in YYYY-MM-DD for min date
  const today = new Date().toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Success Message */}
      {successMsg && (
        <div className="bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-[#22c55e] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20,6 9,17 4,12"/>
          </svg>
          <div>
            <p className="text-[#22c55e] text-sm font-medium">Schedule Created!</p>
            <p className="text-[#22c55e]/80 text-xs mt-1">{successMsg}</p>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-[#22c55e] text-xs underline mt-2 hover:no-underline"
            >
              View on Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-[#ef4444] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-[#ef4444] text-sm">{errorMsg}</p>
        </div>
      )}

      {/* Campaign Selection Card */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6">
        <h3 className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
          <span className="w-5 h-5 text-[#3b82f6]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
          Select Campaign
        </h3>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => handleModeToggle('search')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
              mode === 'search'
                ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                : 'bg-transparent text-[#6b7280] border-[#1f1f1f] hover:border-[#374151] hover:text-white'
            }`}
          >
            Search by Name
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle('manual')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
              mode === 'manual'
                ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                : 'bg-transparent text-[#6b7280] border-[#1f1f1f] hover:border-[#374151] hover:text-white'
            }`}
          >
            Paste ID Directly
          </button>
        </div>

        {/* Search Mode */}
        {mode === 'search' && (
          <div className="relative" ref={dropdownRef}>
            <label className="block text-[#6b7280] text-xs font-medium mb-2">Search Campaign Name</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (selectedCampaign && e.target.value !== selectedCampaign.name) {
                    setSelectedCampaign(null)
                  }
                }}
                placeholder="Type campaign name..."
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-4 py-3 text-white text-sm placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6] pr-10 transition-colors"
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {selectedCampaign && !searchLoading && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-[#111111] border border-[#1f1f1f] rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCampaign(c)}
                    className="w-full text-left px-4 py-3 hover:bg-[#1f1f1f] transition-colors border-b border-[#1f1f1f] last:border-0"
                  >
                    <p className="text-white text-sm font-medium truncate">{c.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[#6b7280] text-xs font-mono">{c.id}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        c.status === 'ACTIVE' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#f59e0b]/10 text-[#f59e0b]'
                      }`}>
                        {c.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showDropdown && !searchLoading && searchResults.length === 0 && searchQuery.length >= 2 && (
              <div className="absolute z-50 w-full mt-1 bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 text-center">
                <p className="text-[#6b7280] text-sm">No campaigns found</p>
              </div>
            )}

            {/* Selected Campaign Info */}
            {selectedCampaign && (
              <div className="mt-3 bg-[#3b82f6]/10 border border-[#3b82f6]/20 rounded-lg p-3">
                <p className="text-[#3b82f6] text-xs font-medium">Selected Campaign</p>
                <p className="text-white text-sm mt-1">{selectedCampaign.name}</p>
                <p className="text-[#6b7280] text-xs mt-0.5">ID: {selectedCampaign.id} · Account: {selectedCampaign.account_id}</p>
              </div>
            )}
          </div>
        )}

        {/* Manual Mode */}
        {mode === 'manual' && (
          <div className="space-y-4">
            <div>
              <label className="block text-[#6b7280] text-xs font-medium mb-2">Campaign ID <span className="text-[#ef4444]">*</span></label>
              <input
                type="text"
                value={manualCampaignId}
                onChange={(e) => setManualCampaignId(e.target.value)}
                placeholder="e.g. 120214973435180181"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-4 py-3 text-white text-sm placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6] font-mono transition-colors"
              />
            </div>
            <div>
              <label className="block text-[#6b7280] text-xs font-medium mb-2">Campaign Name (optional)</label>
              <input
                type="text"
                value={manualCampaignName}
                onChange={(e) => setManualCampaignName(e.target.value)}
                placeholder="e.g. Summer Sale Campaign"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-4 py-3 text-white text-sm placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6] transition-colors"
              />
            </div>
            <div>
              <label className="block text-[#6b7280] text-xs font-medium mb-2">Ad Account ID (optional)</label>
              <input
                type="text"
                value={manualAdAccountId}
                onChange={(e) => setManualAdAccountId(e.target.value)}
                placeholder="e.g. act_123456789"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-4 py-3 text-white text-sm placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6] font-mono transition-colors"
              />
            </div>
          </div>
        )}
      </div>

      {/* Action Card */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6">
        <h3 className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
          <span className="w-5 h-5 text-[#3b82f6]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </span>
          Action
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setAction('PAUSE')}
            className={`py-4 px-6 rounded-xl font-bold text-sm border-2 transition-all ${
              action === 'PAUSE'
                ? 'bg-[#ef4444] text-white border-[#ef4444] shadow-lg shadow-[#ef4444]/20'
                : 'bg-transparent text-[#ef4444] border-[#ef4444]/30 hover:border-[#ef4444]/60'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
              </svg>
              PAUSE
            </div>
            <p className="text-xs font-normal mt-1 opacity-80">Sets campaign to PAUSED</p>
          </button>

          <button
            type="button"
            onClick={() => setAction('RESUME')}
            className={`py-4 px-6 rounded-xl font-bold text-sm border-2 transition-all ${
              action === 'RESUME'
                ? 'bg-[#22c55e] text-white border-[#22c55e] shadow-lg shadow-[#22c55e]/20'
                : 'bg-transparent text-[#22c55e] border-[#22c55e]/30 hover:border-[#22c55e]/60'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
              RESUME
            </div>
            <p className="text-xs font-normal mt-1 opacity-80">Sets campaign to ACTIVE</p>
          </button>
        </div>
      </div>

      {/* Schedule Time Card */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6">
        <h3 className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
          <span className="w-5 h-5 text-[#3b82f6]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </span>
          Schedule Time
          <span className="ml-auto text-xs text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-2 py-0.5 rounded-md font-normal">
            Nepal Time (NPT)
          </span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[#6b7280] text-xs font-medium mb-2">
              Date <span className="text-[#ef4444]">*</span>
            </label>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={today}
              required
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
          </div>
          <div>
            <label className="block text-[#6b7280] text-xs font-medium mb-2">
              Time (NPT) <span className="text-[#ef4444]">*</span>
            </label>
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              required
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
          </div>
        </div>

        {scheduleDate && scheduleTime && (
          <div className="mt-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-4 py-3">
            <p className="text-[#6b7280] text-xs">Scheduled at:</p>
            <p className="text-white text-sm font-mono mt-0.5">
              {scheduleDate} {scheduleTime} <span className="text-[#f59e0b]">NPT</span>
            </p>
          </div>
        )}
      </div>

      {/* Note Card */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6">
        <h3 className="text-white text-sm font-semibold mb-4">
          Note <span className="text-[#6b7280] font-normal">(optional)</span>
        </h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note about this schedule (e.g. Budget reason, campaign cycle)..."
          rows={3}
          className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-4 py-3 text-white text-sm placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6] resize-none transition-colors"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#3b82f6]/20"
      >
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Scheduling...
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
            Schedule Ad
          </>
        )}
      </button>
    </form>
  )
}
