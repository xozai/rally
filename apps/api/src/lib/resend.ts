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
    html: [
      `<p>Hi ${escapeHtml(name)},</p>`,
      `<p>${escapeHtml(organizerName)} invited you to help find a time for <strong>${escapeHtml(eventTitle)}</strong>.</p>`,
      `<p><a href="${escapeHtml(inviteUrl)}">Share your availability</a></p>`
    ].join("")
  });
}

export async function sendMagicLinkEmail(to: string, magicLink: string): Promise<void> {
  if (!resend) return;

  await resend.emails.send({
    from,
    to,
    subject: "Sign in to Rally",
    html: `<p>Use this link to sign in to Rally:</p><p><a href="${escapeHtml(magicLink)}">Sign in</a></p>`
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
    html: [
      `<p>Hi ${escapeHtml(name)},</p>`,
      `<p><strong>${escapeHtml(eventTitle)}</strong> is confirmed for ${escapeHtml(finalSlot)}.</p>`,
      `<p><a href="${escapeHtml(icalUrl)}">Add it to your calendar</a></p>`
    ].join("")
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
    html: [
      `<p>Hi ${escapeHtml(name)},</p>`,
      `<p>The organizer opened voting for <strong>${escapeHtml(eventTitle)}</strong>.</p>`,
      `<p><a href="${escapeHtml(voteUrl)}">Vote on your preferred times</a></p>`
    ].join("")
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
    html: [
      `<p>Hi ${escapeHtml(name)},</p>`,
      `<p><strong>${escapeHtml(eventTitle)}</strong> is confirmed for ${escapeHtml(confirmedSlot)}.</p>`,
      `<p><a href="${escapeHtml(icsUrl)}">Add it to your calendar</a></p>`
    ].join("")
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
