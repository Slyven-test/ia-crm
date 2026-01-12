"use client";

import { LogOut, Menu, Search, UserCircle } from "lucide-react";
import { useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";

export function Topbar() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background/70 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Ouvrir la navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0">
            <Sidebar className="flex h-full" onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="hidden flex-col lg:flex">
          <span className="text-sm font-semibold text-foreground">
            IA-CRM Workspace
          </span>
          <span className="text-xs text-muted-foreground">
            Vue d&apos;ensemble et operations
          </span>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un client, produit, run..."
            className="pl-9"
          />
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2">
            <UserCircle className="h-5 w-5" />
            <span className="hidden text-sm font-medium sm:inline">
              {user?.name || user?.email || "Mon compte"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Compte</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Profil</DropdownMenuItem>
          <DropdownMenuItem>Parametres</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              logout.mutate(undefined, {
                onError: (error) => {
                  if (error instanceof ApiError) {
                    console.error(error.message);
                  }
                },
              });
            }}
            className="text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Deconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
