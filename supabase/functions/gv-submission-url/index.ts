// gv-submission-url
//
// Hands the site owner a download link for one game submission. Players can
// add to the private 'submissions' bucket but never read it (see
// submit/submit.sql), so the analytics dashboard asks here instead:
//
//   POST { secret, id }  ->  { url, name, expires_in }
//
// secret is the dashboard secret, the same one every owner function in the
// database asks for, and url works for 10 minutes. Deployed with verify_jwt
// off because that secret is the check.

import { createClient } from "npm:@supabase/supabase-js@2";

const LINK_SECONDS = 10 * 60;
const ORIGINS_MS = 60 * 1000;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The origins public.gv_allowed_origins() lets in: the site, local testing on
// port 8000 and every active mirror. Read again at most once a minute. When
// the read fails the last list stays and the next request tries again, so
// on a cold start with the database down no origin is let in.
let origins: string[] = [];
let originsAt = 0;

async function allowedOrigins(): Promise<string[]> {
  if (Date.now() - originsAt < ORIGINS_MS) return origins;
  const read = await db.rpc("gv_allowed_origins");
  if (!read.error && Array.isArray(read.data)) {
    origins = read.data;
    originsAt = Date.now();
  }
  return origins;
}

async function corsHeaders(origin: string | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
  if (origin && (await allowedOrigins()).includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

// Named after the game rather than the stored path, which starts with the
// sender's account id.
function fileName(id: number, title: string): string {
  const safe = title.replace(/[^A-Za-z0-9 ._-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return "submission-" + id + (safe ? "-" + safe : "") + ".zip";
}

Deno.serve(async (req) => {
  const cors = await corsHeaders(req.headers.get("origin"));
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  let body: { secret?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "send JSON" }, 400);
  }
  const secret = typeof body.secret === "string" ? body.secret : "";
  const id = Number(body.id);
  if (!secret || !Number.isSafeInteger(id) || id < 1) {
    return reply({ error: "secret and id are needed" }, 400);
  }

  const check = await db.rpc("analytics_check", { p_secret: secret });
  if (check.error) return reply({ error: "could not check the secret" }, 500);
  if (check.data !== true) return reply({ error: "not allowed" }, 403);

  const found = await db.from("gv_submissions").select("path, title").eq("id", id).maybeSingle();
  if (found.error) return reply({ error: "could not read submissions" }, 500);
  if (!found.data) return reply({ error: "no such submission" }, 404);

  const name = fileName(id, found.data.title || "");
  const signed = await db.storage.from("submissions")
    .createSignedUrl(found.data.path, LINK_SECONDS, { download: name });
  if (signed.error || !signed.data) return reply({ error: "the file is missing" }, 404);

  return reply({ url: signed.data.signedUrl, name, expires_in: LINK_SECONDS });
});
