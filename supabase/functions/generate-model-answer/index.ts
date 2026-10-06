import { getExamAiContext, json, corsHeaders, parseRubric } from "../_shared/exam-ai-access.ts";
import { examStream } from "../_shared/exam-stream.ts";
import { getOpenAIConfig, openAIChat } from "../_shared/openai.ts";
const WPM = 130;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    if (body.force != null && typeof body.force !== "boolean") return json({ error: "force harus berupa boolean." }, 400);
    const { result_id, force } = body;
    const context = await getExamAiContext(req, result_id);
    if (context.response) return context.response;
    if (!context.canReview) return json({ error: "Peninjauan hasil belum diizinkan oleh penguji." }, 403);
    const { admin, result, session } = context;
    const report = result.ai_score_report && typeof result.ai_score_report === "object" && !Array.isArray(result.ai_score_report) ? result.ai_score_report : {};
    if (report.modelAnswer && !force) return json({ modelAnswer: report.modelAnswer });
    const openai = getOpenAIConfig();
    if (!openai) return json({ error: "Konfigurasi OpenAI belum tersedia. Setel OPENAI_API_KEY di Supabase secrets." }, 500);
    const [{ data: cc, error: caseError }, { data: keys, error: keyError }] = await Promise.all([
      admin.from("clinical_cases").select("title, initial_prompt, questions_text, time_limit_seconds").eq("id", session.case_id).single(),
      admin.from("case_answer_keys").select("answer_key_text, checklist_rubric").eq("case_id", session.case_id).maybeSingle(),
    ]);
    if (caseError || !cc) return json({ error: "Soal tidak ditemukan." }, 404);
    if (keyError) return json({ error: "Kunci jawaban gagal dimuat." }, 500);
    const seconds = cc?.time_limit_seconds ?? 360;
    const minutes = Math.max(1, Math.round(seconds / 60));
    const wordBudget = Math.round((seconds / 60) * WPM);
    const rubric = parseRubric(keys?.checklist_rubric);
    const critical = rubric.filter((r) => r.isCritical);

    const prompt = `Anda adalah dokter peserta ujian lisan (oral board) teladan. Simulasikan jawaban LISAN ideal untuk kasus berikut, seolah diucapkan langsung kepada penguji dalam batas waktu ${minutes} menit (${seconds} detik).

ATURAN:
- Bahasa Indonesia, gaya lisan natural, terstruktur, langsung ke poin.
- Panjang maksimal ±${wordBudget} kata (kecepatan bicara normal ${WPM} kata/menit). Jangan melebihi.
${rubric.length ? `- WAJIB mencakup SETIAP butir rubrik di bawah sehingga semua butir LULUS. Jawaban ini menjadi acuan peserta, jadi setiap butir harus benar-benar tersurat.
- Setiap butir rubrik HARUS muncul sebagai kalimat yang jelas di dalam jawaban, memakai istilah klinis baku yang tertulis pada butir tersebut (sebut istilahnya, bukan hanya menyiratkan).
- Butir KRITIS wajib disebut eksplisit dan jelas: ${critical.map((c) => `"${c.text}"`).join("; ") || "(tidak ada)"}.` : "- Cakup seluruh poin penting kunci jawaban."}
- Urutkan sesuai pertanyaan. Gunakan judul singkat per bagian (mis. "Pertanyaan 1:").
- Jangan menambahkan penjelasan meta, hanya teks jawaban yang diucapkan.
- Tulis teks biasa tanpa Markdown bold/italic. Jangan menjanjikan kelulusan; cakup kriteria berdasarkan kunci jawaban.

CONTOH POLA KALIMAT (setiap butir diucapkan sebagai pernyataan tersendiri):
- "ARNI adalah singkatan dari Angiotensin Receptor-Neprilysin Inhibitor."
- "ACE-inhibitor menghambat degradasi bradikinin karena ACE sama dengan kininase II."
- "Jika pasien beralih dari ACE-inhibitor ke ARNI, harus ada washout period 36 jam."

KASUS: ${cc?.title ?? ""}
${cc?.initial_prompt ? `SKENARIO:\n${cc.initial_prompt}\n` : ""}
${cc?.questions_text ? `PERTANYAAN:\n${cc.questions_text}\n` : ""}
${keys?.answer_key_text?.trim()
  ? `KUNCI JAWABAN (acuan utama — jawaban wajib sejalan dengan kunci ini):\n${keys.answer_key_text}\n`
  : `KUNCI JAWABAN: (TIDAK TERSEDIA — soal ini belum memiliki kunci jawaban. Susun jawaban HANYA dari rubrik di bawah dan pengetahuan pedoman terkini, dan jangan mengarang angka atau kriteria yang tidak ada di rubrik.)\n`}
${rubric.length ? `RUBRIK:\n${rubric.map((r, i) => `${i + 1}. ${r.text} (${r.points} poin${r.isCritical ? ", KRITIS" : ""})`).join("\n")}` : ""}`;

    return examStream(async () => {
      const text = await openAIChat(
        openai,
        [{ role: "user", content: prompt }],
        { signal: req.signal },
      );
      if (!text) throw new Error("AI tidak menghasilkan jawaban contoh.");
      const modelAnswer = { text, wordCount: text.split(/\s+/).filter(Boolean).length, timeLimitSeconds: seconds, wpm: WPM, generatedAt: new Date().toISOString() };
      const { data: latest } = await admin.from("exam_results").select("ai_score_report").eq("id", result_id).single();
      const latestReport = latest?.ai_score_report && typeof latest.ai_score_report === "object" && !Array.isArray(latest.ai_score_report) ? latest.ai_score_report : {};
      const { error } = await admin.from("exam_results").update({ ai_score_report: { ...latestReport, modelAnswer } }).eq("id", result_id);
      if (error) throw new Error("Jawaban contoh gagal disimpan.");
      return { modelAnswer };
    });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
