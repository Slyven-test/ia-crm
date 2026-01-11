"use client";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default function ConfigPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Config"
        description="Parametres de recommandations et reglages."
      />
      <EmptyState
        title="Configuration en preparation"
        description="Les reglages seront exposes dans la prochaine phase."
      />
    </div>
  );
}
