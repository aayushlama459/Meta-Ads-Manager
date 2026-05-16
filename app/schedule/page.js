import Link from 'next/link'
import ScheduleForm from '@/components/ScheduleForm'

export const metadata = {
  title: 'Add Schedule — Meta Ad Scheduler',
}

export default function SchedulePage() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/"
          className="text-[#6b7280] hover:text-white transition-colors p-1"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
        </Link>
        <div>
          <h1 className="text-white text-2xl font-bold">Add Schedule</h1>
          <p className="text-[#6b7280] text-sm mt-1">Schedule a PAUSE or RESUME action for a campaign</p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <ScheduleForm />
      </div>
    </div>
  )
}
