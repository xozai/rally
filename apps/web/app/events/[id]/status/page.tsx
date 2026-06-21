import Link from "next/link";
import { StatusBadge } from "../../../../components/StatusBadge";
import { Card } from "../../../../components/ui/card";
import { Progress } from "../../../../components/ui/progress";
import { apiUrl } from "../../../../lib/utils";
import { constraintsSummary, durationLabel } from "../../../../lib/join";
import type { EventConstraints } from "@rally/shared";

interface HeatmapSlot {
  slot: string;
  score: number;
}

interface EventStatusResponse {
  eventId: string;
  title: string;
  status: "OPEN" | "VOTING" | "CONFIRMED" | "CANCELLED";
  duration: number;
  constraints: EventConstraints;
  totalParticipants: number;
  respondedCount: number;
  aggregateHeatmap: HeatmapSlot[];
}

async function fetchEventStatus(id: string): Promise<EventStatusResponse | null> {
  try {
    const res = await fetch(`${apiUrl}/api/events/${id}/status`, {
      next: { revalidate: 30 }
    });
    if (!res.ok) return null;
    return res.json() as Promise<EventStatusResponse>;
  } catch {
    return null;
  }
}

// Build a grid from heatmap slots for rendering
function buildHeatmapGrid(heatmap: HeatmapSlot[]): {
  dates: string[];
  times: string[];
  lookup: Map<string, number>;
} {
  const dateSet = new Set<string>();
  const timeSet = new Set<string>();
  const lookup = new Map<string, number>();

  for (const { slot, score } of heatmap) {
    const date = new Date(slot);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const timeKey = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    dateSet.add(dateKey);
    timeSet.add(timeKey);
    lookup.set(`${dateKey}|${timeKey}`, score);
  }

  return {
    dates: [...dateSet].sort(),
    times: [...timeSet].sort(),
    lookup
  };
}

function scoreToColor(score: number): string {
  if (score === 0) return "bg-muted/40";
  if (score < 0.25) return "bg-emerald-100";
  if (score < 0.5) return "bg-emerald-200";
  if (score < 0.75) return "bg-emerald-400";
  return "bg-emerald-600";
}

function formatDateHeader(dateKey: string): string {
  const [year = "0", month = "1", day = "1"] = dateKey.split("-");
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function formatTimeLabel(timeKey: string): string {
  const [hours = "0", minutes = "0"] = timeKey.split(":");
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(2026, 0, 1, Number(hours), Number(minutes)));
}

export default async function EventStatusPage({
  params
}: {
  params: { id: string };
}) {
  const data = await fetchEventStatus(params.id);

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-semibold">Event not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This event may have expired or been removed.
          </p>
        </div>
      </main>
    );
  }

  const {
    title,
    status,
    duration,
    constraints,
    totalParticipants,
    respondedCount,
    aggregateHeatmap
  } = data;

  const progressPct = totalParticipants > 0 ? (respondedCount / totalParticipants) * 100 : 0;
  const grid = aggregateHeatmap.length > 0 ? buildHeatmapGrid(aggregateHeatmap) : null;

  // Show at most 14 date columns at a time (same as AvailabilityGrid)
  const visibleDates = grid ? grid.dates.slice(0, 14) : [];

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-sm text-muted-foreground">{durationLabel(duration)}</span>
          </div>
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {constraintsSummary(constraints)}
          </p>
          <p className="text-xs text-muted-foreground">
            Public status page · Read-only ·{" "}
            <Link
              href={`/events/${data.eventId}`}
              className="underline underline-offset-2"
            >
              Manage event
            </Link>
          </p>
        </header>

        {/* Response progress */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Responses</h2>
            <span className="text-sm font-medium tabular-nums">
              {respondedCount} of {totalParticipants}
            </span>
          </div>
          <Progress className="mt-4" value={progressPct} />
          <p className="mt-3 text-sm text-muted-foreground">
            {respondedCount === totalParticipants && totalParticipants > 0
              ? "All participants have responded 🎉"
              : respondedCount === 0
              ? "No responses yet."
              : `${totalParticipants - respondedCount} participant${
                  totalParticipants - respondedCount === 1 ? "" : "s"
                } still pending`}
          </p>
        </Card>

        {/* Aggregate availability heatmap */}
        <Card>
          <h2 className="text-lg font-semibold">Availability Heatmap</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregate availability across all respondents — no individual
            names shown.
          </p>

          {grid && visibleDates.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-md border border-border">
              <div
                className="grid min-w-[600px]"
                style={{
                  gridTemplateColumns: `64px repeat(${visibleDates.length}, minmax(72px, 1fr))`
                }}
              >
                {/* Header row */}
                <div className="sticky left-0 border-b border-r border-border bg-muted p-2" />
                {visibleDates.map((dateKey) => (
                  <div
                    key={dateKey}
                    className="border-b border-r border-border bg-muted px-1 py-2 text-center text-xs font-medium"
                  >
                    {formatDateHeader(dateKey)}
                  </div>
                ))}

                {/* Time rows */}
                {grid.times.map((timeKey) => (
                  <>
                    <div
                      key={`time-${timeKey}`}
                      className="sticky left-0 border-r border-t border-border bg-white px-2 py-1.5 text-xs text-muted-foreground"
                    >
                      {formatTimeLabel(timeKey)}
                    </div>
                    {visibleDates.map((dateKey) => {
                      const score = grid.lookup.get(`${dateKey}|${timeKey}`) ?? 0;
                      const pct = Math.round(score * 100);
                      return (
                        <div
                          key={`${dateKey}-${timeKey}`}
                          title={pct > 0 ? `${pct}% available` : undefined}
                          className={`min-h-[36px] border-r border-t border-border transition-colors ${scoreToColor(
                            score
                          )}`}
                        />
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {respondedCount === 0
                ? "Availability data will appear here once participants respond."
                : "No time slot data available."}
            </div>
          )}

          {/* Legend */}
          {grid && visibleDates.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Availability:</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-100 border border-border" />
                Low
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-200 border border-border" />
                Medium
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-400 border border-border" />
                High
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-600 border border-border" />
                Best
              </span>
              {grid.dates.length > 14 ? (
                <span className="ml-auto text-muted-foreground">
                  Showing first 14 of {grid.dates.length} days
                </span>
              ) : null}
            </div>
          ) : null}
        </Card>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground">
          This is a read-only public status page. Participant names and individual
          availability are never shown.
        </p>
      </div>
    </main>
  );
}
