import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  BadgeCheck,
  Clock,
  Download,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { api } from "@autoresearch/convex/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { resolveTenantByHost } from "@/lib/tenant-lookup";
import { convex, storefrontToken } from "@/lib/convex";
import { CheckoutButton } from "./checkout-button";

interface PageProps {
  params: Promise<{ domain: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SpecShape {
  headline?: string;
  subhead?: string;
  body?: string;
  bullets?: string[];
  displayPriceUsd?: number;
  originalPriceUsd?: number;
  badges?: string[];
  rating?: number;
  ratingCount?: number;
  urgency?: string;
  whatsIncluded?: string[];
  testimonials?: Array<{ name: string; quote: string; rating?: number }>;
  heroImageUrl?: string;
  heroImageStorageId?: string;
  galleryStorageIds?: string[];
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const t = await resolveTenantByHost(domain.toLowerCase());
  if (!t) return { title: "Not found" };
  const spec = (t.deliverableSpec ?? {}) as SpecShape;
  return {
    title: spec.headline ?? t.subdomain,
    description: spec.subhead,
  };
}

async function resolveImage(storageId?: string): Promise<string | null> {
  if (!storageId) return null;
  try {
    const url = await convex().query(api.storage.getUrl, {
      token: storefrontToken(),
      storageId,
    });
    return (url as string | null) ?? null;
  } catch {
    return null;
  }
}

export default async function TenantPage({ params }: PageProps) {
  const { domain } = await params;
  const tenant = await resolveTenantByHost(domain.toLowerCase());
  if (!tenant) notFound();

  const spec = (tenant.deliverableSpec ?? {}) as SpecShape;
  const price = spec.displayPriceUsd ?? null;
  const original = spec.originalPriceUsd ?? null;
  const discountPct =
    original && price && original > price
      ? Math.round(((original - price) / original) * 100)
      : null;

  const heroFromStorage = await resolveImage(spec.heroImageStorageId);
  const heroUrl = spec.heroImageUrl ?? heroFromStorage;
  const galleryFromStorage = await Promise.all(
    (spec.galleryStorageIds ?? []).map(resolveImage)
  );
  const gallery = galleryFromStorage.filter((u): u is string => !!u);

  const rating = spec.rating ?? 4.8;
  const ratingCount = spec.ratingCount ?? 127;
  const badges = spec.badges ?? ["Instant download", "DRM-free", "Lifetime access"];

  return (
    <div className="min-h-dvh bg-background">
      {/* Announcement bar */}
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs">
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Instant download · Refund within 7 days
          </span>
          {spec.urgency && (
            <span className="hidden items-center gap-2 sm:flex">
              <Clock className="h-3.5 w-3.5" />
              {spec.urgency}
            </span>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          {/* Gallery */}
          <div className="flex flex-col gap-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
              {heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroUrl}
                  alt={spec.headline ?? tenant.subdomain}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-100 via-rose-100 to-orange-200 text-foreground/30">
                  <Sparkles className="h-12 w-12" />
                </div>
              )}
              {discountPct != null && (
                <Badge className="absolute left-4 top-4 bg-destructive text-destructive-foreground hover:bg-destructive">
                  −{discountPct}% today
                </Badge>
              )}
            </div>
            {gallery.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {gallery.slice(0, 4).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="aspect-square rounded-lg object-cover"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Buy column */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-2">
              {badges.slice(0, 4).map((b) => (
                <Badge
                  key={b}
                  variant="secondary"
                  className="rounded-full px-3 py-1 text-xs"
                >
                  {b}
                </Badge>
              ))}
            </div>

            <div>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                {spec.headline ?? "Untitled"}
              </h1>
              {spec.subhead && (
                <p className="mt-3 text-lg text-muted-foreground">
                  {spec.subhead}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Stars rating={rating} />
              <span className="font-medium">{rating.toFixed(1)}</span>
              <span className="text-muted-foreground">
                ({ratingCount.toLocaleString()} reviews)
              </span>
            </div>

            <Card className="border-2">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-bold tracking-tight">
                    {price != null ? `$${price}` : "—"}
                  </span>
                  {original && original !== price && (
                    <span className="text-xl text-muted-foreground line-through">
                      ${original}
                    </span>
                  )}
                  {discountPct != null && (
                    <Badge variant="destructive" className="ml-auto">
                      Save ${(original! - price!).toFixed(0)}
                    </Badge>
                  )}
                </div>
                <CheckoutButton subdomain={tenant.subdomain} />
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Instant download after checkout
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Secure payment via Stripe
                  </li>
                  <li className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    7-day refund, no questions asked
                  </li>
                </ul>
              </CardContent>
            </Card>

            {spec.bullets && spec.bullets.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  What you'll get
                </h2>
                <ul className="space-y-2">
                  {spec.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <TrustChip icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                256-bit SSL
              </TrustChip>
              <TrustChip icon={<RefreshCw className="h-3.5 w-3.5" />}>
                Money-back guarantee
              </TrustChip>
              <TrustChip icon={<Lock className="h-3.5 w-3.5" />}>
                Stripe-verified
              </TrustChip>
            </div>
          </div>
        </div>

        {/* Body */}
        {spec.body && (
          <>
            <Separator className="my-12" />
            <div className="mx-auto max-w-3xl">
              <h2 className="text-2xl font-semibold tracking-tight">
                About this product
              </h2>
              <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-foreground/80">
                {spec.body}
              </p>
            </div>
          </>
        )}

        {/* What's included */}
        {spec.whatsIncluded && spec.whatsIncluded.length > 0 && (
          <>
            <Separator className="my-12" />
            <div className="mx-auto max-w-3xl">
              <h2 className="text-2xl font-semibold tracking-tight">
                What's inside
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {spec.whatsIncluded.map((item, i) => (
                  <Card key={i} className="border-muted">
                    <CardContent className="flex items-center gap-3 p-4">
                      <BadgeCheck className="h-5 w-5 shrink-0 text-accent" />
                      <span className="text-sm">{item}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Testimonials */}
        {spec.testimonials && spec.testimonials.length > 0 && (
          <>
            <Separator className="my-12" />
            <div className="mx-auto max-w-4xl">
              <h2 className="text-center text-2xl font-semibold tracking-tight">
                What people are saying
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {spec.testimonials.slice(0, 6).map((t, i) => (
                  <Card key={i}>
                    <CardContent className="space-y-3 p-5">
                      {typeof t.rating === "number" && <Stars rating={t.rating} />}
                      <p className="text-sm leading-relaxed">"{t.quote}"</p>
                      <p className="text-xs font-medium text-muted-foreground">
                        — {t.name}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator className="my-12" />
        <footer className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
          <p>Refunds within 7 days, no questions asked.</p>
          <p>
            Email{" "}
            <a className="underline" href="mailto:support@autoresearch.example">
              support
            </a>{" "}
            with your receipt and we'll handle it.
          </p>
        </footer>
      </main>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i <= filled
              ? "fill-amber-400 text-amber-400"
              : "fill-muted text-muted"
          }`}
        />
      ))}
    </div>
  );
}

function TrustChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1">
      {icon}
      {children}
    </span>
  );
}
