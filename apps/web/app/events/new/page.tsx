"use client";

import { ArrowLeft, CalendarPlus, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";

type WindowType = "next_n_days" | "specific_month" | "after_date" | "date_range";
type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type TimeOfDay = "morning" | "afternoon" | "evening" | "custom";

interface EventConstraintsInput {
  windowType: WindowType;
  windowStart?: string;
  windowEnd?: string;
  nDays?: number;
  month?: number;
  year?: number;
  daysOfWeek: DayOfWeek[];
  timeOfDay: TimeOfDay;
  customStart?: string;
  customEnd?: string;
  excludeDates: string[];
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const days: Array<{ value: DayOfWeek; label: string }> = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" }
];

const durations = [
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "1.5 hr", value: 90 },
  { label: "2 hr", value: 120 },
  { label: "3 hr", value: 180 },
  { label: "Half-day", value: 240 },
  { label: "Full-day", value: 480 }
];

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [duration, setDuration] = React.useState(60);
  const [constraints, setConstraints] = React.useState<EventConstraintsInput>({
    windowType: "next_n_days",
    nDays: 30,
    daysOfWeek: days.map((day) => day.value),
    timeOfDay: "morning",
    excludeDates: []
  });
  const [email, setEmail] = React.useState("");
  const [invitees, setInvitees] = React.useState<string[]>([]);
  const [excludeDate, setExcludeDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function updateConstraints(update: Partial<EventConstraintsInput>) {
    setConstraints((current) => ({ ...current, ...update }));
  }

  function addInvitee() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || invitees.includes(trimmed)) return;
    setInvitees((current) => [...current, trimmed]);
    setEmail("");
  }

  function addExcludeDate() {
    if (!excludeDate || constraints.excludeDates.includes(excludeDate)) return;
    updateConstraints({ excludeDates: [...constraints.excludeDates, excludeDate] });
    setExcludeDate("");
  }

  async function submit() {
    setError(null);
    setSubmitting(true);

    try {
      const eventResponse = await fetch(`${apiBaseUrl}/api/events`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          duration,
          constraints
        })
      });

      if (!eventResponse.ok) throw new Error(await readError(eventResponse));
      const eventPayload = await eventResponse.json() as { event: { id: string } };

      await Promise.all(invitees.map(async (inviteEmail) => {
        const response = await fetch(`${apiBaseUrl}/api/events/${eventPayload.event.id}/participants`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: inviteEmail })
        });

        if (!response.ok) throw new Error(await readError(response));
      }));

      router.push(`/events/${eventPayload.event.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create Rally");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Step {step} of 3</p>
            <h1 className="text-3xl font-semibold">Create a Rally</h1>
          </div>
          <Button variant="ghost" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
        </header>

        {error ? <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        {step === 1 ? (
          <Card className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Event name">
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Dinner, game night, planning session" />
              </Field>
              <Field label="Duration">
                <Select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                  {durations.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add any details people should know." />
            </Field>
            <div className="flex justify-end">
              <Button disabled={!title.trim()} onClick={() => setStep(2)}>Next</Button>
            </div>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2">
              {windowOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateConstraints({ windowType: option.value })}
                  className={`rounded-lg border p-4 text-left text-sm transition-colors ${constraints.windowType === option.value ? "border-primary bg-primary/5" : "border-border bg-white hover:bg-muted"}`}
                >
                  <span className="font-medium">{option.label}</span>
                </button>
              ))}
            </div>

            <WindowFields constraints={constraints} updateConstraints={updateConstraints} />

            <Field label="Days of week">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                {days.map((day) => (
                  <label key={day.value} className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={constraints.daysOfWeek.includes(day.value)}
                      onChange={(event) => {
                        updateConstraints({
                          daysOfWeek: event.target.checked
                            ? [...constraints.daysOfWeek, day.value]
                            : constraints.daysOfWeek.filter((value) => value !== day.value)
                        });
                      }}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Time of day">
              <div className="grid gap-2 sm:grid-cols-4">
                {(["morning", "afternoon", "evening", "custom"] as TimeOfDay[]).map((value) => (
                  <label key={value} className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm capitalize">
                    <input type="radio" checked={constraints.timeOfDay === value} onChange={() => updateConstraints({ timeOfDay: value })} />
                    {value.replace("_", " ")}
                  </label>
                ))}
              </div>
            </Field>

            {constraints.timeOfDay === "custom" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start time"><Input type="time" value={constraints.customStart ?? ""} onChange={(event) => updateConstraints({ customStart: event.target.value })} /></Field>
                <Field label="End time"><Input type="time" value={constraints.customEnd ?? ""} onChange={(event) => updateConstraints({ customEnd: event.target.value })} /></Field>
              </div>
            ) : null}

            <Field label="Exclude dates">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input type="date" value={excludeDate} onChange={(event) => setExcludeDate(event.target.value)} />
                <Button type="button" variant="secondary" onClick={addExcludeDate}>Add</Button>
              </div>
              {constraints.excludeDates.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {constraints.excludeDates.map((date) => (
                    <button key={date} type="button" onClick={() => updateConstraints({ excludeDates: constraints.excludeDates.filter((value) => value !== date) })} className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1 text-sm">
                      {date}<X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              ) : null}
            </Field>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button disabled={constraints.daysOfWeek.length === 0} onClick={() => setStep(3)}>Next</Button>
            </div>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card className="space-y-6">
            <div className="rounded-lg bg-muted p-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{durationLabel(duration)} · {windowSummary(constraints)}</p>
            </div>

            <Field label="Invite people">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addInvitee(); } }} placeholder="friend@example.com" />
                <Button type="button" variant="secondary" onClick={addInvitee}><Plus className="h-4 w-4" />Add</Button>
              </div>
              <div className="mt-3 space-y-2">
                {invitees.map((inviteEmail) => (
                  <div key={inviteEmail} className="flex items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-sm">
                    {inviteEmail}
                    <button type="button" onClick={() => setInvitees((current) => current.filter((value) => value !== inviteEmail))}><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </Field>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
              <Button disabled={submitting || invitees.length === 0} onClick={submit}>
                <CalendarPlus className="h-4 w-4" />
                {submitting ? "Creating..." : "Create Rally and Send Invites"}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

const windowOptions: Array<{ value: WindowType; label: string }> = [
  { value: "next_n_days", label: "Within the next N days" },
  { value: "specific_month", label: "In a specific month" },
  { value: "after_date", label: "After a specific date" },
  { value: "date_range", label: "Date range" }
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function WindowFields({ constraints, updateConstraints }: { constraints: EventConstraintsInput; updateConstraints: (update: Partial<EventConstraintsInput>) => void }) {
  if (constraints.windowType === "next_n_days") {
    return <Field label="Number of days"><Input type="number" min={1} value={constraints.nDays ?? 30} onChange={(event) => updateConstraints({ nDays: Number(event.target.value) })} /></Field>;
  }

  if (constraints.windowType === "specific_month") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Month"><Input type="number" min={1} max={12} value={constraints.month ?? new Date().getMonth() + 1} onChange={(event) => updateConstraints({ month: Number(event.target.value) })} /></Field>
        <Field label="Year"><Input type="number" min={2026} value={constraints.year ?? new Date().getFullYear()} onChange={(event) => updateConstraints({ year: Number(event.target.value) })} /></Field>
      </div>
    );
  }

  if (constraints.windowType === "after_date") {
    return <Field label="After date"><Input type="date" value={constraints.windowStart ?? ""} onChange={(event) => updateConstraints({ windowStart: event.target.value })} /></Field>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Start date"><Input type="date" value={constraints.windowStart ?? ""} onChange={(event) => updateConstraints({ windowStart: event.target.value })} /></Field>
      <Field label="End date"><Input type="date" value={constraints.windowEnd ?? ""} onChange={(event) => updateConstraints({ windowEnd: event.target.value })} /></Field>
    </div>
  );
}

function durationLabel(minutes: number): string {
  return durations.find((duration) => duration.value === minutes)?.label ?? `${minutes} min`;
}

function windowSummary(constraints: EventConstraintsInput): string {
  if (constraints.windowType === "next_n_days") return `Next ${constraints.nDays ?? 30} days`;
  if (constraints.windowType === "specific_month") return `Month ${constraints.month ?? ""}/${constraints.year ?? ""}`;
  if (constraints.windowType === "after_date") return `After ${constraints.windowStart ?? "selected date"}`;
  return `${constraints.windowStart ?? "Start"} to ${constraints.windowEnd ?? "End"}`;
}

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "Request failed";
}
