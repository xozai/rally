import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const from = process.env.RESEND_FROM ?? process.env.FROM_EMAIL ?? "Rally <noreply@rally.app>";

export async function sendInviteEmail(
  to: string,
  name: string,
  eventTitle: string,
  organizerName: string,
  inviteUrl: string
): Promise<void> {
  if (!resend) return;

  await resend.emails.send({
    from,
    to,
    subject: `${organizerName} invited you to ${eventTitle}`,
    html: emailWrapper([
      paragraph(`Hi ${escapeHtml(name)},`),
      paragraph(`${escapeHtml(organizerName)} invited you to help find a time for <strong>${escapeHtml(eventTitle)}</strong>.`),
      ctaButton("Share your availability", inviteUrl)
    ].join(""))
  });
}

export async function sendMagicLinkEmail(to: string, magicLink: string): Promise<void> {
  if (!resend) return;

  await resend.emails.send({
    from,
    to,
    subject: "Sign in to Rally",
    html: emailWrapper([
      paragraph("Use this link to sign in to Rally:"),
      ctaButton("Sign in", magicLink)
    ].join(""))
  });
}

export async function sendConfirmationEmail(
  to: string,
  name: string,
  eventTitle: string,
  finalSlot: string,
  icalUrl: string
): Promise<void> {
  if (!resend) return;

  await resend.emails.send({
    from,
    to,
    subject: `${eventTitle} is confirmed`,
    html: emailWrapper([
      paragraph(`Hi ${escapeHtml(name)},`),
      paragraph(`<strong>${escapeHtml(eventTitle)}</strong> is confirmed for ${escapeHtml(finalSlot)}.`),
      ctaButton("Add it to your calendar", icalUrl)
    ].join(""))
  });
}

export async function sendVotingOpenEmail(
  to: string,
  name: string,
  eventTitle: string,
  voteUrl: string
): Promise<void> {
  if (!resend) return;

  await resend.emails.send({
    from,
    to,
    subject: `Time to vote! ${eventTitle} needs your input`,
    html: emailWrapper([
      paragraph(`Hi ${escapeHtml(name)},`),
      paragraph(`The organizer opened voting for <strong>${escapeHtml(eventTitle)}</strong>.`),
      ctaButton("Vote on your preferred times", voteUrl)
    ].join(""))
  });
}

export async function sendEventConfirmedEmail(
  to: string,
  name: string,
  eventTitle: string,
  confirmedSlot: string,
  icsUrl: string
): Promise<void> {
  if (!resend) return;

  await resend.emails.send({
    from,
    to,
    subject: `${eventTitle} is confirmed!`,
    html: emailWrapper([
      paragraph(`Hi ${escapeHtml(name)},`),
      paragraph(`<strong>${escapeHtml(eventTitle)}</strong> is confirmed for ${escapeHtml(confirmedSlot)}.`),
      ctaButton("Add it to your calendar", icsUrl)
    ].join(""))
  });
}

function emailWrapper(body: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#f3f4f6;width:100%;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;">
            <tr>
              <td style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;color:#111827;">
                Rally
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 4px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;text-align:center;">
                Rally helps groups find a time that works for everyone.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function ctaButton(text: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0 0;">
      <tr>
        <td>
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:6px;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;">
            ${escapeHtml(text)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function paragraph(content: string): string {
  return `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#374151;">${content}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
