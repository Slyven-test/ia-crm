"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type LoginPayload = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LoginPayload>({ email: "", password: "" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: async (payload: LoginPayload) =>
      apiRequest(endpoints.auth.token, {
        method: "POST",
        body: payload,
        skipAuth: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      router.replace("/dashboard");
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Connexion impossible. Veuillez reessayer.");
      }
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Accedez a votre espace IA-CRM pour piloter les recommandations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>Erreur</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setErrorMessage(null);
              login.mutate(form);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                placeholder="email@entreprise.fr"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, password: event.target.value }))
                }
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={login.isPending}
            >
              {login.isPending ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
