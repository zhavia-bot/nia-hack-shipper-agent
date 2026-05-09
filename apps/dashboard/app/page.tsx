import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import {
  ArrowRight,
  Bot,
  CircleDollarSign,
  FlaskConical,
  Gauge,
  GitBranch,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LiveRevenueTicker } from "@/components/live-revenue-ticker";

const stack = [
  "Vercel Workflows",
  "Vercel AI Gateway",
  "Convex",
  "Stripe Connect",
  "Next.js 16",
  "Clerk",
  "Reacher",
  "Nia",
  "Vercel Sandbox",
  "Resend",
  "FLUX 2",
  "Gemini 3 Pro Image",
];

const phases = [
  {
    icon: FlaskConical,
    title: "Hypothesize",
    body:
      "Parent agent samples trending TikTok-Shop niches via Reacher's live shop feed and grounds them with Nia deep-research priors. A Thompson-sampled bandit picks 70% exploit / 30% explore by default — operator can pull the slider either way.",
  },
  {
    icon: Bot,
    title: "Scout",
    body:
      "Each child fires up Vercel Sandbox + agent-browser to scrape the actual product page on Temu/Alibaba. FLUX 2 (Gemini 3 Pro Image fallback) re-skins the scraped photos into ad creatives the operator's storefront actually uses.",
  },
  {
    icon: Rocket,
    title: "Ship",
    body:
      "Tenant goes live on a *.team.vercel.app subdomain with a Stripe Checkout Session minted on the operator's connected account. Funds land directly in their Stripe balance — no platform fee, no escrow, no rehydration.",
  },
  {
    icon: Gauge,
    title: "Measure",
    body:
      "Stripe webhooks land in Convex. Revenue is booked only on confirmed paid sessions, attributed via client_reference_id. ROAS feeds back into the bandit; lessons distill into Nia for the next generation's priors.",
  },
  {
    icon: ShieldCheck,
    title: "Settle",
    body:
      "Demo-safe by construction: every paid order auto-refunds via Stripe Connect within seconds and the customer gets an apology email via the operator's Resend key. The agent never has inventory to fulfill — the upstream conversion signal is the artifact.",
  },
];

