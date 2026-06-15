"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { apiUrl } from "../../lib/utils";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch(`${apiUrl}/api/auth/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Unable to send magic link.");
      return;
    }

    setSent(true);
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm">
      <form className="space-y-4" onSubmit={requestMagicLink}>
        <div>
          <h1 className="text-2xl font-semibold">Sign in to Rally</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use Google or get a passwordless email link.</p>
        </div>
        <Button className="w-full" type="button" onClick={() => { window.location.href = `${apiUrl}/api/auth/google`; }}>
          Continue with Google
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>
        <label className="block text-sm font-medium" htmlFor="email">Email</label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
        <Button className="w-full" type="submit" disabled={loading}>
          <Mail className="h-4 w-4" />
          {loading ? "Sending..." : "Email magic link"}
        </Button>
        {sent && <p className="text-sm text-muted-foreground">Check your email for a sign-in link.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
