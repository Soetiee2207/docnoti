import { Sun, Moon, Monitor } from "lucide-react"
import { useTheme, type ThemeMode } from "@/hooks/useTheme"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const options: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
    { mode: "light", label: "Sáng", icon: Sun },
    { mode: "dark", label: "Tối", icon: Moon },
    { mode: "system", label: "Hệ thống", icon: Monitor },
  ]

  return (
    <div
      role="group"
      aria-label="Chọn giao diện"
      className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs"
    >
      {options.map(({ mode, label, icon: Icon }) => {
        const isActive = theme === mode
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setTheme(mode)}
            title={`Chủ đề: ${label}`}
            aria-pressed={isActive}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
              isActive
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
