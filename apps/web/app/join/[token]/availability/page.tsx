"use client";

import type { TimeInterval } from "@rally/shared";
import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Edit3 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { AvailabilityGrid } from "../../../../components/AvailabilityGrid";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Progress } from "../../../../components/ui/progress";
import { apiBaseUrl, invertBusySlots, readError, slotsForParticipant, type JoinParticipant, windowBounds } from "../../../../lib/join";

type AvailabilitySource = "manual" | "google" | "outlook";

export default function AvailabilityPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const calendarConnected = searchParams.get("calendarConnected") === "true";
  const provider = searchParams.get("provider") === "outlook" ? "outlook" : "google";
  const [manualOpen, setManualOpen] = React.useState(false);
  const [availability, setAvailability] = React.useState<TimeInterval[]>([]);
  const [initialAvailability, setInitialAvailability] = React.useState<TimeInterval[] | undefined>(undefined);
  const [source, setSource] = React.useState<AvailabilitySource>("manual");
  const [success, setSuccess] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const participantQuery = useQuery({
    queryKey: ["participant", params.token],
    queryFn: () => fetchParticipant(params.token)
  });

  const participant = participantQuery.data?.participant;
  const slots = React.useMemo(() => participant ? slotsForParticipant(participant) : [], [participant]);
  const handleGridChange = React.useCallback((value: TimeInterval[]) => setAvailability(value), []);

  React.useEffect(() => {
    if (!participant || !calendarConnected) return;
    const bounds = windowBounds(slots);
    if (!bounds) return;

    let cancelled = false;
    async function loadCalendarAvailability() {
      setError(null);
      try {
        const endpoint = provider === "outlook" ? "/api/calendar/outlook/freebusy" : "/api/calendar/freebusy";
        const response = await fetch(`${apiBaseUrl}${endpoint}?start=${encodeURIComponent(bounds.start)}&end=${encodeURIComponent(bounds.end)}`, { credentials: "include" });
        if (!response.ok) throw new Error(await readError(response));
        const payload = await response.json() as { busy: TimeInterval[]; source: "google" | "outlook" | "none"; message?: string };
        if (cancelled) return;
        const nextAvailability = payload.source === "none" ? [] : invertBusySlots(slots, payload.busy);
        setInitialAvailability(nextAvailability);
        setAvailability(nextAvailability);
        setSource(payload.source === "outlook" ? "outlook" : payload.source === "google" ? "google" : "manual");
        setManualOpen(true);
        setSuccess(payload.source === "none" ? payload.message ?? "No calendar connected. Enter your availability manually." : "Calendar connected! We found your availability below. Review and adjust if needed.");
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load calendar availability");
      }
    }

    void loadCalendarAvailability();
    return () => {
      cancelled = true;
    };
  }, [calendarConnected, participant, provider, slots]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/participants/${params.token}/availability`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ availability, source })
      });
      if (!response.ok) throw new Error(await readError(response));
      router.push(`/join/${params.token}/preferences`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save availability");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-sm font-medium text-primary">Step 1 of 2</p>
          <h1 className="mt-1 text-3xl font-semibold">Share availability</h1>
          <Progress className="mt-4 max-w-md" value={50} />
        </header>

        {participantQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading event...</p> : null}
        {participantQuery.error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{participantQuery.error.message}</p> : null}
        {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div> : null}
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        {participant ? (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <Card className="space-y-4">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-semibold">Connect Google Calendar</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Import busy times from your primary calendar.</p>
                </div>
                <a href={`${apiBaseUrl}/api/auth/google/calendar-connect?token=${encodeURIComponent(params.token)}`} className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  Connect Google Calendar
                </a>
              </Card>

              <Card className="space-y-4">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-semibold">Connect Outlook Calendar</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Use Microsoft Calendar free/busy data.</p>
                </div>
                <a href={`${apiBaseUrl}/api/auth/microsoft/connect?token=${encodeURIComponent(params.token)}`} className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                  Connect Outlook Calendar
                </a>
              </Card>

              <Card className="space-y-4">
                <Edit3 className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-semibold">Enter manually</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Select the times that work for you.</p>
                </div>
                <Button type="button" variant="secondary" className="w-full" onClick={() => {
                  setManualOpen((value) => !value);
                  setSource("manual");
                }}>
                  {manualOpen ? "Hide manual grid" : "Enter manually"}
                </Button>
              </Card>
            </section>

            {manualOpen ? (
              <Card className="space-y-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{participant.event.title}</h2>
                    <p className="text-sm text-muted-foreground">Click and drag across every time you can attend.</p>
                  </div>
                  <p className="text-sm font-medium">{availability.length} available blocks selected</p>
                </div>
                <div className="overflow-x-auto">
                  <AvailabilityGrid slots={slots} initialAvailability={initialAvailability} onChange={handleGridChange} />
                </div>
                <div className="flex justify-end">
                  <Button type="button" className="w-full sm:w-auto" disabled={submitting || availability.length === 0} onClick={submit}>
                    <CheckCircle2 className="h-4 w-4" />
                    {submitting ? "Saving..." : "Confirm Availability"}
                  </Button>
                </div>
              </Card>
            ) : null}
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
