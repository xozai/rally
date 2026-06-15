"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, CalendarPlus, Clock, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { apiBaseUrl, constraintsSummary, durationLabel, formatSlot, type JoinParticipant, readError } from "../../../lib/join";

function StatusBadge({ status }: { status: string }) {
  const color = status === "CONFIRMED"
    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
    : status === "VOTING"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-border bg-white text-foreground";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${color}`}>
      {status}
    </span>
  );
}

export default function JoinPage({ params }: { params: { token: string } }) {
  const [rsvpPending, setRsvpPending] = React.useState(false);
  const [declined, setDeclined] = React.useState(false);
  const [rsvpError, setRsvpError] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: ["participant", params.token],
    queryFn: () => fetchParticipant(params.token)
  });

  const participant = query.data?.participant;
  const event = participant?.event;

  async function handleDecline() {
    setRsvpPending(true);
    setRsvpError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/participants/${params.token}/rsvp`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rsvp: "declined" })
      });
      if (!response.ok) throw new Error(await readError(response));
      setDeclined(true);
    } catch (caught) {
      setRsvpError(caught instanceof Error ? caught.message : "Unable to update RSVP");
    } finally {
      setRsvpPending(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading invite...</p> : null}
        {query.error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error.message}</p> : null}

        {event ? (
          <>
            <header>
              <p className="text-sm font-medium text-primary">Rally invite from {event.organizerName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold">{event.title}</h1>
                <StatusBadge status={event.status} />
              </div>
              {event.description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{event.description}</p> : null}
            </header>

            {/* Status: CONFIRMED */}
            {event.status === "CONFIRMED" && event.finalSlot ? (
              <Card className="border-emerald-300 bg-emerald-50 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800">
                  <CalendarCheck2 className="h-5 w-5" />
                  <p className="font-semibold">Time confirmed!</p>
                </div>
                <p className="text-2xl font-semibold text-emerald-900">{formatSlot(event.finalSlot, event.duration)}</p>
                <a href={`${apiBaseUrl}/api/events/${event.id}/ics`} className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-800">
                  <CalendarPlus className="h-4 w-4" />
                  Add to Calendar
                </a>
              </Card>
            ) : (
              <>
                {/* Response counts + event info */}
                <Card className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex gap-3">
                      <Clock className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{durationLabel(event.duration)}</p>
                        <p className="text-sm text-muted-foreground">{constraintsSummary(event.constraints)}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Users className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{event.responseCount} of {event.participantCount} have responded</p>
                        <p className="text-sm text-muted-foreground">{event.participantCount} invited</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {rsvpError ? (
                  <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{rsvpError}</p>
                ) : null}

                {declined ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Thanks for letting us know — you've been marked as unable to attend. You can still share your availability if your plans change.
                  </div>
                ) : null}

                {event.status === "VOTING" ? (
                  <Card className="border-amber-200 bg-amber-50">
                    <p className="font-medium text-amber-900">The organizer has opened voting! Pick your preferred times.</p>
                    <Link href={`/join/${params.token}/vote`} className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                      Vote Now
                    </Link>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link href={`/join/${params.token}/availability`} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                      Share My Availability
                    </Link>
                    {!declined ? (
                      <Button type="button" variant="secondary" disabled={rsvpPending} onClick={handleDecline}>
                        {rsvpPending ? "Updating..." : "I Can't Make It"}
                      </Button>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}

async function fetchParticipant(token: string): Promise<{ participant: JoinParticipant }> {
  const response = await fetch(`${apiBaseUrl}/api/participants/${token}`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ participant: JoinParticipant }>;
}
