"use client";

import Link from "next/link";

export default function EventError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">Event not found or no access</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Check the link or return to your dashboard.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Try again
          </button>
          <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
