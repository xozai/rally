"use client";

import Link from "next/link";

const gridRows = [
  [
    "bg-indigo-500/20 [animation-delay:0ms]",
    "bg-emerald-400/70 [animation-delay:110ms]",
    "bg-indigo-500/25 [animation-delay:220ms]",
    "bg-slate-700/70 [animation-delay:330ms]",
    "bg-emerald-400/80 [animation-delay:440ms]",
    "bg-indigo-400/50 [animation-delay:550ms]"
  ],
  [
    "bg-slate-700/80 [animation-delay:110ms]",
    "bg-indigo-400/60 [animation-delay:220ms]",
    "bg-emerald-400/75 [animation-delay:330ms]",
    "bg-indigo-500/25 [animation-delay:440ms]",
    "bg-indigo-400/55 [animation-delay:550ms]",
    "bg-emerald-400/70 [animation-delay:660ms]"
  ],
  [
    "bg-indigo-400/50 [animation-delay:220ms]",
    "bg-emerald-400/80 [animation-delay:330ms]",
    "bg-slate-700/70 [animation-delay:440ms]",
    "bg-emerald-400/70 [animation-delay:550ms]",
    "bg-indigo-500/25 [animation-delay:660ms]",
    "bg-indigo-400/55 [animation-delay:770ms]"
  ],
  [
    "bg-emerald-400/75 [animation-delay:330ms]",
    "bg-indigo-500/25 [animation-delay:440ms]",
    "bg-indigo-400/55 [animation-delay:550ms]",
    "bg-slate-700/80 [animation-delay:660ms]",
    "bg-emerald-400/80 [animation-delay:770ms]",
    "bg-indigo-500/25 [animation-delay:880ms]"
  ],
  [
    "bg-indigo-500/20 [animation-delay:440ms]",
    "bg-slate-700/70 [animation-delay:550ms]",
    "bg-emerald-400/75 [animation-delay:660ms]",
    "bg-indigo-400/55 [animation-delay:770ms]",
    "bg-emerald-400/85 [animation-delay:880ms]",
    "bg-indigo-400/45 [animation-delay:990ms]"
  ]
];

const steps = [
  {
    title: "Create a Rally",
    description: "Organizer sets event details and constraints: date range, duration, and time-of-day."
  },
  {
    title: "Everyone shares availability",
    description: "Participants connect Google or Outlook Calendar, or fill in a grid. No accounts required."
  },
  {
    title: "Rally picks the best time",
    description: "The scoring engine surfaces ranked slots. Organizer confirms, everyone gets a calendar invite."
  }
];

const features = [
  {
    title: "Calendar integrations",
    description: "Import real free/busy windows from Google Calendar and Outlook without exposing private event details."
  },
  {
    title: "Preference-aware scoring",
    description: "Rank times by availability, preferred windows, constraints, and group fit instead of raw majority votes."
  },
  {
    title: "Live updates",
    description: "Suggestions refresh as people respond, so organizers always see the latest best options."
  },
  {
    title: "Smart notifications",
    description: "Invite, remind, open voting, and send confirmed calendar details from one clean workflow."
  }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0f0f11] text-white">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-semibold tracking-normal text-white">
          Rally
        </Link>
        <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white">
          Sign in
        </Link>
      </nav>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-28">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-semibold leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
            Find the perfect time, together.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300 sm:text-xl">
            Rally collects real availability from your whole group, surfaces the best times, and confirms the plan — no group chats required.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-md bg-[#6366f1] px-6 text-sm font-semibold text-white transition-colors hover:bg-indigo-500">
              Get started for free
            </Link>
            <button
              type="button"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex h-12 items-center justify-center rounded-md border border-white/15 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/5"
            >
              See how it works
            </button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-4 shadow-2xl shadow-indigo-950/40 sm:p-6">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent" />
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-indigo-200">Group availability</p>
              <p className="mt-1 text-xs text-gray-400">Best overlap: Thu 6:00 PM</p>
            </div>
            <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">92% match</div>
          </div>
          <div className="grid grid-cols-[64px_repeat(6,minmax(0,1fr))] gap-2">
            <div />
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-400">{day}</div>
            ))}
            {gridRows.map((row, rowIndex) => (
              <div key={rowIndex} className="contents">
                <div className="flex h-10 items-center text-xs text-gray-500 sm:h-12">{`${4 + rowIndex}:00`}</div>
                {row.map((cellClass, cellIndex) => (
                  <div
                    key={`${rowIndex}-${cellIndex}`}
                    className={`h-10 rounded-md border border-white/5 ${cellClass} animate-pulse [animation-duration:2.8s] sm:h-12`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-md border border-indigo-400/20 bg-indigo-400/10 p-4">
            <p className="text-sm font-medium text-white">Top suggestion</p>
            <p className="mt-1 text-sm text-gray-300">Thursday, 6:00 PM - 7:30 PM works for 8 of 9 people.</p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-white/10 bg-white/[0.02] px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-indigo-300">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">From invite to confirmed plan.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#6366f1] text-sm font-bold text-white">{index + 1}</div>
                <h3 className="mt-5 text-xl font-semibold text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-300">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-indigo-300">Features</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">Built for real group scheduling.</h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-lg border border-indigo-400/20 bg-indigo-500/10 p-6 sm:p-8 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal text-white">Ready to stop herding cats?</h2>
            <p className="mt-2 text-sm leading-6 text-indigo-100/80">Create a Rally, invite your group, and let the best time rise to the top.</p>
          </div>
          <Link href="/login" className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[#6366f1] px-6 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 sm:w-auto">
            Start your first Rally
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Rally © 2026</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="transition-colors hover:text-white">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-white">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
