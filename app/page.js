import Link from 'next/link'
import StatsCards from '@/components/StatsCards'
import ScheduleTable from '@/components/ScheduleTable'

export const metadata = {
  title: 'Dashboard — Meta Ad Scheduler',
}

export default function DashboardPage() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-white text-2xl font-bold">Dashboard</h1>
          <p className="text-[#6b7280] text-sm mt-1">Monitor and manage your scheduled ad campaigns</p>
        </div>
        <Link
          href="/schedule"
          className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-[#3b82f6]/20"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Schedule
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-8">
        <StatsCards />
      </div>

      {/* Upcoming Schedules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-semibold">Upcoming Schedules</h2>
          <Link
            href="/history"
            className="text-[#6b7280] hover:text-[#3b82f6] text-sm transition-colors flex items-center gap-1"
          >
            View History
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <polyline points="9,18 15,12 9,6"/>
            </svg>
          </Link>
        </div>
        <ScheduleTable />
      </div>
    </div>
  )
}
