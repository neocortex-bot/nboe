import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-agent-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const RubricItem = z.object({
  text: z.string().min(10).max(500),
  points: z.number().int().min(1).max(5),
  isCritical: z.boolean(),
});

const MediaNote = z.object({
  description: z.string().min(3).max(300),
  category: z.enum(["case_media", "examination", "additional_info"]).default("examination"),
  trigger_keywords: z.array(z.string().min(2)).default([]),
});

const BodySchema = z.object({
  title: z.string().min(15).max(200),
  exam_mode: z.enum(["oral_board", "osce", "panel_exam"]).default("oral_board"),
  reading_time_minutes: z.number().min(0.25).max(15).optional(),
  time_limit_minutes: z.number().min(0.5).max(30).optional(),
  reading_time_seconds: z.number().int().min(5).max(900).optional(),
  time_limit_seconds: z.number().int().min(30).max(1800).optional(),
  show_results_to_candidate: z.boolean().default(false),
  initial_prompt: z.string().min(400),
  questions_text: z.string().min(300),
  answer_key_text: z.string().min(800),
  // Rubrik bersifat opsional: bila dikirim harus ≥15 butir utuh (checklist);
  // bila tidak dikirim / items kosong → soal "tanpa daftar tilik" (rubric_mode=none),
  // penilaian murni berdasarkan answer key. Kiriman parsial (1–14 butir) ditolak.
  checklist_rubric: z
    .object({ items: z.array(RubricItem).min(0).max(100) })
    .optional(),
  media_notes: z.array(MediaNote).default([]),
  created_by_email: z.string().email().optional(),
});

