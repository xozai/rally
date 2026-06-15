"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Card } from "../../../../components/ui/card";
import { apiBaseUrl, formatSlot, readError, type JoinParticipant } from "../../../../lib/join";

export default function DonePage({ params }: { params: { token: string } }) {
  const query = useQuery({
    queryKey: ["participant", params.token],
    queryFn: () => fetchParticipant(params.token)
  });

  const participant = query.data?.participant;
  const event = participant?.event;

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading summary...</p> : null}
        {query.error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error.message}</p> : null}

        {participant && event ? (
          <>
            <header className="space-y-3">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <h1 className="text-3xl font-semibold">You're all set!</h1>
              <p className="text-sm leading-6 text-muted-foreground">
                We'll notify you when {event.organizerName} picks a time.
              </p>
            </header>

            <Card className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Event</p>
                <h2 className="text-xl font-semibold">{event.title}</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Summary label="Availability submitted" value={`${participant.availability.length} blocks`} />
                <Summary label="Other respondents" value={`${Math.max(0, event.responseCount - (participant.responded ? 1 : 0))}`} />
              </div>
              <Link href={`/join/${params.token}/availability`} className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                Update my availability
              </Link>
            </Card>

            {event.status === "CONFIRMED" && event.finalSlot ? (
              <Card className="border-primary/30 bg-primary/5">
                <p className="text-sm font-medium text-primary">Confirmed time</p>
                <p className="mt-2 text-2xl font-semibold">{formatSlot(event.finalSlot, event.duration)}</p>
                <a href={`${apiBaseUrl}/api/events/${event.id}/ics`} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  <CalendarPlus className="h-4 w-4" />
                  Add to Calendar
                </a>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

async function fetchParticipant(token: string): Promise<{ participant: JoinParticipant }> {
  const response = await fetch(`${apiBaseUrl}/api/participants/${token}`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ participant: JoinParticipant }>;
}
