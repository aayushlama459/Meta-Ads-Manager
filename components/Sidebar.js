import Link from 'next/link'

export default function Sidebar() {
  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-[240px] bg-[#0d0d0d] border-r border-[#1f1f1f] flex-col z-50">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#3b82f6] rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Ad Scheduler</p>
            <p className="text-[#6b7280] text-xs">Meta Campaigns</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <p className="text-[#6b7280] text-xs font-medium uppercase tracking-wider px-3 mb-3">Navigation</p>
        <div className="space-y-1">
          <SidebarLink href="/" icon={<DashboardIcon />} label="Dashboard" />
          <SidebarLink href="/launcher" icon={<LaunchIcon />} label="Launch Ad" />
          <SidebarLink href="/schedule" icon={<ScheduleIcon />} label="Add Schedule" />
          <SidebarLink href="/history" icon={<HistoryIcon />} label="History" />
        </div>
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#1f1f1f]">
        <p className="text-[#6b7280] text-xs">Nepal Time (NPT) UTC+5:45</p>
      </div>
    </aside>
  )
}

function SidebarLink({ href, icon, label }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#6b7280] hover:text-white hover:bg-[#1f1f1f] transition-all duration-150 group"
    >
      <span className="w-5 h-5 flex-shrink-0 group-hover:text-[#3b82f6] transition-colors">
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  )
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  )
}

function ScheduleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12,6 12,12 16,14"/>
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <polyline points="1,4 1,10 7,10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-4.84"/>
    </svg>
  )
}

function LaunchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M13.5 21H3v-10.5"/>
      <path d="M21 3L10.5 13.5"/>
      <path d="M21 3v10.5"/>
      <path d="M21 3H10.5"/>
    </svg>
  )
}
