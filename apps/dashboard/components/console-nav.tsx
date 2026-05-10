"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Activity, Bot, Dashboard, FlaskConicalIcon, Settings } from "@/components/icons";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  icon: typeof Dashboard;
  exact?: boolean;
}

const links: ReadonlyArray<NavLink> = [
  { href: "/console", label: "Overview", icon: Dashboard, exact: true },
  { href: "/console/experiments", label: "Experiments", icon: FlaskConicalIcon },
  { href: "/console/live", label: "Live", icon: Activity },
  { href: "/console/settings/keys", label: "Settings", icon: Settings },
];

export function ConsoleNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/console" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
            <Bot className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">autodrop</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1">
          {links.map((l) => {
            const active = l.exact
              ? pathname === l.href
              : pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent/5 hover:text-foreground",
                )}
              >
                <l.icon className="h-3.5 w-3.5" />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <UserButton />
      </div>
    </header>
  );
}
