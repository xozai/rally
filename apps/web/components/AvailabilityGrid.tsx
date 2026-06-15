"use client";

import type { TimeInterval } from "@rally/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface AvailabilityGridProps {
  slots: string[];
  initialAvailability?: TimeInterval[];
  onChange: (availability: TimeInterval[]) => void;
  readOnly?: boolean;
  slotClassName?: (slot: string, selected: boolean) => string;
  renderSlot?: (slot: string, selected: boolean) => React.ReactNode;
}

const slotMinutes = 30;
const pageSize = 14;

export function AvailabilityGrid({ slots, initialAvailability, onChange, readOnly = false, slotClassName, renderSlot }: AvailabilityGridProps) {
  const sortedSlots = React.useMemo(() => [...slots].sort(), [slots]);
  const slotSet = React.useMemo(() => new Set(sortedSlots), [sortedSlots]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(0);
  const [dragMode, setDragMode] = React.useState<"select" | "clear" | null>(null);

  React.useEffect(() => {
    const expanded = expandIntervals(initialAvailability ?? [], slotSet);
    setSelected(expanded);
  }, [initialAvailability, slotSet]);

  React.useEffect(() => {
    onChange(mergeSlots(selected));
  }, [selected, onChange]);

  const grid = React.useMemo(() => buildGrid(sortedSlots), [sortedSlots]);
  const dates = grid.dates.slice(page * pageSize, page * pageSize + pageSize);
  const maxPage = Math.max(0, Math.ceil(grid.dates.length / pageSize) - 1);

  function applySlot(slot: string, mode: "select" | "clear") {
    if (readOnly) return;
    setSelected((current) => {
      const next = new Set(current);
      if (mode === "select") next.add(slot);
      else next.delete(slot);
      return next;
    });
  }

  function beginDrag(slot: string) {
    if (readOnly) return;
    const mode = selected.has(slot) ? "clear" : "select";
    setDragMode(mode);
    applySlot(slot, mode);
  }

  function continueDrag(slot: string) {
    if (!dragMode || readOnly) return;
    applySlot(slot, dragMode);
  }

  function touchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (!dragMode || readOnly) return;
    const touch = event.touches[0];
    if (!touch) return;
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const slot = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-slot]")?.dataset.slot : undefined;
    if (slot) applySlot(slot, dragMode);
  }

  if (sortedSlots.length === 0) {
    return <div className="rounded-md border border-dashed border-border bg-white p-8 text-center text-sm text-muted-foreground">No slots are available for this event window.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{grid.dates.length} days in this Rally window</p>
        {grid.dates.length > pageSize ? (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="h-9 px-3" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="secondary" className="h-9 px-3" disabled={page === maxPage} onClick={() => setPage((value) => Math.min(maxPage, value + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <div
        className="overflow-auto rounded-md border border-border bg-white"
        onMouseLeave={() => setDragMode(null)}
        onMouseUp={() => setDragMode(null)}
        onTouchEnd={() => setDragMode(null)}
        onTouchCancel={() => setDragMode(null)}
        onTouchMove={touchMove}
      >
        <div
          className="grid min-w-[760px]"
          style={{ gridTemplateColumns: `72px repeat(${dates.length}, minmax(88px, 1fr))` }}
        >
          <div className="sticky left-0 top-0 z-20 border-b border-r border-border bg-muted p-2" />
          {dates.map((dateKey) => (
            <div key={dateKey} className="sticky top-0 z-10 border-b border-r border-border bg-muted p-2 text-center text-xs font-medium">
              {formatDateHeader(dateKey)}
            </div>
          ))}

          {grid.times.map((timeKey) => (
            <React.Fragment key={timeKey}>
              <div className="sticky left-0 z-10 border-r border-t border-border bg-white px-2 py-2 text-xs text-muted-foreground">
                {formatTimeLabel(timeKey)}
              </div>
              {dates.map((dateKey) => {
                const slot = grid.lookup.get(`${dateKey}|${timeKey}`);
                const isSelected = Boolean(slot && selected.has(slot));
                return (
                  <div
                    key={`${dateKey}-${timeKey}`}
                    data-slot={slot}
                    role={slot && !readOnly ? "button" : undefined}
                    tabIndex={slot && !readOnly ? 0 : -1}
                    onMouseDown={() => slot && beginDrag(slot)}
                    onMouseEnter={() => slot && continueDrag(slot)}
                    onTouchStart={() => slot && beginDrag(slot)}
                    onKeyDown={(event) => {
                      if (!slot || readOnly || (event.key !== "Enter" && event.key !== " ")) return;
                      event.preventDefault();
                      beginDrag(slot);
                      setDragMode(null);
                    }}
                    className={cn(
                      "relative min-h-10 select-none border-r border-t border-border transition-colors",
                      slot ? "bg-white" : "bg-muted/40",
                      slot && !readOnly ? "cursor-pointer hover:bg-primary/10" : "",
                      isSelected ? "bg-emerald-100 hover:bg-emerald-200" : "",
                      slot && slotClassName ? slotClassName(slot, isSelected) : ""
                    )}
                  >
                    {slot && renderSlot ? renderSlot(slot, isSelected) : null}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildGrid(slots: string[]): { dates: string[]; times: string[]; lookup: Map<string, string> } {
  const dateSet = new Set<string>();
  const timeSet = new Set<string>();
  const lookup = new Map<string, string>();

  for (const slot of slots) {
    const dateKey = localDateKey(slot);
    const timeKey = localTimeKey(slot);
    dateSet.add(dateKey);
    timeSet.add(timeKey);
    lookup.set(`${dateKey}|${timeKey}`, slot);
  }

  return {
    dates: [...dateSet].sort(),
    times: [...timeSet].sort(),
    lookup
  };
}

function expandIntervals(intervals: TimeInterval[], slots: Set<string>): Set<string> {
  const selected = new Set<string>();
  for (const slot of slots) {
    const start = new Date(slot).getTime();
    const end = start + slotMinutes * 60_000;
    if (intervals.some((interval) => new Date(interval.start).getTime() <= start && new Date(interval.end).getTime() >= end)) {
      selected.add(slot);
    }
  }
  return selected;
}

function mergeSlots(selected: Set<string>): TimeInterval[] {
  const starts = [...selected].sort();
  const intervals: TimeInterval[] = [];
  let currentStart: string | null = null;
  let currentEnd = 0;

  for (const slot of starts) {
    const start = new Date(slot).getTime();
    const end = start + slotMinutes * 60_000;
    if (currentStart && start === currentEnd) {
      currentEnd = end;
      continue;
    }
    if (currentStart) intervals.push({ start: currentStart, end: new Date(currentEnd).toISOString() });
    currentStart = slot;
    currentEnd = end;
  }

  if (currentStart) intervals.push({ start: currentStart, end: new Date(currentEnd).toISOString() });
  return intervals;
}

function localDateKey(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeKey(value: string): string {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateHeader(dateKey: string): string {
  const [year = "0", month = "1", day = "1"] = dateKey.split("-");
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function formatTimeLabel(timeKey: string): string {
  const [hours = "0", minutes = "0"] = timeKey.split(":");
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, Number(hours), Number(minutes)));
}
