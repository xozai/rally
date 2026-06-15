"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Clock, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { apiBaseUrl, constraintsSummary, durationLabel, formatSlot, type JoinParticipant, readError } from "../../../lib/join";

export default function JoinPage({ params }: { params: { token: string } }) {
  const [declined, setDeclined] = React.useState(false);
  const query = useQuery({
    queryKey: ["participant", params.token],
    queryFn: () => fetchParticipant(params.token)
  });

  const participant = query.data?.participant;
  const event = participant?.event;

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading invite...</p> : null}
        {query.error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error.message}</p> : null}

        {event ? (
          <>
            <header>
              <p className="text-sm font-medium text-primary">Rally invite from {event.organizerName}</p>
              <h1 className="mt-2 text-3xl font-semibold">{event.title}</h1>
              {event.description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{event.description}</p> : null}
            </header>

            {event.status === "CONFIRMED" && event.finalSlot ? (
              <Card className="border-primary/30 bg-primary/5">
                <p className="text-sm font-medium text-primary">Confirmed time</p>
                <p className="mt-2 text-2xl font-semibold">{formatSlot(event.finalSlot, event.duration)}</p>
                <a href={`${apiBaseUrl}/api/events/${event.id}/ics`} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  <CalendarPlus className="h-4 w-4" />
                  Add to Calendar
                </a>
              </Card>
            ) : (
              <>
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
                        <p className="font-medium">{event.responseCount} people have already shared their availability</p>
                        <p className="text-sm text-muted-foreground">{event.participantCount} invited</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {declined ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Thanks for letting us know. Decline tracking is not wired up yet, so you can simply close this invite.
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link href={`/join/${params.token}/availability`} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                    Share My Availability
                  </Link>
                  <Button type="button" variant="secondary" onClick={() => setDeclined(true)}>I Can't Make It</Button>
                </div>
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
