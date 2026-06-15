export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <p className="text-sm font-medium text-primary">Legal</p>
          <h1 className="mt-2 text-4xl font-semibold">Privacy Policy</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: June 2026 &nbsp;·&nbsp;{" "}
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              Placeholder — not legal advice
            </span>
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">What we collect</h2>
          <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Name &amp; email address</span> — provided when you are invited to a Rally or sign up as an organizer. Used to send invite and notification emails.
            </li>
            <li>
              <span className="font-medium text-foreground">Availability intervals</span> — the blocks of time you mark as free or busy. Stored as start/end timestamps. We do <strong>not</strong> store raw calendar events, meeting titles, or any other calendar metadata.
            </li>
            <li>
              <span className="font-medium text-foreground">Preference ratings</span> — your "preferred / available / rather not" ratings for specific slots.
            </li>
            <li>
              <span className="font-medium text-foreground">Votes</span> — your vote (yes / maybe / no) on suggested meeting slots during the voting phase.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">How we use your data</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Your data is used solely to compute meeting time suggestions and to communicate Rally status updates (invite sent, time confirmed). We do not sell, rent, or share your data with third parties for marketing purposes.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">GDPR right to erasure</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            If you are a participant, you can delete all your personal data (name, email, availability, preferences) from any Rally at any time by visiting your invite link and clicking <strong>Delete my data</strong> on the confirmation page.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            For organizer accounts or any other erasure requests, contact us at <a href="mailto:privacy@rally.app" className="text-primary underline">privacy@rally.app</a>.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Data retention</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Rally events and participant data are retained until you delete them or they expire. Expired events are purged automatically within 90 days of expiry.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Cookies &amp; third-party services</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Rally uses a session cookie for organizer authentication. Transactional emails are sent via Resend. No advertising or analytics cookies are set.
          </p>
        </section>
      </div>
    </main>
  );
}
