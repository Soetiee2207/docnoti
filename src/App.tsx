import { useEffect } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { getAppServices } from "@/services"

export default function App() {
  useEffect(() => {
    // Start background daemon services (singleton, idempotent)
    void getAppServices().then((services) => {
      void services.appLifecycleService.startDaemon()
    })
  }, [])

  return <AppLayout />
}

