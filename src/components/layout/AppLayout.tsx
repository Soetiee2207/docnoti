import { useState } from "react"
import { Sidebar, type NavTabId } from "./Sidebar"
import { Header } from "./Header"
import { DashboardOverview } from "@/components/dashboard/DashboardOverview"
import { DocumentsView } from "@/components/documents/DocumentsView"
import { TasksView } from "@/components/tasks/TasksView"
import { SettingsView } from "@/components/settings/SettingsView"
import { useDocuments } from "@/hooks/useDocuments"

export function AppLayout() {
  const [activeTab, setActiveTab] = useState<NavTabId>("overview")
  const { openPickerAndImport } = useDocuments()

  const handleNewDocument = async () => {
    setActiveTab("documents")
    await openPickerAndImport()
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground antialiased select-none font-sans">
      {/* Fixed Navigation Sidebar */}
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header
          activeTab={activeTab}
          onNewDocumentClick={handleNewDocument}
        />

        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">
          <div className="mx-auto max-w-6xl">
            {activeTab === "overview" && (
              <DashboardOverview
                onNavigateToDocuments={() => setActiveTab("documents")}
                onNavigateToTasks={() => setActiveTab("tasks")}
              />
            )}
            {activeTab === "documents" && <DocumentsView />}
            {activeTab === "tasks" && <TasksView />}
            {activeTab === "settings" && <SettingsView />}
          </div>
        </main>
      </div>
    </div>
  )
}
