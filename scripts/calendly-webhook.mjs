/**
 * Manage the Calendly → sales pipeline webhook subscription.
 *
 *   node scripts/calendly-webhook.mjs list
 *   node scripts/calendly-webhook.mjs create --url=https://wedecypher.co
 *   node scripts/calendly-webhook.mjs delete --uri=<subscription uri>
 *
 * THE SIGNING KEY IS SHOWN ONCE. `create` prints it and Calendly never reveals
 * it again — put it straight into CALENDLY_WEBHOOK_SIGNING_KEY in .env.local
 * and in Vercel. Losing it means deleting the subscription and making a new one.
 *
 * Two things worth knowing before running this:
 *
 * 1. `list` only shows subscriptions created by THIS token. Calendly scopes
 *    them per OAuth client, so whatever currently feeds the client's Airtable
 *    (Zapier, Make, the native integration) will not appear here and is not
 *    affected by anything this script does. Both can run at once — which is
 *    exactly how to cut over safely: add ours, let them run in parallel, and
 *    only switch Airtable off once the portal has been reconciled against it.
 *
 * 2. The callback URL must be publicly reachable and HTTPS. localhost will be
 *    rejected; use the deployed domain, and test locally by replaying a captured
 *    payload against the route rather than by pointing Calendly at a tunnel.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { args, calendly, rule } from "./_sales-env.mjs";

/**
 * Put the signing key straight into .env.local.
 *
 * WE generate the key and hand it to Calendly, rather than the other way round.
 * Verified against the live API: `signing_key` is a write-only parameter on
 * POST /webhook_subscriptions — it is absent from the creation response, from
 * the list response, and from a direct GET on the subscription. So the only
 * copy that will ever exist is the one written here, and Calendly cannot
 * re-issue it. .env.local is gitignored (.gitignore:54), so this cannot commit
 * a secret.
 */
function writeKeyToEnvLocal(key) {
  const LINE = `CALENDLY_WEBHOOK_SIGNING_KEY=${key}`;
  let current = "";
  try {
    current = readFileSync(".env.local", "utf8");
  } catch {
    appendFileSync(".env.local", `\n${LINE}\n`);
    return "created .env.local";
  }
  if (/^CALENDLY_WEBHOOK_SIGNING_KEY=.*$/m.test(current)) {
    writeFileSync(
      ".env.local",
      current.replace(/^CALENDLY_WEBHOOK_SIGNING_KEY=.*$/m, LINE),
    );
    return "replaced the existing line in .env.local";
  }
  appendFileSync(".env.local", `${current.endsWith("\n") ? "" : "\n"}${LINE}\n`);
  return "appended to .env.local";
}

const argv = args();
const command = argv._[0];

const me = (await calendly("/users/me")).resource;
const organization = me.current_organization;
console.log(`token: ${me.email}\norg:   ${organization}`);

const PATH = "/api/calendly/webhook";
const EVENTS = ["invitee.created", "invitee.canceled"];

if (command === "list") {
  rule("SUBSCRIPTIONS CREATED BY THIS TOKEN");
  const qs = new URLSearchParams({
    scope: "organization",
    organization,
    count: "50",
  });
  const { collection } = await calendly(`/webhook_subscriptions?${qs}`);
  if (!collection.length) {
    console.log("(none)");
    console.log(
      "\nNote: this lists only what THIS token created. An existing\n" +
        "Zapier/Make integration is scoped to its own OAuth client and\n" +
        "will not show up here even though it is running.",
    );
  }
  for (const h of collection) {
    console.log(`• ${h.callback_url}`);
    console.log(`  uri:    ${h.uri}`);
    console.log(`  events: ${h.events.join(", ")}`);
    console.log(`  state:  ${h.state}   created: ${h.created_at}\n`);
  }
} else if (command === "create") {
  const base = typeof argv.url === "string" ? argv.url.replace(/\/$/, "") : null;
  if (!base || !base.startsWith("https://")) {
    console.error("Usage: node scripts/calendly-webhook.mjs create --url=https://your-domain");
    process.exit(1);
  }
  const callbackUrl = `${base}${PATH}`;
  rule(`CREATING → ${callbackUrl}`);

  // 32 random bytes, hex. Ours to choose — Calendly signs each delivery with
  // whatever we send here, and never gives it back.
  const signingKey =
    typeof argv.key === "string" && argv.key.length >= 16
      ? argv.key
      : randomBytes(32).toString("hex");

  let created;
  try {
    created = (
      await calendly("/webhook_subscriptions", {
        method: "POST",
        body: JSON.stringify({
          url: callbackUrl,
          events: EVENTS,
          organization,
          scope: "organization",
          signing_key: signingKey,
        }),
      })
    ).resource;
  } catch (e) {
    console.error(`Failed: ${e.message}`);
    if (e.status === 403) {
      console.error("→ Webhooks need an admin/owner role on the org and a paid plan.");
    }
    if (e.status === 409) {
      console.error("→ A subscription for that exact URL already exists. Run `list`.");
    }
    process.exit(1);
  }

  console.log(`uri:    ${created.uri}`);
  console.log(`events: ${created.events.join(", ")}`);
  console.log(`state:  ${created.state}`);

  const where = writeKeyToEnvLocal(signingKey);
  // ASCII only: the previous version framed this in box-drawing characters,
  // which a Windows console renders as blocks and cannot be copied out of.
  console.log(`\n${"=".repeat(60)}`);
  console.log(`SIGNING KEY SAVED -> ${where}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\nThis key is OURS — Calendly stores it write-only and never`);
  console.log(`returns it, so .env.local is the only copy that exists.`);
  console.log(`Copy that value into Vercel as CALENDLY_WEBHOOK_SIGNING_KEY`);
  console.log(`(Production), then redeploy. To read it back:`);
  console.log(`\n  npm run sales:webhook -- key\n`);
} else if (command === "key") {
  // Reads .env.local, not Calendly — the API never returns a signing key after
  // creation, not in the list response and not in a direct GET (verified).
  // This file is the only copy that exists.
  rule("SIGNING KEY (from .env.local)");
  let line = null;
  try {
    line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("CALENDLY_WEBHOOK_SIGNING_KEY="));
  } catch {}
  if (!line || line.split("=")[1]?.trim() === "") {
    console.error("Not in .env.local.");
    console.error("Calendly cannot re-issue it. Delete the subscription and create a new one:");
    console.error("  npm run sales:webhook -- list");
    console.error("  npm run sales:webhook -- delete --uri=<uri>");
    console.error("  npm run sales:webhook -- create --url=https://wedecypher.co");
    process.exit(1);
  }
  console.log(line);
  console.log(`\nPaste the part after the "=" into Vercel, then redeploy.`);
} else if (command === "delete") {
  const uri = typeof argv.uri === "string" ? argv.uri : null;
  if (!uri) {
    console.error("Usage: node scripts/calendly-webhook.mjs delete --uri=<subscription uri>");
    process.exit(1);
  }
  const uuid = uri.split("/").pop();
  await calendly(`/webhook_subscriptions/${uuid}`, { method: "DELETE" });
  console.log(`\nDeleted ${uri}`);
} else {
  console.log(`
Usage:
  npm run sales:webhook -- list
  npm run sales:webhook -- create --url=https://wedecypher.co
  npm run sales:webhook -- key                     # re-read it from .env.local
  npm run sales:webhook -- delete --uri=<uri>
`);
}
