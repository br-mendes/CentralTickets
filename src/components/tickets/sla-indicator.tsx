'use client'

import { cn } from '@/lib/utils'

export function SlaIndicator({ percentage }: { percentage: number }) {
  const status = percentage >= 70 ? "critical" : percentage >= 50 ? "warning" : "normal"
  const bar = status === "critical" ? "bg-red-500" : status === "warning" ? "bg-yellow-500" : "bg-green-500"
  const text = status === "critical" ? "text-red-600" : status === "warning" ? "text-yellow-700" : "text-green-700"

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn("h-full", bar)} style={{ width: Math.min(percentage, 100) + "%" }} />
      </div>
      <span className={cn("text-xs font-bold", text)}>{percentage.toFixed(0)}%</span>
    </div>
  )
}
