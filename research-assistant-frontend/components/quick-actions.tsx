"use client"
import { Card } from "@/components/ui/card"
import { Search, FileText, BarChart3, Zap } from "lucide-react"

interface QuickActionsProps {
  onQuickAction: (action: string) => void
  hasFiles: boolean
}

export function QuickActions({ onQuickAction, hasFiles }: QuickActionsProps) {
  const actions = [
    {
      id: "search",
      label: "Web Search",
      icon: Search,
      description: "Search the web for information",
      gradient: "from-blue-500 to-cyan-500",
      enabled: true,
    },
    {
      id: "summarize",
      label: "Summarize PDFs",
      icon: FileText,
      description: "Summarize uploaded documents",
      gradient: "from-orange-500 to-red-500",
      enabled: hasFiles,
    },
    {
      id: "compare",
      label: "Compare Docs",
      icon: Zap,
      description: "Compare multiple documents",
      gradient: "from-green-500 to-emerald-500",
      enabled: hasFiles,
    },
    {
      id: "rank",
      label: "Rank Sources",
      icon: BarChart3,
      description: "Rank and cite sources",
      gradient: "from-purple-500 to-pink-500",
      enabled: true,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action) => (
        <Card
          key={action.id}
          className={`p-4 bg-gradient-to-r ${action.gradient}/10 border-${action.gradient.split("-")[1]}-500/20 backdrop-blur-sm hover:${action.gradient}/20 transition-all duration-300 cursor-pointer ${
            !action.enabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={() => action.enabled && onQuickAction(action.id)}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 bg-gradient-to-r ${action.gradient} rounded-lg flex items-center justify-center`}
            >
              <action.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-200">{action.label}</h4>
              <p className="text-xs text-slate-400">{action.description}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
