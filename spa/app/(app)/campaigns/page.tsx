"use client";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Campagnes"
        description="Lancement et suivi des campagnes marketing."
      />
      <EmptyState
        title="Campagnes en preparation"
        description="Les flux de campagne seront disponibles dans une prochaine phase."
      />
    </div>
  );
}
