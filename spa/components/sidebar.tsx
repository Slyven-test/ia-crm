"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Download,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Produits", href: "/products", icon: Package },
  { label: "Recommandations", href: "/recommendations", icon: Sparkles },
  { label: "Runs", href: "/runs", icon: Workflow },
  { label: "Segmentation", href: "/segmentation", icon: Target },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Audit", href: "/audit", icon: ClipboardList },
  { label: "Campagnes", href: "/campaigns", icon: Megaphone },
  { label: "Config", href: "/config", icon: Settings },
  { label: "Exports", href: "/exports", icon: Download },
];

type SidebarProps = {
  className?: string;
  onNavigate?: () => void;
};

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "w-72 flex-col border-r bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40",
        className
      )}
    >
      <div className="px-6 pb-4 pt-6">
        <div className="flex items-center gap-3 text-lg font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            IA
          </span>
          <div className="leading-tight">
            <p>IA-CRM</p>
            <p className="text-xs font-normal text-muted-foreground">
              Workspace
            </p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive && "bg-muted text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="border-t px-6 py-5 text-xs text-muted-foreground">
        Donnees et recommandations pour les ventes.
      </div>
    </aside>
  );
}
