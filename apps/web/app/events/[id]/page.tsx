"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clipboard, Clock, Vote, X } from "lucide-react";
import { useParams } from "next/navigation";
import * as React from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Progress } from "../../../components/ui/progress";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

interface OrganizerEvent {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  constraints: EventConstraintsResponse;
  status: "OPEN" | "VOTING" | "CONFIRMED" | "CANCELLED";
  finalSlot: string | null;
  participants: ParticipantSummary[];
  suggestions: SuggestionResponse[];
}

interface EventConstraintsResponse {
  windowType?: "next_n_days" | "specific_month" | "after_date" | "date_range";
  windowStart?: string;
  windowEnd?: string;
  nDays?: number;
  month?: number;
  year?: number;
  daysOfWeek?: string[];
  timeOfDay?: string;
  customStart?: string;
  customEnd?: string;
  excludeDates?: string[];
}

interface ParticipantSummary {
  id: string;
  email: string;
  name: string | null;
  responded: boolean;
}

interface SuggestionResponse {
  id: string;
  startTime: string;
  endTime: string;
  score: number;
  rank: number;
  breakdown: {
    free?: string[];
    preferred?: string[];
    available?: string[];
    unavailable?: string[];
    undesirable?: string[];
  };
  votes?: Record<string, "yes" | "no" | "maybe"> | null;
}

type RealtimeMessage = {
  type: "connected" | "event_updated" | "participant_responded";
  eventId: string;
};

