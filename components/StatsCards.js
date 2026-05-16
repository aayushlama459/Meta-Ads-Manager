'use client'

import { useEffect, useState } from 'react'

export default function StatsCards() {
  const [stats, setStats] = useState({ upcoming: 0, doneToday: 0, failed: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard
        label="Upcoming"
        value={stats.upcoming}
        color="#f59e0b"
        icon={<ClockIcon />}
        loading={loading}
      />
      <StatCard
        label="Done Today"
        value={stats.doneToday}
        color="#22c55e"
        icon={<CheckIcon />}
        loading={loading}
      />
      <StatCard
        label="Failed"
        value={stats.failed}
        color="#ef4444"
        icon={<XIcon />}
        loading={loading}
      />
    </div>
  )
}

function StatCard({ label, value, color, icon, loading }) {
  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-5 flex items-center gap-4">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color + '20', color }}
      >
        <span className="w-6 h-6">{icon}</span>
      </div>
      <div>
        <p className="text-[#6b7280] text-sm font-medium">{label}</p>
        {loading ? (
          <div className="h-8 w-12 bg-[#1f1f1f] rounded animate-pulse mt-1" />
        ) : (
          <p className="text-white text-3xl font-bold leading-tight" style={{ color }}>
            {value}
          </p>
        )}
      </div>
    </div>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12,6 12,12 16,14"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}
