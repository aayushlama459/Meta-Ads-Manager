'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0d0d0d] border-t border-[#1f1f1f] z-50">
      <div className="flex items-center justify-around h-16">
        <BottomNavItem
          href="/"
          label="Dashboard"
          active={pathname === '/'}
          icon={<DashboardIcon />}
        />
        <BottomNavItem
          href="/launcher"
          label="Launch"
          active={pathname === '/launcher'}
          icon={<LaunchIcon />}
        />
        <BottomNavItem
          href="/chat"
          label="Chat"
          active={pathname === '/chat'}
          icon={<ChatIcon />}
        />
        <BottomNavItem
          href="/schedule"
          label="Schedule"
          active={pathname === '/schedule'}
          icon={<ScheduleIcon />}
        />
        <BottomNavItem
          href="/history"
          label="History"
          active={pathname === '/history'}
          icon={<HistoryIcon />}
        />
      </div>
    </nav>
  )
}

function BottomNavItem({ href, label, active, icon }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
        active ? 'text-[#3b82f6]' : 'text-[#6b7280] hover:text-white'
      }`}
    >
      <span className="w-6 h-6">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
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

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
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
