import { notFound } from "next/navigation";
import { resolveTenantByHost } from "@/lib/tenant-lookup";
import { CheckoutButton } from "./checkout-button";
import type { Metadata } from "next";

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
  const headline = (t.deliverableSpec as { headline?: string } | null)?.headline;
  return { title: headline ?? t.subdomain };
}

export default async function TenantPage({ params }: PageProps) {
  const { domain } = await params;
  const tenant = await resolveTenantByHost(domain.toLowerCase());
  if (!tenant) notFound();

  // The deliverableSpec authored by the agent contains the marketing copy
  // — headline, subhead, body. The Stripe-side `unit_amount` is the source
  // of truth for the actual price; we read it via the experiment row, but
  // for v1 the deliverableSpec includes a `displayPrice` that the agent
  // sets to the same value.
  const spec = (tenant.deliverableSpec ?? {}) as {
    headline?: string;
    subhead?: string;
    body?: string;
    displayPriceUsd?: number;
    bullets?: string[];
  };

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "3rem 1.5rem 4rem",
        lineHeight: 1.55,
      }}
    >
      <h1 style={{ fontSize: "2.4rem", margin: "0 0 0.4rem" }}>
        {spec.headline ?? "Untitled"}
      </h1>
      {spec.subhead && (
        <p style={{ fontSize: "1.15rem", color: "#444", marginTop: 0 }}>
          {spec.subhead}
        </p>
      )}

      {Array.isArray(spec.bullets) && spec.bullets.length > 0 && (
        <ul style={{ paddingLeft: "1.25rem", margin: "1.25rem 0" }}>
          {spec.bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: "0.4rem" }}>
              {b}
            </li>
          ))}
        </ul>
      )}

      {spec.body && (
        <p style={{ whiteSpace: "pre-wrap", marginTop: "1.5rem" }}>
          {spec.body}
        </p>
      )}

      <div
        style={{
          marginTop: "2rem",
          padding: "1.25rem 1.5rem",
          background: "#fff",
          border: "1px solid #e5e5e3",
          borderRadius: 10,
        }}
      >
        <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          {spec.displayPriceUsd != null
            ? `$${spec.displayPriceUsd}`
            : "Get it"}
        </div>
        <div style={{ color: "#666", marginBottom: "1rem" }}>
          Instant download after checkout.
        </div>
        <CheckoutButton subdomain={tenant.subdomain} />
      </div>

      <footer
        style={{
          marginTop: "3rem",
          paddingTop: "1.25rem",
          borderTop: "1px solid #e5e5e3",
          color: "#666",
          fontSize: "0.85rem",
        }}
      >
        Refunds within 7 days, no questions asked. Email{" "}
        <a href="mailto:support@autoresearch.example">support</a> with your
        receipt.
      </footer>
    </main>
  );
}
