'use client'

import { useEffect, useState } from 'react'
import { StatusBadge, ActionBadge } from './ScheduleTable'

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000

function utcToNepalDisplay(utcIsoString) {
  if (!utcIsoString) return '—'
  const d = new Date(utcIsoString)
  const nepalMs = d.getTime() + NEPAL_OFFSET_MS
  const nd = new Date(nepalMs)
  const pad = (n) => String(n).padStart(2, '0')
  return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())} ${pad(nd.getUTCHours())}:${pad(nd.getUTCMinutes())} NPT`
}

export default function HistoryTable() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchHistory()
  }, [filter])

  async function fetchHistory() {
    setLoading(true)
    try {
      const res = await fetch(`/api/history?filter=${filter}`)
      const data = await res.json()
      setHistory(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch history:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Filter Buttons */}
      <div className="flex gap-2 mb-4">
        {['all', 'done', 'failed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              filter === f
                ? f === 'all'
                  ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                  : f === 'done'
                  ? 'bg-[#22c55e] text-white border-[#22c55e]'
                  : 'bg-[#ef4444] text-white border-[#ef4444]'
                : 'bg-transparent text-[#6b7280] border-[#1f1f1f] hover:border-[#374151] hover:text-white'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-[#1f1f1f] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-4 text-[#6b7280]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
              <polyline points="1,4 1,10 7,10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-4.84"/>
            </svg>
          </div>
          <p className="text-[#6b7280] text-sm">No history found</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1f1f1f]">
                    <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Campaign</th>
                    <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Action</th>
                    <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Scheduled Time</th>
                    <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Executed Time</th>
                    <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Status</th>
                    <th className="text-left text-[#6b7280] text-xs font-medium uppercase tracking-wider px-6 py-4">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f1f1f]">
                  {history.map((h) => (
                    <tr key={h.id} className="hover:bg-[#161616] transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-white text-sm font-medium truncate max-w-[180px]">
                            {h.campaign_name || 'Unnamed Campaign'}
                          </p>
                          <p className="text-[#6b7280] text-xs mt-0.5 font-mono">{h.campaign_id}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <ActionBadge action={h.action} />
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-white text-sm font-mono">{utcToNepalDisplay(h.scheduled_time)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[#6b7280] text-sm font-mono">{utcToNepalDisplay(h.executed_at)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={h.status} />
                      </td>
                      <td className="px-6 py-4 max-w-[200px]">
                        {h.error_message ? (
                          <p className="text-[#ef4444] text-xs truncate" title={h.error_message}>
                            {h.error_message}
                          </p>
                        ) : (
                          <span className="text-[#6b7280] text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden bg-[#111111] border border-[#1f1f1f] rounded-xl divide-y divide-[#1f1f1f]">
            {history.map((h) => (
              <div key={h.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {h.campaign_name || 'Unnamed Campaign'}
                    </p>
                    <p className="text-[#6b7280] text-xs font-mono truncate">{h.campaign_id}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ActionBadge action={h.action} />
                    <StatusBadge status={h.status} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[#6b7280]">Scheduled</p>
                    <p className="text-white font-mono mt-0.5">{utcToNepalDisplay(h.scheduled_time)}</p>
                  </div>
                  <div>
                    <p className="text-[#6b7280]">Executed</p>
                    <p className="text-[#6b7280] font-mono mt-0.5">{utcToNepalDisplay(h.executed_at)}</p>
                  </div>
                </div>
                {h.error_message && (
                  <p className="text-[#ef4444] text-xs bg-[#ef4444]/5 border border-[#ef4444]/20 rounded px-2 py-1">
                    {h.error_message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
