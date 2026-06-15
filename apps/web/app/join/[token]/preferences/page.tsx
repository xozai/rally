"use client";

import type { PreferenceBlock, SlotPreference, TimeInterval } from "@rally/shared";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { AvailabilityGrid } from "../../../../components/AvailabilityGrid";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Progress } from "../../../../components/ui/progress";
import { apiBaseUrl, expandIntervals, readError, slotsForParticipant, type JoinParticipant } from "../../../../lib/join";

const ratings: SlotPreference[] = ["available", "preferred", "rather_not"];

export default function PreferencesPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [ratingBySlot, setRatingBySlot] = React.useState<Record<string, SlotPreference>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const participantQuery = useQuery({
    queryKey: ["participant", params.token],
    queryFn: () => fetchParticipant(params.token)
  });

  const participant = participantQuery.data?.participant;
  const slots = React.useMemo(() => participant ? slotsForParticipant(participant) : [], [participant]);
  const availableSlots = React.useMemo(() => participant ? expandIntervals(participant.availability, slots) : new Set<string>(), [participant, slots]);
  const noop = React.useCallback((_availability: TimeInterval[]) => undefined, []);

  React.useEffect(() => {
    if (!participant) return;
    const initial: Record<string, SlotPreference> = {};
    for (const slot of availableSlots) {
      initial[slot] = participant.preferences.find((preference) => containsSlot(preference, slot))?.rating ?? "available";
    }
    setRatingBySlot(initial);
  }, [availableSlots, participant]);

  function cycleRating(slot: string) {
    setRatingBySlot((current) => {
      const currentRating = current[slot] ?? "available";
      const next = ratings[(ratings.indexOf(currentRating) + 1) % ratings.length] ?? "available";
      return { ...current, [slot]: next };
    });
  }

  async function submit() {
    const preferences: PreferenceBlock[] = [...availableSlots].sort().map((slot) => ({
      start: slot,
      end: new Date(new Date(slot).getTime() + 30 * 60_000).toISOString(),
      rating: ratingBySlot[slot] ?? "available"
    }));

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/participants/${params.token}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences })
      });
      if (!response.ok) throw new Error(await readError(response));
      router.push(`/join/${params.token}/done`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save preferences");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-sm font-medium text-primary">Step 2 of 2</p>
          <h1 className="mt-1 text-3xl font-semibold">Set preferences</h1>
          <Progress className="mt-4 max-w-md" value={100} />
        </header>

        {participantQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading availability...</p> : null}
        {participantQuery.error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{participantQuery.error.message}</p> : null}
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        {participant ? (
          <Card className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{participant.event.title}</h2>
                <p className="text-sm text-muted-foreground">Click each available slot to cycle through your preference.</p>
              </div>
              <p className="text-sm font-medium">{availableSlots.size} available slots</p>
            </div>

            {availableSlots.size === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No availability has been submitted yet. Go back and choose the times that work for you.
              </div>
            ) : (
              <AvailabilityGrid
                slots={slots}
                initialAvailability={participant.availability}
                onChange={noop}
                readOnly
                slotClassName={(slot, selected) => selected ? ratingClass(ratingBySlot[slot] ?? "available") : ""}
                renderSlot={(slot, selected) => selected ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      cycleRating(slot);
                    }}
                    className="absolute inset-1 flex items-center justify-center rounded text-[11px] font-medium"
                  >
                    {ratingLabel(ratingBySlot[slot] ?? "available")}
                  </button>
                ) : null}
              />
            )}

            <div className="flex justify-between gap-3">
              <Button type="button" variant="secondary" onClick={() => router.push(`/join/${params.token}/availability`)}>Back</Button>
              <Button type="button" disabled={submitting || availableSlots.size === 0} onClick={submit}>
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? "Submitting..." : "Submit Preferences"}
              </Button>
            </div>
          </Card>
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

function containsSlot(interval: TimeInterval, slot: string): boolean {
  const start = new Date(slot).getTime();
  const end = start + 30 * 60_000;
  return new Date(interval.start).getTime() <= start && new Date(interval.end).getTime() >= end;
}

function ratingLabel(rating: SlotPreference): string {
  if (rating === "preferred") return "Preferred";
  if (rating === "rather_not") return "Rather Not";
  return "Available";
}

function ratingClass(rating: SlotPreference): string {
  if (rating === "preferred") return "bg-emerald-200 text-emerald-950";
  if (rating === "rather_not") return "bg-red-100 text-red-900";
  return "bg-slate-100 text-slate-800";
}
