"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

interface DashboardEvent {
  id: string;
  title: string;
  status: "OPEN" | "VOTING" | "CONFIRMED" | "CANCELLED";
  createdAt: string;
  responseCount: number;
  participantCount: number;
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents
  });

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Your events</p>
            <h1 className="text-3xl font-semibold">Dashboard</h1>
          </div>
          <Link href="/events/new" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto">
            <CalendarPlus className="h-4 w-4" />
            Create New Rally
          </Link>
        </header>

        {isLoading ? <p className="mt-10 text-sm text-muted-foreground">Loading events...</p> : null}
        {error ? <p className="mt-10 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error.message}</p> : null}

        {!isLoading && data?.events.length === 0 ? (
          <section className="mt-10 rounded-lg border border-dashed border-border bg-white p-10 text-center">
            <h2 className="text-xl font-semibold">No active Rally events yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Create your first event to invite friends, collect availability, and see ranked time suggestions.
            </p>
            <Link href="/events/new" className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto">
              <CalendarPlus className="h-4 w-4" />
              Create New Rally
            </Link>
          </section>
        ) : null}

        {data && data.events.length > 0 ? (
          <section className="mt-8 grid gap-4 md:grid-cols-2">
            {data.events.map((event) => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <Card className="h-full transition-colors hover:bg-muted/60">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold">{event.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Created {formatDate(event.createdAt)}</p>
                    </div>
                    <StatusBadge status={event.status} />
                  </div>
                  <p className="mt-5 text-sm font-medium">{event.responseCount}/{event.participantCount} responses</p>
                </Card>
              </Link>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}

async function fetchEvents(): Promise<{ events: DashboardEvent[] }> {
  const response = await fetch(`${apiBaseUrl}/api/events`, { credentials: "include" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ events: DashboardEvent[] }>;
}

function StatusBadge({ status }: { status: DashboardEvent["status"] }) {
  const color = status === "CONFIRMED"
    ? "border-primary/30 bg-primary/10 text-primary"
    : status === "VOTING"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-border bg-white text-foreground";

  return <Badge className={color}>{status}</Badge>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "Request failed";
}
