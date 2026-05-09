import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center p-6">
      <Card>
        <CardContent className="space-y-2 p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
          <p className="text-sm text-muted-foreground">
            This page is gone, or never was. Try a different link.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
