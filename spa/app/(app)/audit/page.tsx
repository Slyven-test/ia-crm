"use client";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit"
        description="Journal des operations et executions."
      />
      <EmptyState
        title="Audit en preparation"
        description="Le suivi d'audit sera branche prochainement."
      />
    </div>
  );
}
