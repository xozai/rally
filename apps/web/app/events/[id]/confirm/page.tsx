"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Clipboard } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { apiBaseUrl, formatSlot, readError } from "../../../../lib/join";

interface ConfirmEvent {
  id: string;
  title: string;
  duration: number;
  status: "OPEN" | "VOTING" | "CONFIRMED" | "CANCELLED";
  finalSlot: string | null;
  participants: Array<{
    id: string;
    email: string;
    name: string | null;
    responded: boolean;
  }>;
}

export default function ConfirmEventPage({ params }: { params: { id: string } }) {
  const [copied, setCopied] = React.useState(false);
  const [eventUrl, setEventUrl] = React.useState("");
  const query = useQuery({
    queryKey: ["event", params.id],
    queryFn: () => fetchEvent(params.id)
  });

  const event = query.data?.event;

  React.useEffect(() => {
    setEventUrl(`${window.location.origin}/events/${params.id}`);
  }, [params.id]);

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading confirmation...</p> : null}
        {query.error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error.message}</p> : null}

        {event ? (
          <>
            <header>
              <p className="text-sm font-medium text-primary">Rally confirmed! 🎉</p>
              <h1 className="mt-2 text-3xl font-semibold">{event.title}</h1>
            </header>

            {event.status === "CONFIRMED" && event.finalSlot ? (
              <Card className="border-primary/30 bg-primary/5">
                <p className="text-sm font-medium text-primary">Confirmed time</p>
                <p className="mt-2 text-2xl font-semibold">{formatSlot(event.finalSlot, event.duration)}</p>
                <a href={`${apiBaseUrl}/api/events/${event.id}/ics`} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  <CalendarPlus className="h-4 w-4" />
                  Download .ics
                </a>
              </Card>
            ) : (
              <Card>
                <p className="font-medium">This event is not confirmed yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">Choose a suggested time from the event page first.</p>
              </Card>
            )}

            <Card>
              <h2 className="text-lg font-semibold">Participants</h2>
              <div className="mt-4 divide-y divide-border">
                {event.participants.map((participant) => (
                  <div key={participant.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{participant.name ?? participant.email}</p>
                      {participant.name ? <p className="truncate text-xs text-muted-foreground">{participant.email}</p> : null}
                    </div>
                    <span className={participant.responded ? "text-primary" : "text-muted-foreground"}>
                      {participant.responded ? "Responded" : "Waiting"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={`/events/${event.id}`} className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                Back to Event
              </Link>
              <Button variant="secondary" onClick={async () => {
                await navigator.clipboard.writeText(eventUrl);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}>
                <Clipboard className="h-4 w-4" />
                Share
              </Button>
              {copied ? <span className="self-center text-sm text-primary">Copied</span> : null}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

async function fetchEvent(id: string): Promise<{ event: ConfirmEvent }> {
  const response = await fetch(`${apiBaseUrl}/api/events/${id}`, { credentials: "include" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ event: ConfirmEvent }>;
}
