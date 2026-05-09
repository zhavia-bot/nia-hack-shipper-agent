import Link from "next/link";
import { CheckCircle2, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { stripe } from "@/lib/stripe";
import { mintDeliverToken } from "@/lib/deliver-token";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function SuccessPage({ searchParams }: PageProps) {
  const { session_id } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-12">
      {!session_id ? (
        <NoSession />
      ) : (
        <SessionResolved sessionId={session_id} />
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

async function SessionResolved({ sessionId }: { sessionId: string }) {
  let session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId);
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
            Refresh in a minute or check your email — we'll send the download
            link as soon as it clears.
          </p>
        </CardContent>
      </Card>
    );
  }

  const experimentId =
    session.client_reference_id ?? session.metadata?.["experimentId"];
  if (!experimentId) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <h1 className="text-xl font-semibold">Receipt OK.</h1>
          <p className="text-sm text-muted-foreground">
            But we lost the attribution. Email support with this session id:{" "}
            <code>{sessionId}</code>
          </p>
        </CardContent>
      </Card>
    );
  }

  const token = mintDeliverToken({ sessionId, experimentId });

  return (
    <Card className="border-2">
      <CardContent className="space-y-4 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Thanks — your download is ready.
          </h1>
          <p className="text-sm text-muted-foreground">
            This link is valid for 7 days. Save the file somewhere safe.
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href={`/api/deliver/${encodeURIComponent(token)}`}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Refunds within 7 days, no questions asked.
        </p>
      </CardContent>
    </Card>
  );
}
