import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { PipelineDebugPanel } from "@/components/dev/PipelineDebugPanel";
import { ExpiredTaskPrompt } from "@/components/nexus/ExpiredTaskPrompt";
import { DemoWorkspaceBadge } from "@/components/nexus/DemoWorkspaceBadge";

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-warm text-ink">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(247,107,88,0.08),transparent_26%),radial-gradient(circle_at_82%_16%,rgba(107,168,223,0.08),transparent_28%)]" />
      <div className="relative flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <motion.main
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mx-auto w-full max-w-[1440px] px-5 pb-28 pt-8 sm:px-8 lg:px-12 lg:pb-16"
          >
            <div className="mb-6">
              <DemoWorkspaceBadge />
            </div>
            <Outlet />
          </motion.main>
          <MobileNav />
        </div>
      </div>
      <PipelineDebugPanel />
      <ExpiredTaskPrompt />
    </div>
  );
}
