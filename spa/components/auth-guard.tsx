"use client";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, error } = useAuth();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/login");
    }
  }, [error, router]);

  if (status === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="text-sm text-muted-foreground">
          Chargement de la session...
        </div>
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 401) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="text-sm text-muted-foreground">
          Redirection vers la connexion...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
        <div className="w-full max-w-lg">
          <Alert variant="destructive">
            <AlertTitle>Erreur d&apos;authentification</AlertTitle>
            <AlertDescription>
              Impossible de verifier la session. Veuillez reessayer.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
