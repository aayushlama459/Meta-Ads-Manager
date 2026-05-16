import './globals.css'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'

export const metadata = {
  title: 'Meta Ad Scheduler',
  description: 'Schedule and manage Meta ad campaigns for your Nepal e-commerce business',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0a] text-white min-h-screen">
        <div className="flex min-h-screen">
          {/* Desktop Sidebar */}
          <Sidebar />

          {/* Main Content */}
          <main className="flex-1 md:ml-[240px] pb-20 md:pb-0 min-h-screen">
            <div className="max-w-6xl mx-auto p-4 md:p-8">
              {children}
            </div>
          </main>
        </div>

        {/* Mobile Bottom Nav */}
        <BottomNav />
      </body>
    </html>
  )
}