const invariants = [
  {
    icon: Lock,
    title: "Immutable substrate",
    body:
      "budget.ts, revenue.ts, ledger.ts are CODEOWNERS-gated. The agent cannot rewrite the rules of its own scoring.",
  },
  {
    icon: ShieldCheck,
    title: "Caller-identity ACLs",
    body:
      "Six service identities (agent, stripe-webhook, refund-worker, dashboard, admin, budget-watchdog) plus Clerk-authenticated humans. Every Convex mutation gates on one or the other; deploy keys do not bypass row-level checks.",
  },
  {
    icon: CircleDollarSign,
    title: "Atomic budget",
    body:
      "Children reserve spend in a Convex transaction before any external API call. No race, no overspend, no aggregate-check loophole.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] bg-gradient-to-b from-accent/10 via-accent/5 to-transparent" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
            <Bot className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">autoresearch</span>
          <Badge variant="secondary" className="ml-2 text-[10px] font-medium uppercase tracking-wider">
            hackathon build
          </Badge>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            href="#how"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            How it works
          </Link>
          <Link
            href="#stack"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Stack
          </Link>
          <Show when="signed-out">
            <Button asChild size="sm" variant="ghost">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/sign-up">
                Get started <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button asChild size="sm" variant="outline">
              <Link href="/console">
                Console <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            <UserButton />
          </Show>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-12 pb-20 sm:pt-20">
        <Badge
          variant="outline"
          className="mb-6 gap-1.5 rounded-full border-accent/40 bg-accent/5 px-3 py-1 text-xs text-accent-foreground/80"
        >
          <Sparkles className="h-3 w-3 text-accent" />
          Terminal goal: maximize $ in Stripe balance
        </Badge>
        <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          An autonomous agent that hypothesis-tests TikTok-Shop products{" "}
          <span className="text-accent">until it finds one that converts.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Connect your Stripe (Standard via Connect — funds land in your
          balance, no platform fee), drop in your AI Gateway, Reacher, Nia,
          and Resend keys, and the parent agent spawns eight parallel
          children every cycle. Each one scouts a real product on Temu,
          re-skins the photos with FLUX 2, ships a storefront, and measures
          conversion — all on your account, all in under an hour. Every
          paid order auto-refunds; the conversion signal is the artifact.
        </p>

        <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Show when="signed-out">
            <Button asChild size="lg" className="gap-2 bg-foreground text-background hover:bg-foreground/90">
              <Link href="/sign-up">
                Run the agent <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button asChild size="lg" className="gap-2 bg-foreground text-background hover:bg-foreground/90">
              <Link href="/console">
                Open console <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </Show>
          <Button asChild size="lg" variant="ghost" className="gap-2">
            <Link href="#how">See the architecture</Link>
          </Button>
        </div>

        <div className="mt-14">
          <LiveRevenueTicker />
        </div>
      </section>

      <Separator className="mx-auto max-w-6xl" />

      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <Badge variant="secondary" className="mb-3 text-[10px] uppercase tracking-wider">
            <Workflow className="mr-1 h-3 w-3" /> Loop
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            One loop. Eight parallel bets. Every paid order refunds.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Each child runs Hypothesize → Scout → Ship → Measure → Settle in
            isolation. Wins survive. Losses become lessons. The bandit gets
            sharper every generation.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {phases.map((p, i) => (
            <Card key={p.title} className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <p.icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    0{i + 1}
                  </span>
                </div>
                <CardTitle className="mt-3 text-xl">{p.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {p.body}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <Badge variant="secondary" className="mb-3 text-[10px] uppercase tracking-wider">
            <Gauge className="mr-1 h-3 w-3" /> Operator controls
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            You stay in the loop without micromanaging it.
          </h2>
          <p className="mt-3 text-muted-foreground">
            The console renders a live tail of what the agent is doing,
            tenant-by-tenant kill and force-refund buttons for the panic
            moments, and a single slider that decides how much risk the
            next generation takes.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-border/60">
            <CardHeader>
              <Sparkles className="h-5 w-5 text-accent" />
              <CardTitle className="mt-3 text-base">Live agent stream</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">
                Convex realtime sub of the agent&rsquo;s narrative —
                generation start, scouted product, storefront live, measured
                ROAS, settlement. No polling, no refresh button.
              </CardDescription>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardHeader>
              <ShieldCheck className="h-5 w-5 text-accent" />
              <CardTitle className="mt-3 text-base">
                Kill + force-refund
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">
                One click flips a tenant to <code>killed</code> (storefront
                404s, agent moves on). A second sweeps every payment intent
                on the connected account and refunds it via the
                Stripe-Account header.
              </CardDescription>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardHeader>
              <Workflow className="h-5 w-5 text-accent" />
              <CardTitle className="mt-3 text-base">
                Explore / exploit slider
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">
                One number in [0, 1]. Pull right to compound proven
                buckets; pull left to find new winners. The agent re-reads
                it at the start of every generation.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <Badge variant="secondary" className="mb-3 text-[10px] uppercase tracking-wider">
            <ShieldCheck className="mr-1 h-3 w-3" /> Hard invariants
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            The agent can do almost anything — except the things that would
            break it.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Karpathy&rsquo;s nanochat &ldquo;prepare.py&rdquo; analog: a small,
            immutable substrate the model is forbidden from editing. Defense in
            depth around the money path.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {invariants.map((inv) => (
            <Card key={inv.title} className="border-border/60">
              <CardHeader>
                <inv.icon className="h-5 w-5 text-accent" />
                <CardTitle className="mt-3 text-base">{inv.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {inv.body}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="stack" className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <Badge variant="secondary" className="mb-3 text-[10px] uppercase tracking-wider">
              <GitBranch className="mr-1 h-3 w-3" /> Stack
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight">
              Boring infrastructure. Sharp tools.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Every dependency earns its keep. Reacher surfaces live
              TikTok-Shop niches; Nia gives the agent grounded research
              priors and a corpus of its own past lessons. Vercel Sandbox
              hosts the agent-browser scout. AI Gateway routes every model
              call through one BYOK key. Convex is canonical state and the
              realtime backbone. Stripe Connect is the goal function.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-center">
            {stack.map((tech) => (
              <Badge
                key={tech}
                variant="outline"
                className="rounded-full border-border/80 bg-background px-3 py-1 text-xs font-medium"
              >
                {tech}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Card className="border-accent/30 bg-gradient-to-br from-accent/5 via-card to-card">
          <CardHeader className="items-start gap-2 pb-4">
            <Zap className="h-5 w-5 text-accent" />
            <CardTitle className="text-2xl tracking-tight sm:text-3xl">
              Want to see the live numbers?
            </CardTitle>
            <CardDescription className="max-w-xl text-base">
              Your console shows your ledger as it&rsquo;s booked, your
              experiments mid-flight, the bandit heatmap, and the budget
              reservation queue. Sign in with Clerk to scope it to your runs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg" className="gap-2 bg-foreground text-background hover:bg-foreground/90">
              <Link href="/console">
                Open console <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <span>autoresearch · built for the hackathon · 2026</span>
          <span className="font-mono">terminal_goal := max($_in_stripe)</span>
        </div>
      </footer>
    </div>
  );
}
