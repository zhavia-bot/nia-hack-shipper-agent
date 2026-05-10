import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ExperimentDetail } from "./experiment-detail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExperimentDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild size="sm" variant="ghost" className="gap-1">
          <Link href="/console/experiments">
            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
            All experiments
          </Link>
        </Button>
      </div>
      <ExperimentDetail id={id} />
    </main>
  );
}
