"use client";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default function SegmentationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Segmentation"
        description="RFM, clusters et segments clients."
      />
      <EmptyState
        title="Segmentation en preparation"
        description="Cette section sera disponible dans la prochaine phase."
      />
    </div>
  );
}
