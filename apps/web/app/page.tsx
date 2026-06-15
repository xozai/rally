import Link from "next/link";
import { CalendarDays, UsersRound } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl">
          <div className="mb-6 flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <UsersRound className="h-5 w-5" />
            Social scheduling for real friend groups
          </div>
          <h1 className="text-5xl font-semibold tracking-normal sm:text-7xl">Rally</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Create an invite, collect real availability and preferences, then pick the time that works best for the group.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              <CalendarDays className="h-4 w-4" />
              Start a Rally
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
