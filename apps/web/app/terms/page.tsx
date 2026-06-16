export default function TermsPage() {
  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <p className="text-sm font-medium text-primary">Legal</p>
          <h1 className="mt-2 text-4xl font-semibold">Terms of Service</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: June 2026 &nbsp;·&nbsp;{" "}
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              Placeholder — not legal advice
            </span>
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Beta software disclaimer</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Rally is currently in <strong>beta</strong>. It is provided &quot;as is&quot; without warranty of any kind, express or implied. Features may change, data may be reset, and the service may be interrupted without notice. Use at your own risk.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">License</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            The Rally codebase is released under the{" "}
            <a href="https://opensource.org/licenses/MIT" className="text-primary underline" target="_blank" rel="noopener noreferrer">
              MIT License
            </a>
            . You are free to use, copy, modify, and distribute the software subject to the terms of that license.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Acceptable use</h2>
          <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
            <li>You may use Rally to coordinate meetings and share availability with consenting participants.</li>
            <li>You may not use Rally to send unsolicited invitations (spam) or to collect personal data without consent.</li>
            <li>You are responsible for obtaining consent from participants before inviting them to a Rally.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Limitation of liability</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            To the maximum extent permitted by law, Rally and its contributors shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of the service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Changes to these terms</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            These terms are placeholders and will be replaced with full legal terms before Rally exits beta. Check back for updates. Continued use of the service after changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Questions? Email <a href="mailto:legal@rally.app" className="text-primary underline">legal@rally.app</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
