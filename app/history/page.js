import HistoryTable from '@/components/HistoryTable'

export const metadata = {
  title: 'History — Meta Ad Scheduler',
}

export default function HistoryPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold">History</h1>
        <p className="text-[#6b7280] text-sm mt-1">View all past executed, failed, and cancelled jobs</p>
      </div>

      {/* History Table */}
      <HistoryTable />
    </div>
  )
}
