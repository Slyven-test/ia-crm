"use client";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Suivi des performances et indicateurs avances."
      />
      <EmptyState
        title="Analytics en preparation"
        description="Les rapports avances arrivent dans la prochaine phase."
      />
    </div>
  );
}
