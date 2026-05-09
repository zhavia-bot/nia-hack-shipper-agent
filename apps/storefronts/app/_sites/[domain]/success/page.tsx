import { CheckCircle, Clock } from "@/components/icons";
import { api } from "@autodrop/convex/api";
import { Card, CardContent } from "@/components/ui/card";
import { stripeForTenant } from "@/lib/stripe";
import { convex } from "@/lib/convex";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ session_id?: string }>;
}

export default async function SuccessPage({ params, searchParams }: PageProps) {
  const { session_id } = await searchParams;
  const { domain } = await params;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-12">
      {!session_id ? (
        <NoSession />
      ) : (
        <SessionResolved sessionId={session_id} subdomain={domain} />
      )}
    </main>
  );
}

function NoSession() {
  return (
    <Card>
      <CardContent className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">No session id.</h1>
        <p className="text-sm text-muted-foreground">
          If you completed payment, please contact support.
        </p>
      </CardContent>
    </Card>
  );
}

async function SessionResolved({
  sessionId,
  subdomain,
}: {
  sessionId: string;
  subdomain: string;
}) {
  const owner = await convex().query(api.tenants.ownerStripeAccount, {
    subdomain,
  });
  if (!owner?.accountId) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <h1 className="text-xl font-semibold">Could not load your purchase.</h1>
          <p className="text-sm text-destructive">
            Tenant has no connected Stripe account.
          </p>
        </CardContent>
      </Card>
    );
  }

  let session;
  try {
    session = await stripeForTenant(owner.accountId).checkout.sessions.retrieve(
      sessionId,
    );
  } catch (err) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <h1 className="text-xl font-semibold">Could not load your purchase.</h1>
          <p className="text-sm text-destructive">
            {err instanceof Error ? err.message : String(err)}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (session.payment_status !== "paid") {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Clock className="h-7 w-7 text-amber-500" />
          <h1 className="text-xl font-semibold">Payment is processing.</h1>
          <p className="text-sm text-muted-foreground">
            Status: <strong>{session.payment_status ?? "unknown"}</strong>.
            Once Stripe clears the charge we'll issue a full refund and email
            you confirmation — nothing else for you to do.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardContent className="space-y-4 p-8 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Order received — and already refunded.
          </h1>
          <p className="text-sm text-muted-foreground">
            We've issued a full refund on your card. Stripe will send you a
            refund confirmation, and you'll get a short email from us
            explaining what happened.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Refunds typically clear in 5–10 business days, depending on your
          bank.
        </p>
      </CardContent>
    </Card>
  );
}