export default function EventPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [copied, setCopied] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState("");
  const [live, setLive] = React.useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = React.useState<SuggestionResponse | null>(null);
  const [sendInvites, setSendInvites] = React.useState(true);

  const eventQuery = useQuery({
    queryKey: ["event", params.id],
    queryFn: () => fetchEvent(params.id),
    refetchInterval: 30_000
  });

  const pollMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiBaseUrl}/api/events/${params.id}/poll`, {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) throw new Error(await readError(response));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event", params.id] });
    }
  });

  const confirmMutation = useMutation({
    mutationFn: async (suggestion: SuggestionResponse) => {
      const response = await fetch(`${apiBaseUrl}/api/events/${params.id}/confirm`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalSlot: suggestion.startTime, sendInvites })
      });
      if (!response.ok) throw new Error(await readError(response));
    },
    onSuccess: async () => {
      setSelectedSuggestion(null);
      await queryClient.invalidateQueries({ queryKey: ["event", params.id] });
    }
  });

  const event = eventQuery.data?.event;
  const responded = event?.participants.filter((participant) => participant.responded).length ?? 0;
  const total = event?.participants.length ?? 0;
  const participantById = React.useMemo(() => new Map((event?.participants ?? []).map((participant) => [participant.id, participant])), [event?.participants]);

  React.useEffect(() => {
    setShareUrl(`${window.location.origin}/events/${params.id}`);
  }, [params.id]);

  React.useEffect(() => {
    const socket = new WebSocket(`${websocketBaseUrl()}/api/events/${params.id}/ws`);

    socket.onopen = () => setLive(true);
    socket.onclose = () => setLive(false);
    socket.onerror = () => setLive(false);
    socket.onmessage = (message) => {
      const parsed = parseRealtimeMessage(message.data);
      if (!parsed || parsed.eventId !== params.id) return;
      if (parsed.type === "connected") setLive(true);
      if (parsed.type === "event_updated" || parsed.type === "participant_responded") {
        void queryClient.invalidateQueries({ queryKey: ["event", params.id] });
      }
    };

    return () => socket.close();
  }, [params.id, queryClient]);

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-6xl">
        {eventQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading event...</p> : null}
        {eventQuery.error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{eventQuery.error.message}</p> : null}

        {event ? (
          <div className="space-y-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={event.status} />
                  <span className="text-sm text-muted-foreground">{durationLabel(event.duration)}</span>
                  {live ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      Live
                    </span>
                  ) : null}
                </div>
                <h1 className="text-3xl font-semibold">{event.title}</h1>
                {event.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{event.description}</p> : null}
                <p className="mt-3 text-sm text-muted-foreground">{constraintsSummary(event.constraints)}</p>
              </div>
              <Card className="w-full sm:w-72">
                <p className="text-sm font-medium">Shareable invite link</p>
                <div className="mt-2 flex gap-2">
                  <input readOnly value={shareUrl} className="h-9 min-w-0 flex-1 rounded-md border border-border px-2 text-xs" />
                  <Button variant="secondary" className="h-9 px-3" onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}>
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </div>
                {copied ? <p className="mt-2 text-xs text-primary">Copied</p> : null}
              </Card>
            </header>

            {event.status === "CONFIRMED" && event.finalSlot ? (
              <Card className="border-primary/30 bg-primary/5">
                <p className="text-sm font-medium text-primary">Confirmed time</p>
                <p className="mt-1 text-2xl font-semibold">{formatSlotLong(event.finalSlot, event.duration)}</p>
              </Card>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <Card>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Responses</h2>
                  <span className="text-sm font-medium">{responded} of {total}</span>
                </div>
                <Progress className="mt-4" value={total === 0 ? 0 : (responded / total) * 100} />
                <div className="mt-5 space-y-3">
                  {event.participants.map((participant) => (
                    <div key={participant.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{participant.name ?? participant.email}</p>
                        {participant.name ? <p className="truncate text-xs text-muted-foreground">{participant.email}</p> : null}
                      </div>
                      {participant.responded ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
                    </div>
                  ))}
                  {event.participants.length === 0 ? <p className="text-sm text-muted-foreground">No participants invited yet.</p> : null}
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Suggestions</h2>
                    <p className="text-sm text-muted-foreground">Ranked slots refresh live with polling as fallback.</p>
                  </div>
                  <Button disabled={pollMutation.isPending || event.suggestions.length === 0 || event.status === "CONFIRMED"} onClick={() => pollMutation.mutate()}>
                    <Vote className="h-4 w-4" />
                    Open Poll
                  </Button>
                </div>

                <div className="mt-5 space-y-4">
                  {event.suggestions.slice(0, 5).map((suggestion) => {
                    const maxScore = Math.max(...event.suggestions.map((item) => item.score), 1);
                    return (
                      <div key={suggestion.id} className="rounded-lg border border-border p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <Badge className={suggestion.rank === 1 ? "border-primary/30 bg-primary/10 text-primary" : undefined}>
                              {suggestion.rank === 1 ? "#1 Best Match" : `#${suggestion.rank}`}
                            </Badge>
                            <p className="mt-3 font-medium">{formatSlotLong(suggestion.startTime, event.duration)}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {event.participants.map((participant) => (
                                <ParticipantChip key={participant.id} participant={participant} state={breakdownState(suggestion, participant.id)} />
                              ))}
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm font-semibold">{suggestion.score.toFixed(1)}</p>
                            <p className="text-xs text-muted-foreground">score</p>
                          </div>
                        </div>
                        <Progress className="mt-4" value={(suggestion.score / maxScore) * 100} />
                        {event.status === "VOTING" ? <VoteTally suggestion={suggestion} participantById={participantById} /> : null}
                        {event.status !== "CONFIRMED" ? (
                          <Button className="mt-4" variant="secondary" onClick={() => setSelectedSuggestion(suggestion)}>
                            Confirm This Time
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                  {event.suggestions.length === 0 ? <p className="text-sm text-muted-foreground">Suggestions will appear after availability is collected and computed.</p> : null}
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </div>

      {event && selectedSuggestion ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Confirm this time?</h2>
                <p className="mt-1 text-sm text-muted-foreground">{event.title}</p>
              </div>
              <Button variant="ghost" className="h-9 px-3" onClick={() => setSelectedSuggestion(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-5 rounded-md border border-border p-4">
              <p className="text-sm text-muted-foreground">Selected slot</p>
              <p className="mt-1 text-lg font-semibold">{formatSlotLong(selectedSuggestion.startTime, event.duration)}</p>
            </div>
            <label className="mt-5 flex items-center gap-3 text-sm">
              <input type="checkbox" checked={sendInvites} onChange={(event) => setSendInvites(event.target.checked)} />
              Send calendar invites to all participants?
            </label>
            {confirmMutation.error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{confirmMutation.error.message}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSelectedSuggestion(null)}>Cancel</Button>
              <Button disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate(selectedSuggestion)}>
                Confirm Time
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

async function fetchEvent(id: string): Promise<{ event: OrganizerEvent }> {
  const response = await fetch(`${apiBaseUrl}/api/events/${id}`, { credentials: "include" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ event: OrganizerEvent }>;
}

function StatusBadge({ status }: { status: OrganizerEvent["status"] }) {
  const color = status === "CONFIRMED"
    ? "border-primary/30 bg-primary/10 text-primary"
    : status === "VOTING"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-border bg-white text-foreground";

  return <Badge className={color}>{status}</Badge>;
}

function ParticipantChip({ participant, state }: { participant: ParticipantSummary; state: "preferred" | "free" | "unavailable" }) {
  const color = state === "preferred"
    ? "bg-emerald-600 text-white"
    : state === "free"
      ? "bg-amber-400 text-amber-950"
      : "bg-red-500 text-white";

  return (
    <span title={`${participant.name ?? participant.email}: ${state}`} className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${color}`}>
      {initials(participant)}
    </span>
  );
}

function VoteTally({ suggestion, participantById }: { suggestion: SuggestionResponse; participantById: Map<string, ParticipantSummary> }) {
  const votes = Object.entries(suggestion.votes ?? {});
  const yes = votes.filter(([, vote]) => vote === "yes").length;
  const maybe = votes.filter(([, vote]) => vote === "maybe").length;
  const no = votes.filter(([, vote]) => vote === "no").length;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Yes {yes}</Badge>
      <Badge className="border-amber-200 bg-amber-50 text-amber-800">Maybe {maybe}</Badge>
      <Badge className="border-red-200 bg-red-50 text-red-800">No {no}</Badge>
      {votes.length > 0 ? <span className="text-muted-foreground">{votes.map(([id]) => participantById.get(id)?.name ?? participantById.get(id)?.email).filter(Boolean).join(", ")}</span> : null}
    </div>
  );
}

function breakdownState(suggestion: SuggestionResponse, participantId: string): "preferred" | "free" | "unavailable" {
  if (suggestion.breakdown.preferred?.includes(participantId)) return "preferred";
  if (suggestion.breakdown.free?.includes(participantId)) return "free";
  return "unavailable";
}

function initials(participant: ParticipantSummary): string {
  const label = participant.name ?? participant.email;
  const parts = label.split(/[ @._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

function constraintsSummary(constraints: EventConstraintsResponse): string {
  const days = constraints.daysOfWeek?.join(", ") ?? "all days";
  const time = constraints.timeOfDay === "custom"
    ? `${constraints.customStart ?? ""}-${constraints.customEnd ?? ""}`
    : constraints.timeOfDay ?? "any time";

  if (constraints.windowType === "next_n_days") return `Next ${constraints.nDays ?? 30} days · ${days} · ${time}`;
  if (constraints.windowType === "specific_month") return `${constraints.month ?? ""}/${constraints.year ?? ""} · ${days} · ${time}`;
  if (constraints.windowType === "after_date") return `After ${constraints.windowStart ?? "selected date"} · ${days} · ${time}`;
  if (constraints.windowType === "date_range") return `${constraints.windowStart ?? "Start"} to ${constraints.windowEnd ?? "End"} · ${days} · ${time}`;
  return `${days} · ${time}`;
}

function durationLabel(minutes: number): string {
  if (minutes === 30) return "30 min";
  if (minutes === 60) return "1 hr";
  if (minutes === 90) return "1.5 hr";
  if (minutes === 240) return "Half-day";
  if (minutes === 480) return "Full-day";
  return minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`;
}

function formatSlotLong(start: string, duration: number): string {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + duration * 60_000);
  const date = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(startDate);
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(startDate);
  const end = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(endDate);
  return `${date} · ${time} - ${end}`;
}

function websocketBaseUrl(): string {
  const base = apiBaseUrl || window.location.origin;
  return base.replace(/^http/, "ws");
}

function parseRealtimeMessage(data: unknown): RealtimeMessage | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as Partial<RealtimeMessage>;
    if (typeof parsed.type !== "string" || typeof parsed.eventId !== "string") return null;
    if (!["connected", "event_updated", "participant_responded"].includes(parsed.type)) return null;
    return parsed as RealtimeMessage;
  } catch {
    return null;
  }
}

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "Request failed";
}
