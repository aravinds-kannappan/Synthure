'use client'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import type { Notification } from '@/lib/types'

interface Props {
  notifications: Notification[]
}

export function NotificationBell({ notifications }: Props) {
  const [open, setOpen] = useState(false)
  const unread = notifications.filter((n) => !n.read_at)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-slate-800 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-400" />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-teal-400 rounded-full" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-[#0d1525] border border-slate-700 rounded-xl shadow-2xl z-50">
          <div className="px-4 py-3 border-b border-slate-700">
            <span className="text-sm font-medium">Notifications</span>
            {unread.length > 0 && (
              <span className="ml-2 text-xs text-teal-400">{unread.length} unread</span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500 p-4 text-center">No notifications</p>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-slate-800 last:border-0 ${
                    !n.read_at ? 'bg-slate-800/30' : ''
                  }`}
                >
                  <p className="text-xs font-medium text-slate-200">{n.title}</p>
                  {n.body && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                  {n.tier === '2' && (
                    <button className="mt-2 text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full hover:bg-indigo-500/30">
                      One-tap approve
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