const SCHEMA_DOC = {
  endpoint: "POST /functions/v1/ingest-case",
  auth_header: "X-Agent-Api-Key: <CASE_INGEST_API_KEY>",
  fields: {
    title: "string 15-200 chars, unique. Format: '<TOPIK> — <Skenario> (<Inisial>, <umur> th)'",
    exam_mode: "'oral_board' | 'osce' | 'panel_exam' (default oral_board)",
    reading_time_minutes: "number 0.25-15 (or reading_time_seconds 5-900)",
    time_limit_minutes: "number 0.5-30 (or time_limit_seconds 30-1800)",
    show_results_to_candidate: "boolean, default false",
    initial_prompt: "string >=400 chars; must contain >=3 of RIWAYAT/PEMERIKSAAN/TUGAS/EKG/LAB",
    questions_text: "string >=300 chars; >=5 numbered tasks; must NOT reveal rubric items",
    answer_key_text: "string >=800 chars; expected candidate verbalisation, numbers, thresholds",
    checklist_rubric: "{ items: [{ text, points 1-5, isCritical }] } — OPSIONAL. Bila dikirim: >=15 items, >=8 critical, total points >=40 → rubric_mode='checklist'. Bila dikosongkan/tidak dikirim → rubric_mode='none' (tanpa daftar tilik, penilaian berbasis answer key)",
    media_notes: "[{ description, category: case_media|examination|additional_info, trigger_keywords: [] }] — informational only, media uploaded manually",
    created_by_email: "optional admin email to own the case",
  },
  quality_gates: [
    "initial_prompt >= 400 chars and >=3 section markers",
    "questions_text >= 300 chars and >=5 numbered tasks",
    "answer_key_text >= 800 chars",
    "checklist_rubric OPTIONAL: bila dikirim harus >=15 items, >=8 isCritical:true, total points >=40; bila kosong/tidak dikirim -> rubric_mode=none (tanpa daftar tilik)",
    "title must be unique (409 otherwise)",
    "inserted as status=draft (menunggu review admin); source=agent_api",
  ],
  responses: { 200: "created", 400: "validation", 401: "bad token", 409: "duplicate title", 500: "server error" },
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("CASE_INGEST_API_KEY");
  if (!expected) return json(500, { error: "Server missing CASE_INGEST_API_KEY" });
  const provided = req.headers.get("x-agent-api-key");
  if (!provided || provided !== expected) {
    return json(401, { error: "Invalid or missing X-Agent-Api-Key" });
  }

  if (req.method === "GET") return json(200, SCHEMA_DOC);
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "Validation failed", details: parsed.error.flatten(), schema: SCHEMA_DOC });
  }
  const data = parsed.data;

  const readingSeconds = data.reading_time_seconds ??
    (data.reading_time_minutes ? Math.round(data.reading_time_minutes * 60) : 180);
  const limitSeconds = data.time_limit_seconds ??
    (data.time_limit_minutes ? Math.round(data.time_limit_minutes * 60) : 600);

  // Quality gates
  const promptUpper = data.initial_prompt.toUpperCase();
  const markers = ["RIWAYAT", "PEMERIKSAAN", "TUGAS", "EKG", "LAB"];
  const hits = markers.filter((m) => promptUpper.includes(m)).length;
  if (hits < 3) {
    return json(400, {
      error: "initial_prompt must include at least 3 of: RIWAYAT, PEMERIKSAAN, TUGAS, EKG, Lab",
    });
  }

  const numberedTasks = (data.questions_text.match(/(^|\n)\s*\d+\./g) || []).length;
  if (numberedTasks < 5) {
    return json(400, { error: "questions_text must contain at least 5 numbered tasks (1., 2., ...)" });
  }

  const items = data.checklist_rubric?.items ?? [];
  const rubricMode = items.length > 0 ? "checklist" : "none";
  const criticalCount = items.filter((i) => i.isCritical).length;
  const totalPoints = items.reduce((s, i) => s + i.points, 0);

  // Gerbang mutu rubrik HANYA berlaku bila pengirim memakai daftar tilik.
  // Kiriman parsial (1–14 butir) = menengah, tolak agar tidak ambigu.
  if (items.length > 0 && items.length < 15) {
    return json(400, {
      error: `Rubrik parsial tidak didukung: ${items.length} butir. Kirim ≥15 butir (checklist) atau kosongkan untuk penilaian tanpa daftar tilik (rubric_mode=none).`,
    });
  }
  if (items.length >= 15) {
    if (criticalCount < 8) {
      return json(400, { error: `At least 8 rubric items must be isCritical:true (got ${criticalCount})` });
    }
    if (totalPoints < 40) {
      return json(400, { error: `Rubric total points must be >= 40 (got ${totalPoints})` });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Uniqueness check
  const { data: existing, error: exErr } = await supabase
    .from("clinical_cases")
    .select("id")
    .eq("title", data.title)
    .maybeSingle();
  if (exErr) return json(500, { error: "DB check failed", detail: exErr.message });
  if (existing) return json(409, { error: "Case with this title already exists", id: existing.id });

  // Owner resolution
  let createdBy: string | null = null;
  const ownerEmail = (data.created_by_email ?? "izzan.rijal@gmail.com").toLowerCase();
  const { data: owner } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", ownerEmail)
    .maybeSingle();
  if (owner) createdBy = owner.id;

  const rubric = { enabled: items.length > 0, items };

  const { data: inserted, error: insErr } = await supabase
    .from("clinical_cases")
    .insert({
      title: data.title,
      exam_mode: data.exam_mode,
      reading_time_seconds: readingSeconds,
      time_limit_seconds: limitSeconds,
      show_results_to_candidate: data.show_results_to_candidate,
      initial_prompt: data.initial_prompt,
      questions_text: data.questions_text,
      answer_key_text: data.answer_key_text,
      checklist_rubric: rubric,
      created_by: createdBy,
      // Workflow: kiriman agent selalu DRAFT sampai di-review admin
      status: "draft",
      source: "agent_api",
      rubric_mode: rubricMode,
    })
    .select("id, title")
    .single();

  if (insErr) return json(500, { error: "Insert failed", detail: insErr.message });

  // Sync answer key + rubric to grading table
  const { error: akErr } = await supabase.from("case_answer_keys").insert({
    case_id: inserted.id,
    answer_key_text: data.answer_key_text,
    checklist_rubric: rubric,
  });
  if (akErr) console.error(`[ingest-case] answer key sync failed: ${akErr.message}`);

  console.log(
    `[ingest-case] Inserted "${inserted.title}" id=${inserted.id} items=${items.length} points=${totalPoints}`,
  );

  return json(200, {
    id: inserted.id,
    title: inserted.title,
    exam_mode: data.exam_mode,
    reading_time_seconds: readingSeconds,
    time_limit_seconds: limitSeconds,
    status: "draft", // menunggu review admin di halaman admin
    source: "agent_api",
    rubric_mode: rubricMode,
    rubric_items: items.length,
    critical_items: criticalCount,
    total_points: totalPoints,
    answer_key_synced: !akErr,
    media_to_upload_manually: data.media_notes,
  });
});
