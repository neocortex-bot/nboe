import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-agent-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
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

// Field yang boleh di-edit. Semua opsional — hanya field yang dikirim yang diubah.
const UpdateSchema = z.object({
  title: z.string().min(15).max(200).optional(),
  exam_mode: z.enum(["oral_board", "osce", "panel_exam"]).optional(),
  reading_time_minutes: z.number().min(0.25).max(15).optional(),
  time_limit_minutes: z.number().min(0.5).max(30).optional(),
  reading_time_seconds: z.number().int().min(5).max(900).optional(),
  time_limit_seconds: z.number().int().min(30).max(1800).optional(),
  show_results_to_candidate: z.boolean().optional(),
  initial_prompt: z.string().min(400).optional(),
  questions_text: z.string().min(300).optional(),
  answer_key_text: z.string().min(800).optional(),
  checklist_rubric: z
    .object({ items: z.array(RubricItem).min(0).max(100) })
    .optional(),
  media_notes: z.array(MediaNote).optional(),
  created_by_email: z.string().email().optional(),
});

const SCHEMA_DOC = {
  endpoint: "POST /functions/v1/case-admin",
  auth_header: "X-Agent-Api-Key: <CASE_ADMIN_API_KEY>",
  usage: {
    GET: "/functions/v1/case-admin?id=<case_id> — ambil satu case (semua field, termasuk checklist_rubric).",
    PATCH: "/functions/v1/case-admin?id=<case_id> — update sebagian field case. Hanya field yang dikirim yang diubah.",
    GET_no_id: "/functions/v1/case-admin — daftar ringkas case (id, title, status, rubric_mode).",
  },
  patch_fields: {
    title: "string 15-200 chars",
    exam_mode: "'oral_board' | 'osce' | 'panel_exam'",
    reading_time_seconds: "int 5-900 (atau reading_time_minutes 0.25-15)",
    time_limit_seconds: "int 30-1800 (atau time_limit_minutes 0.5-30)",
    show_results_to_candidate: "boolean",
    initial_prompt: "string >=400 chars",
    questions_text: "string >=300 chars",
    answer_key_text: "string >=800 chars",
    checklist_rubric: "{ items: [{ text, points 1-5, isCritical }] } — bila dikirim harus >=15 items, >=8 critical, total >=40 poin; kosongkan items utk nonaktif",
    media_notes: "array",
    created_by_email: "string email",
  },
  note: "Menggunakan service role — update tidak tunduk RLS. Hanya untuk penggunaan admin/agent tepercaya.",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: wajib X-Agent-Api-Key sama dengan env CASE_ADMIN_API_KEY
  const expected = Deno.env.get("CASE_ADMIN_API_KEY");
  if (!expected) return json(500, { error: "Server missing CASE_ADMIN_API_KEY" });
  const provided = req.headers.get("x-agent-api-key");
  if (!provided || provided !== expected) {
    return json(401, { error: "Invalid or missing X-Agent-Api-Key" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // ---- GET: ambil case ----
  if (req.method === "GET") {
    if (!id) {
      // daftar ringkas (opsional query status)
      const status = url.searchParams.get("status");
      let q = supabase
        .from("clinical_cases")
        .select("id, title, exam_mode, status, source, rubric_mode, created_at");
      if (status) q = q.eq("status", status);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
      if (error) return json(500, { error: "List failed", detail: error.message });
      return json(200, { cases: data });
    }

    const { data, error } = await supabase
      .from("clinical_cases")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return json(500, { error: "Fetch failed", detail: error.message });
    if (!data) return json(404, { error: "Case not found", id });

    // sertakan answer key dari tabel terpisah bila ada
    const { data: ak } = await supabase
      .from("case_answer_keys")
      .select("answer_key_text, checklist_rubric")
      .eq("case_id", id)
      .maybeSingle();

    return json(200, { case: { ...data, answer_key: ak ?? null } });
  }

  // ---- PATCH: edit case ----
  if (req.method === "PATCH") {
    if (!id) return json(400, { error: "Missing ?id=<case_id>" });

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return json(400, { error: "Validation failed", details: parsed.error.flatten(), schema: SCHEMA_DOC });
    }
    const data = parsed.data;

    const patch: Record<string, unknown> = {};

    if (data.title !== undefined) patch.title = data.title;
    if (data.exam_mode !== undefined) patch.exam_mode = data.exam_mode;
    if (data.show_results_to_candidate !== undefined) patch.show_results_to_candidate = data.show_results_to_candidate;
    if (data.initial_prompt !== undefined) patch.initial_prompt = data.initial_prompt;
    if (data.questions_text !== undefined) patch.questions_text = data.questions_text;
    if (data.answer_key_text !== undefined) patch.answer_key_text = data.answer_key_text;
    if (data.media_notes !== undefined) patch.media_notes = data.media_notes;

    if (data.reading_time_seconds !== undefined) patch.reading_time_seconds = data.reading_time_seconds;
    else if (data.reading_time_minutes !== undefined) patch.reading_time_seconds = Math.round(data.reading_time_minutes * 60);

    if (data.time_limit_seconds !== undefined) patch.time_limit_seconds = data.time_limit_seconds;
    else if (data.time_limit_minutes !== undefined) patch.time_limit_seconds = Math.round(data.time_limit_minutes * 60);

    if (data.checklist_rubric !== undefined) {
      const items = data.checklist_rubric.items ?? [];
      // Kosongkan items untuk menonaktifkan rubric (rubric_mode='none')
      const mode = items.length > 0 ? "checklist" : "none";

      if (items.length > 0 && items.length < 15) {
        return json(400, {
          error: `Rubrik parsial tidak didukung: ${items.length} butir. Kirim ≥15 butir (checklist) atau kosongkan untuk rubric_mode=none.`,
        });
      }
      if (items.length >= 15) {
        const criticalCount = items.filter((i) => i.isCritical).length;
        const totalPoints = items.reduce((s, i) => s + i.points, 0);
        if (criticalCount < 8) {
          return json(400, { error: `At least 8 rubric items must be isCritical:true (got ${criticalCount})` });
        }
        if (totalPoints < 40) {
          return json(400, { error: `Rubric total points must be >= 40 (got ${totalPoints})` });
        }
      }

      patch.checklist_rubric = { enabled: items.length > 0, items };
      patch.rubric_mode = mode;
    }

    if (data.created_by_email !== undefined) {
      const ownerEmail = data.created_by_email.toLowerCase();
      const { data: owner } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", ownerEmail)
        .maybeSingle();
      if (owner) patch.created_by = owner.id;
    }

    const { data: updated, error: updErr } = await supabase
      .from("clinical_cases")
      .update(patch)
      .eq("id", id)
      .select("id, title, status, source, rubric_mode, checklist_rubric")
      .single();

    if (updErr) return json(500, { error: "Update failed", detail: updErr.message });
    if (!updated) return json(404, { error: "Case not found", id });

    // Sinkronkan answer key & rubric ke tabel grading
    if (data.answer_key_text !== undefined || data.checklist_rubric !== undefined) {
      const akPayload: Record<string, unknown> = {};
      if (data.answer_key_text !== undefined) akPayload.answer_key_text = data.answer_key_text;
      if (data.checklist_rubric !== undefined) akPayload.checklist_rubric = { enabled: (data.checklist_rubric.items ?? []).length > 0, items: data.checklist_rubric.items ?? [] };

      // Cek apakah baris sudah ada (hindari ketergantungan unique constraint)
      const { data: existingAk } = await supabase
        .from("case_answer_keys")
        .select("case_id")
        .eq("case_id", id)
        .maybeSingle();

      if (existingAk) {
        const { error: akUpdErr } = await supabase
          .from("case_answer_keys")
          .update(akPayload)
          .eq("case_id", id);
        if (akUpdErr) console.error(`[case-admin] answer key update failed: ${akUpdErr.message}`);
      } else {
        const { error: akInsErr } = await supabase
          .from("case_answer_keys")
          .insert({ case_id: id, ...akPayload });
        if (akInsErr) console.error(`[case-admin] answer key insert failed: ${akInsErr.message}`);
      }
    }

    const rubric = updated.checklist_rubric as { items?: unknown[] } | null;
    const items = rubric?.items ?? [];
    const criticalCount = items.filter((i: { isCritical?: boolean }) => i.isCritical).length;
    const totalPoints = items.reduce((s: number, i: { points?: number }) => s + (i.points ?? 0), 0);

    console.log(`[case-admin] Updated "${updated.title}" id=${updated.id} rubric_items=${items.length}`);
    return json(200, {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      source: updated.source,
      rubric_mode: updated.rubric_mode,
      rubric_items: items.length,
      critical_items: criticalCount,
      total_points: totalPoints,
      answer_key_synced: true,
    });
  }

  return json(405, { error: "Method not allowed (use GET or PATCH)" });
});
