"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { apiBaseUrl, formatSlot, type JoinParticipant, readError } from "../../../../lib/join";
import { websocketBaseUrl, parseRealtimeMessage, type RealtimeMessage } from "../../../../lib/utils";

type VoteValue = "yes" | "maybe" | "no";


export default function VotePage({ params }: { params: { token: string } }) {
  const queryClient = useQueryClient();
  const [localVotes, setLocalVotes] = React.useState<Record<string, VoteValue>>({});
  const query = useQuery({
    queryKey: ["participant", params.token],
    queryFn: () => fetchParticipant(params.token),
    refetchInterval: 30_000
  });

  const participant = query.data?.participant;
  const event = participant?.event;
  const topSuggestions = React.useMemo(() => [...(event?.suggestions ?? [])].sort((a, b) => a.rank - b.rank).slice(0, 3), [event?.suggestions]);
  const allVotesCast = topSuggestions.length > 0 && topSuggestions.every((suggestion) => localVotes[suggestion.id] ?? suggestion.votes?.[participant?.id ?? ""]);

  const voteMutation = useMutation({
    mutationFn: async ({ suggestionId, vote }: { suggestionId: string; vote: VoteValue }) => {
      const response = await fetch(`${apiBaseUrl}/api/participants/${params.token}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId, vote })
      });
      if (!response.ok) throw new Error(await readError(response));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["participant", params.token] });
    }
  });

  React.useEffect(() => {
    if (!event) return;
    const socket = new WebSocket(`${websocketBaseUrl()}/api/events/${event.id}/ws?token=${encodeURIComponent(params.token)}`);

    socket.onmessage = (message) => {
      const parsed = parseRealtimeMessage(message.data);
      if (!parsed || parsed.eventId !== event.id) return;
      if (parsed.type === "event_updated" || parsed.type === "participant_responded") {
        void queryClient.invalidateQueries({ queryKey: ["participant", params.token] });
      }
    };
    socket.onerror = () => undefined;

    return () => socket.close();
  }, [event?.id, params.token, queryClient]);

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading vote...</p> : null}
        {query.error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error.message}</p> : null}

        {participant && event ? (
          <>
            <header>
              <p className="text-sm font-medium text-primary">Voting for {event.title}</p>
              <h1 className="mt-2 text-3xl font-semibold">Pick your preferred times</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Vote on each option independently. The organizer will confirm the final time.</p>
            </header>

            {event.status === "CONFIRMED" && event.finalSlot ? (
              <Card className="border-primary/30 bg-primary/5">
                <p className="text-sm font-medium text-primary">Confirmed time</p>
                <p className="mt-2 text-2xl font-semibold">{formatSlot(event.finalSlot, event.duration)}</p>
                <a href={`${apiBaseUrl}/api/events/${event.id}/ics`} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto">
                  <CalendarPlus className="h-4 w-4" />
                  Add to Calendar
                </a>
              </Card>
            ) : null}

            {event.status !== "VOTING" && event.status !== "CONFIRMED" ? (
              <Card>
                <p className="font-medium">Voting is not open yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">You can still share or update your availability.</p>
                <Link href={`/join/${params.token}/availability`} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto">
                  Share My Availability
                </Link>
              </Card>
            ) : null}

            {event.status === "VOTING" ? (
              <div className="space-y-4">
                {topSuggestions.map((suggestion) => {
                  const selected = localVotes[suggestion.id] ?? suggestion.votes?.[participant.id];
                  const castVote = (vote: VoteValue) => {
                    setLocalVotes((current) => ({ ...current, [suggestion.id]: vote }));
                    voteMutation.mutate({ suggestionId: suggestion.id, vote });
                  };
                  return (
                    <Card key={suggestion.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <Badge>{suggestion.rank === 1 ? "#1 Best Match" : `#${suggestion.rank}`}</Badge>
                          <p className="mt-3 text-lg font-semibold">{formatSlot(suggestion.startTime, event.duration)}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {suggestion.breakdown.free?.length ?? 0} free · {suggestion.breakdown.preferred?.length ?? 0} preferred · {suggestion.breakdown.unavailable?.length ?? 0} unavailable
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 grid gap-2 sm:grid-cols-3">
                        <VoteButton label="Yes" icon="👍" selected={selected === "yes"} disabled={voteMutation.isPending} onClick={() => castVote("yes")} />
                        <VoteButton label="Maybe" icon="😐" selected={selected === "maybe"} disabled={voteMutation.isPending} onClick={() => castVote("maybe")} />
                        <VoteButton label="No" icon="👎" selected={selected === "no"} disabled={voteMutation.isPending} onClick={() => castVote("no")} />
                      </div>
                    </Card>
                  );
                })}
                {topSuggestions.length === 0 ? <p className="text-sm text-muted-foreground">No suggestions are ready yet. Check back after more availability is collected.</p> : null}
                {voteMutation.error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{voteMutation.error.message}</p> : null}
                {allVotesCast ? <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm font-medium text-primary">Thanks for voting! The organizer will confirm a time soon.</p> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function VoteButton({ label, icon, selected, disabled, onClick }: { label: string; icon: string; selected: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" className="h-12 w-full" variant={selected ? "primary" : "secondary"} disabled={disabled} onClick={onClick}>
      <span aria-hidden>{icon}</span>
      {label}
    </Button>
  );
}

async function fetchParticipant(token: string): Promise<{ participant: JoinParticipant }> {
  const response = await fetch(`${apiBaseUrl}/api/participants/${token}`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ participant: JoinParticipant }>;
}


