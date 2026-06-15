import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { apiUrl } from "../../lib/utils";

async function getSession() {
  const response = await fetch(`${apiUrl}/api/auth/session`, {
    headers: { cookie: cookies().toString() },
    cache: "no-store"
  });

  if (!response.ok) return null;
  return response.json() as Promise<{ user: { id: string; email: string; name?: string | null } }>;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{session.user.email}</p>
            <h1 className="text-3xl font-semibold">Dashboard</h1>
          </div>
          <Link href="/events/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <CalendarPlus className="h-4 w-4" />
            New event
          </Link>
        </header>
        <section className="mt-10 rounded-lg border border-dashed border-border bg-white p-10 text-center">
          <h2 className="text-xl font-semibold">No active Rally events yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Create your first event to invite friends, collect availability, and see ranked time suggestions.
          </p>
        </section>
      </div>
    </main>
  );
}
