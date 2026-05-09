import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  BadgeCheck,
  Clock,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { api } from "@autoresearch/convex/api";
import { Badge } from "@/components/ui/badge";
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

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const t = await resolveTenantByHost(domain.toLowerCase());
  if (!t) return { title: "Not found" };
  return {
    title: t.displayCopy.headline,
    description: t.displayCopy.subhead,
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

  const headline = tenant.displayCopy.headline;
  const subhead = tenant.displayCopy.subhead;
  const bullets = tenant.displayCopy.bullets;
  const price = tenant.displayPriceUsd;
  const original = tenant.productSource.originalPriceUsd;
  const discountPct =
    original > price ? Math.round(((original - price) / original) * 100) : null;

  const [heroId, ...galleryIds] = tenant.adCreativeStorageIds;
  const heroFromStorage = await resolveImage(heroId);
  const heroUrl = heroFromStorage;
  const galleryFromStorage = await Promise.all(galleryIds.map(resolveImage));
  const gallery = galleryFromStorage.filter((u): u is string => !!u);

  const rating = 4.8;
  const ratingCount = 127;
  const badges = ["Free shipping", "7-day refund", "Stripe-verified"];

  return (
    <div className="min-h-dvh bg-background">
      {/* Announcement bar */}
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs">
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Free shipping · 7-day refund
          </span>
          <span className="hidden items-center gap-2 sm:flex">
            <Clock className="h-3.5 w-3.5" />
            Limited stock
          </span>
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
                  alt={headline}
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
                {headline}
              </h1>
              {subhead && (
                <p className="mt-3 text-lg text-muted-foreground">
                  {subhead}
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
                    ${price}
                  </span>
                  {original > price && (
                    <span className="text-xl text-muted-foreground line-through">
                      ${original}
                    </span>
                  )}
                  {discountPct != null && (
                    <Badge variant="destructive" className="ml-auto">
                      Save ${(original - price).toFixed(0)}
                    </Badge>
                  )}
                </div>
                <CheckoutButton subdomain={tenant.subdomain} />
                <ul className="space-y-1.5 text-sm text-muted-foreground">
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

            {bullets.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  What's in the box
                </h2>
                <ul className="space-y-2">
                  {bullets.map((b, i) => (
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
