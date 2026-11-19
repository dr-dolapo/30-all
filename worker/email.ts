import type { Env } from "./lib";

export interface Mail { to: string; subject: string; text: string }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function html(m: Mail, env: Env): string {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
  <div style="background:#FF751F;color:#111;font-weight:800;font-size:20px;padding:14px 18px;border-radius:10px">30-All</div>
  <p style="font-size:16px;line-height:1.5;margin:20px 0">${esc(m.text).replace(/\n/g, "<br>")}</p>
  <a href="${env.APP_URL}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open 30-All</a>
  <p style="font-size:12px;color:#777;margin-top:24px">You're getting this because you have a 30-All account.</p></div>`;
}

/** Sends one email. Never throws: a failed email must not break the request that triggered it. */
export async function sendMail(env: Env, m: Mail): Promise<void> {
  try {
    if (env.EMAIL_PROVIDER === "cloudflare" && env.EMAIL) {
      await env.EMAIL.send({ to: m.to, from: env.EMAIL_FROM, subject: m.subject, text: m.text, html: html(m, env) });
      return;
    }
    if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text, html: html(m, env) }),
      });
      if (!r.ok) console.error("Resend error", r.status, await r.text());
      return;
    }
    // Local development: print the email to the wrangler console.
    console.log(`\n📧 EMAIL to ${m.to}\n   Subject: ${m.subject}\n   ${m.text}\n`);
  } catch (e) {
    console.error("Email send failed", e);
  }
}
