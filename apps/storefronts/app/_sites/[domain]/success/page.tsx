import { stripe } from "@/lib/stripe";
import { mintDeliverToken } from "@/lib/deliver-token";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
}

/**
 * Stripe `success_url` redirect target. Server-renders a page with a
 * single-click download link to `/api/deliver/<token>`. The token is
 * HMAC-signed on this server; the deliver route re-confirms
 * `payment_status === "paid"` before streaming bytes.
 */
export default async function SuccessPage({ searchParams }: PageProps) {
  const { session_id } = await searchParams;
  if (!session_id) {
    return (
      <main style={containerStyle}>
        <h1>Hmm — no session id.</h1>
        <p>If you completed payment, please contact support.</p>
      </main>
    );
  }

  let session;
  try {
    session = await stripe().checkout.sessions.retrieve(session_id);
  } catch (err) {
    return (
      <main style={containerStyle}>
        <h1>Could not load your purchase.</h1>
        <p>{err instanceof Error ? err.message : String(err)}</p>
      </main>
    );
  }

  if (session.payment_status !== "paid") {
    return (
      <main style={containerStyle}>
        <h1>Payment is processing.</h1>
        <p>
          Status: <strong>{session.payment_status ?? "unknown"}</strong>. Refresh
          this page in a minute or check your email — we'll send the download
          link as soon as it clears.
        </p>
      </main>
    );
  }

  const experimentId =
    session.client_reference_id ?? session.metadata?.["experimentId"];
  if (!experimentId) {
    return (
      <main style={containerStyle}>
        <h1>Receipt OK — but we lost the attribution.</h1>
        <p>Email support with this session id: {session_id}</p>
      </main>
    );
  }

  const token = mintDeliverToken({
    sessionId: session_id,
    experimentId,
  });

  return (
    <main style={containerStyle}>
      <h1>Thanks — your download is ready.</h1>
      <p>This link is valid for 7 days, single-click download.</p>
      <a
        href={`/api/deliver/${encodeURIComponent(token)}`}
        style={{
          display: "inline-block",
          marginTop: "1.25rem",
          padding: "0.75rem 1.25rem",
          background: "#111",
          color: "#fff",
          textDecoration: "none",
          borderRadius: 8,
          fontWeight: 600,
        }}
      >
        Download
      </a>
      <p style={{ marginTop: "2rem", color: "#666", fontSize: "0.9rem" }}>
        Refunds within 7 days, no questions asked.
      </p>
    </main>
  );
}

const containerStyle = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "3rem 1.5rem",
  lineHeight: 1.55,
} as const;
