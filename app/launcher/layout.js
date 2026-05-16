import { Suspense } from 'react'

export default function LauncherLayout({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-[#9ca3af]">Loading...</div>}>
      {children}
    </Suspense>
  )
}
