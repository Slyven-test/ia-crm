"use client";

import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { endpoints } from "@/lib/endpoints";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export default function ExportsPage() {
  const [runId, setRunId] = useState("");

  const exportLinks = [
    {
      label: "Export recommandations (CSV)",
      href: `${API_BASE}${endpoints.export.recommendations}`,
    },
    {
      label: "Export audit (CSV)",
      href: `${API_BASE}${endpoints.export.audit}`,
    },
  ];

  const runLinks =
    runId.trim().length > 0
      ? [
          {
            label: `Run ${runId} (CSV)`,
            href: `${API_BASE}${endpoints.export.runs(runId, "csv")}`,
          },
          {
            label: `Run ${runId} (JSON)`,
            href: `${API_BASE}${endpoints.export.runs(runId, "json")}`,
          },
        ]
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exports"
        description="Telechargements disponibles pour la data IA-CRM."
      />
      <Card>
        <CardHeader>
          <CardTitle>Exports disponibles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {exportLinks.map((link) => (
              <a
                key={link.href}
                className="block text-sm text-primary underline"
                href={link.href}
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Entrez un run id pour exporter ses items.
            </p>
            <Input
              placeholder="run_id (ex: 12345)"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
            />
            {runLinks.length ? (
              <div className="space-y-1">
                {runLinks.map((link) => (
                  <a
                    key={link.href}
                    className="block text-sm text-primary underline"
                    href={link.href}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Aucun run selectionne"
                description="Ajoutez un run id pour activer les liens."
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
