'use client'

import { useEffect, useState, useCallback } from 'react'

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000

function utcToNepalDisplay(utcIsoString) {
  if (!utcIsoString) return '—'
  const d = new Date(utcIsoString)
  const nepalMs = d.getTime() + NEPAL_OFFSET_MS
  const nd = new Date(nepalMs)
  const pad = (n) => String(n).padStart(2, '0')
  return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())} ${pad(nd.getUTCHours())}:${pad(nd.getUTCMinutes())} NPT`
}

export default function ScheduleTable({ refreshKey }) {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState(null)

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules')
      const data = await res.json()
      setSchedules(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch schedules:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSchedules()
    const interval = setInterval(fetchSchedules, 30000)
    return () => clearInterval(interval)
  }, [fetchSchedules, refreshKey])

  async function handleCancel(id) {
    if (!confirm('Cancel this scheduled job?')) return
    setCancellingId(id)
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSchedules((prev) => prev.filter((s) => s.id !== id))
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to cancel')
      }
    } catch (err) {
      alert('Failed to cancel: ' + err.message)
    } finally {
      setCancellingId(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-[#1f1f1f] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (schedules.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-12 text-center">
        <div className="w-12 h-12 mx-auto mb-4 text-[#6b7280]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <p className="text-[#6b7280] text-sm">No upcoming schedules</p>
        <p className="text-[#6b7280] text-xs mt-1">Click "Add Schedule" to create one</p>
      </div>
    )
  }

  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1f1f1f]">
              <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Campaign</th>
              <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Action</th>
              <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Scheduled Time</th>
              <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Status</th>
              <th className="text-right text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f1f1f]">
            {schedules.map((s) => (
              <tr key={s.id} className="hover:bg-[#161616] transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <p className="text-white text-sm font-medium truncate max-w-[200px]">
                      {s.campaign_name || 'Unnamed Campaign'}
                    </p>
                    <p className="text-[#6b7280] text-xs mt-0.5 font-mono">{s.campaign_id}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <ActionBadge action={s.action} />
                </td>
                <td className="px-6 py-4">
                  <p className="text-white text-sm font-mono">{utcToNepalDisplay(s.scheduled_time)}</p>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleCancel(s.id)}
                    disabled={cancellingId === s.id}
                    className="text-xs text-[#ef4444] hover:text-white hover:bg-[#ef4444] border border-[#ef4444] px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancellingId === s.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden divide-y divide-[#1f1f1f]">
        {schedules.map((s) => (
          <div key={s.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {s.campaign_name || 'Unnamed Campaign'}
                </p>
                <p className="text-[#6b7280] text-xs mt-0.5 font-mono truncate">{s.campaign_id}</p>
              </div>
              <ActionBadge action={s.action} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[#6b7280] text-xs mb-1">Scheduled</p>
                <p className="text-white text-xs font-mono">{utcToNepalDisplay(s.scheduled_time)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={s.status} />
                <button
                  onClick={() => handleCancel(s.id)}
                  disabled={cancellingId === s.id}
                  className="text-xs text-[#ef4444] hover:text-white hover:bg-[#ef4444] border border-[#ef4444] px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                >
                  {cancellingId === s.id ? '...' : 'Cancel'}
                </button>
              </div>
            </div>
            {s.note && (
              <p className="text-[#6b7280] text-xs italic">Note: {s.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatusBadge({ status }) {
  const map = {
    scheduled: { bg: 'bg-[#f59e0b]/10', text: 'text-[#f59e0b]', border: 'border-[#f59e0b]/20', label: 'Scheduled' },
    done: { bg: 'bg-[#22c55e]/10', text: 'text-[#22c55e]', border: 'border-[#22c55e]/20', label: 'Done' },
    failed: { bg: 'bg-[#ef4444]/10', text: 'text-[#ef4444]', border: 'border-[#ef4444]/20', label: 'Failed' },
    cancelled: { bg: 'bg-[#6b7280]/10', text: 'text-[#6b7280]', border: 'border-[#6b7280]/20', label: 'Cancelled' },
    expired: { bg: 'bg-[#6b7280]/10', text: 'text-[#6b7280]', border: 'border-[#6b7280]/20', label: 'Expired' },
  }
  const style = map[status] || map.cancelled
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
      {style.label}
    </span>
  )
}

export function ActionBadge({ action }) {
  if (action === 'PAUSE') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20">
        PAUSE
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">
      RESUME
    </span>
  )
}
