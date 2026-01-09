import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex min-h-screen">
        <Sidebar className="hidden lg:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-6 pb-12 pt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
