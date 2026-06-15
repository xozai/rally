"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { apiBaseUrl, formatSlot, readError, type JoinParticipant } from "../../../../lib/join";

type RsvpValue = "attending" | "declined" | "maybe";

export default function DonePage({ params }: { params: { token: string } }) {
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);
  const [deleted, setDeleted] = React.useState(false);

  const query = useQuery({
    queryKey: ["participant", params.token],
    queryFn: () => fetchParticipant(params.token)
  });

  const rsvpMutation = useMutation({
    mutationFn: async (rsvp: RsvpValue) => {
      const response = await fetch(`${apiBaseUrl}/api/participants/${params.token}/rsvp`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rsvp })
      });
      if (!response.ok) throw new Error(await readError(response));
      return response.json() as Promise<{ participant: { rsvp: string | null } }>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["participant", params.token] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiBaseUrl}/api/participants/${params.token}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error(await readError(response));
      return response.json() as Promise<{ message: string }>;
    },
    onSuccess: () => {
      setDeleted(true);
      setDeleteConfirm(false);
    }
  });

  const participant = query.data?.participant;
  const event = participant?.event;
  const currentRsvp = (participant as (JoinParticipant & { rsvp?: string | null }) | undefined)?.rsvp;

  if (deleted) {
    return (
      <main className="min-h-screen px-6 py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <Card className="space-y-3">
            <Trash2 className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Data deleted</h1>
            <p className="text-sm text-muted-foreground">
              Your availability, preferences, and personal details have been removed from this Rally.
            </p>
          </Card>
        </div>
      </main>
    );
  }

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

            {/* #29 — RSVP section */}
            <Card className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Your RSVP</h2>
                <p className="text-sm text-muted-foreground">Let the organizer know your attendance intent.</p>
              </div>
              {rsvpMutation.error ? (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{rsvpMutation.error.message}</p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {(["attending", "maybe", "declined"] as RsvpValue[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={rsvpMutation.isPending}
                    onClick={() => rsvpMutation.mutate(value)}
                    className={`rounded-md border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                      currentRsvp === value
                        ? value === "attending"
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                          : value === "declined"
                            ? "border-red-300 bg-red-50 text-red-800"
                            : "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-border bg-white text-foreground hover:bg-muted"
                    }`}
                  >
                    {value === "attending" ? "✓ Attending" : value === "maybe" ? "? Maybe" : "✗ Can't make it"}
                    {currentRsvp === value ? " ✓" : ""}
                  </button>
                ))}
              </div>
              {currentRsvp ? (
                <p className="text-xs text-muted-foreground">
                  Current RSVP: <span className="font-medium capitalize">{currentRsvp}</span>
                </p>
              ) : null}
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

            {/* #34 — GDPR delete */}
            <Card className="border-border">
              <h2 className="text-sm font-semibold text-muted-foreground">Privacy</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                You can delete all your personal data from this Rally at any time (GDPR right to erasure).
              </p>
              {!deleteConfirm ? (
                <Button
                  variant="secondary"
                  className="mt-3 text-red-600 hover:bg-red-50"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete my data
                </Button>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-sm font-medium text-red-700">
                    This will permanently erase your availability, preferences, name, and email from this Rally. This cannot be undone.
                  </p>
                  {deleteMutation.error ? (
                    <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{deleteMutation.error.message}</p>
                  ) : null}
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate()}
                      className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? "Deleting..." : "Yes, delete my data"}
                    </button>
                  </div>
                </div>
              )}
            </Card>
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
