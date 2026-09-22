import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  X,
  AlertTriangle,
  Eye,
  Edit3,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import RubricBuilder, { type RubricData } from "@/components/admin/RubricBuilder";
import AssetUploader from "@/components/admin/AssetUploader";
import parseRubricData from "@/lib/rubricParser";

interface CaseRow {
  id: string;
  title: string;
  exam_mode: string;
  initial_prompt: string;
  time_limit_seconds: number;
  reading_time_seconds: number;
  questions_text: string;
  answer_key_text: string;
  checklist_rubric: any;
  show_results_to_candidate: boolean;
  status: string;
  source: string;
  rubric_mode: string;
  created_by?: string | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: {
    label: "Menunggu Review",
    cls: "bg-red-100 text-red-800 border-red-200",
  },
  published: {
    label: "Published",
    cls: "bg-green-100 text-green-800 border-green-200",
  },
  rejected: {
    label: "Ditolak",
    cls: "bg-gray-100 text-gray-800 border-gray-200",
  },
};

const CasePreview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ---- State form (di-sync dari DB via useEffect) ----
  const [title, setTitle] = useState("");
  const [examMode, setExamMode] = useState("oral_board");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(600);
  const [readingTimeSeconds, setReadingTimeSeconds] = useState(180);
  const [questionsText, setQuestionsText] = useState("");
  const [answerKeyText, setAnswerKeyText] = useState("");
  const [showResultsToCandidate, setShowResultsToCandidate] = useState(false);
  const [rubricData, setRubricData] = useState<RubricData>({ enabled: false, items: [] });
  const [isEditing, setIsEditing] = useState(false);

  // ---- Fetch case + answer key ----
  const { data: caseRow, isLoading } = useQuery({
    queryKey: ["clinical_case_preview", id],
    queryFn: async (): Promise<CaseRow> => {
      if (!id) throw new Error("Case ID missing");
      const { data, error } = await supabase
        .from("clinical_cases")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;

      const ak = await supabase
        .from("case_answer_keys")
        .select("answer_key_text, checklist_rubric")
        .eq("case_id", id)
        .maybeSingle();

      return {
        ...data,
        answer_key_text: ak.data?.answer_key_text ?? data.answer_key_text ?? "",
        checklist_rubric: ak.data?.checklist_rubric ?? data.checklist_rubric,
        status: data.status ?? "published",
        source: data.source ?? "admin",
        rubric_mode: data.rubric_mode ?? "checklist",
      } as CaseRow;
    },
    enabled: !!id,
  });

  // Sync form ketika data datang
  useEffect(() => {
    if (!caseRow) return;
    setTitle(caseRow.title);
    setExamMode(caseRow.exam_mode);
    setInitialPrompt(caseRow.initial_prompt);
    setTimeLimitSeconds(caseRow.time_limit_seconds ?? 600);
    setReadingTimeSeconds(caseRow.reading_time_seconds ?? 180);
    setQuestionsText(caseRow.questions_text ?? "");
    setAnswerKeyText(caseRow.answer_key_text ?? "");
    setShowResultsToCandidate(caseRow.show_results_to_candidate ?? false);
    setRubricData(parseRubricData(caseRow.checklist_rubric));
  }, [caseRow]);

  const rubricMode = useMemo(
    () => (rubricData.enabled && rubricData.items.length > 0 ? "checklist" : "none"),
    [rubricData]
  );

  // ---- Validation ringan (gates yang sama dengan endpoint) ----
  const gates = useMemo(() => {
    const numberedTasks = (questionsText.match(/(^|\n)\s*\d+\./g) || []).length;
    const criticalCount = rubricData.items.filter((i) => i.isCritical).length;
    const totalPoints = rubricData.items.reduce((s, i) => s + i.points, 0);
    return [
      {
        label: `Vignette (initial_prompt) ≥ 400 karakter`,
        pass: initialPrompt.trim().length >= 400,
        value: `${initialPrompt.trim().length}`,
      },
      {
        label: `Tugas (questions_text) ≥ 300 karakter & ≥ 5 nomor`,
        pass: questionsText.trim().length >= 300 && numberedTasks >= 5,
        value: `${questionsText.trim().length} chr / ${numberedTasks} tugas`,
      },
      {
        label: `Kunci jawaban (answer_key_text) ≥ 800 karakter`,
        pass: answerKeyText.trim().length >= 800,
        value: `${answerKeyText.trim().length}`,
      },
      {
        label: `Rubrik: ≥ 15 butir`,
        pass: rubricData.items.length >= 15,
        value: `${rubricData.items.length}`,
      },
      {
        label: `Rubrik: ≥ 8 butir kritis`,
        pass: criticalCount >= 8,
        value: `${criticalCount}`,
      },
      {
        label: `Rubrik: total poin ≥ 40`,
        pass: totalPoints >= 40,
        value: `${totalPoints}`,
      },
    ];
  }, [initialPrompt, questionsText, answerKeyText, rubricData]);

  const allGatesPass = gates.every((g) => g.pass);

  // ---- Mutations ----
  const saveMutation = useMutation({
    mutationFn: async (action: "save" | "approve" | "reject") => {
      if (!id) throw new Error("Case ID missing");
      const payload: Record<string, unknown> = {
        title,
        exam_mode: examMode,
        initial_prompt: initialPrompt,
        time_limit_seconds: timeLimitSeconds,
        reading_time_seconds: readingTimeSeconds,
        questions_text: questionsText,
        answer_key_text: answerKeyText,
        show_results_to_candidate: showResultsToCandidate,
        checklist_rubric: { enabled: rubricData.enabled, items: rubricData.items },
        rubric_mode: rubricMode,
      };

      if (action === "approve") {
        payload.status = "published";
        payload.reviewed_at = new Date().toISOString();
        // reviewed_by diisi dari user yang sedang login
        const { data: authData } = await supabase.auth.getUser();
        payload.reviewed_by = authData.user?.id ?? null;
      } else if (action === "reject") {
        payload.status = "rejected";
        payload.reviewed_at = new Date().toISOString();
      }

      const { error } = await supabase.from("clinical_cases").update(payload).eq("id", id);
      if (error) throw error;

      // Sinkron ke tabel kunci jawaban
      const answerKeyPayload: Database["public"]["Tables"]["case_answer_keys"]["Insert"] = {
        case_id: id,
        answer_key_text: answerKeyText,
        checklist_rubric: { enabled: rubricData.enabled, items: rubricData.items } as unknown as Json,
      };
      const { error: akErr } = await supabase
        .from("case_answer_keys")
        .upsert(answerKeyPayload, { onConflict: "case_id" });
      if (akErr) throw akErr;
    },
    onSuccess: (_data, action) => {
      queryClient.invalidateQueries({ queryKey: ["clinical_cases"] });
      queryClient.invalidateQueries({ queryKey: ["clinical_case_preview", id] });
      const msg =
        action === "approve"
          ? "Case di-approve & dipublikasikan ✅"
          : action === "reject"
          ? "Case ditolak"
          : "Perubahan disimpan";
      toast({ title: msg });
      setIsEditing(false);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Case ID missing");
      const { error } = await supabase.from("clinical_cases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical_cases"] });
      toast({ title: "Case dihapus" });
      navigate("/admin");
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleDiscard = () => {
    if (!window.confirm("Hapus case ini permanen?")) return;
    deleteMutation.mutate();
  };

  const resetForm = () => {
    if (!caseRow) return;
    setTitle(caseRow.title);
    setExamMode(caseRow.exam_mode);
    setInitialPrompt(caseRow.initial_prompt);
    setTimeLimitSeconds(caseRow.time_limit_seconds ?? 600);
    setReadingTimeSeconds(caseRow.reading_time_seconds ?? 180);
    setQuestionsText(caseRow.questions_text ?? "");
    setAnswerKeyText(caseRow.answer_key_text ?? "");
    setShowResultsToCandidate(caseRow.show_results_to_candidate ?? false);
    setRubricData(parseRubricData(caseRow.checklist_rubric));
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!caseRow) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-3">
        <p className="text-muted-foreground">Case tidak ditemukan</p>
        <Button variant="outline" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Kembali
        </Button>
      </div>
    );
  }

  const statusMeta = STATUS_LABEL[caseRow.status] ?? STATUS_LABEL.published;
  const needsReview = caseRow.source === "agent_api" && caseRow.status === "draft";
  const isBusy = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Header */}
      <div className="mx-auto max-w-6xl mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">{title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                {caseRow.source === "agent_api" ? "AI Agent" : "Admin"}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${statusMeta.cls}`}>
                {statusMeta.label}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium border ${
                  rubricMode === "checklist"
                    ? "bg-blue-100 text-blue-800 border-blue-200"
                    : "bg-orange-100 text-orange-800 border-orange-200"
                }`}
              >
                {rubricMode === "checklist" ? "Pakai Daftar Tilik" : "Tanpa Daftar Tilik"}
              </span>
            </div>
          </div>

          <div className="flex-1" />

          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} className="gap-2">
              <Edit3 className="h-4 w-4" />
              Edit
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={resetForm} disabled={isBusy} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Batal
              </Button>
              <Button
                onClick={() => saveMutation.mutate("save")}
                disabled={isBusy}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Banner review — hanya untuk kiriman AI yang belum di-review */}
      {needsReview && (
        <div className="mx-auto max-w-6xl mb-6">
          <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
                <AlertTriangle className="h-5 w-5" />
                Soal dari AI Agent — wajib review manual sebelum dipakai
              </CardTitle>
              <CardDescription>
                Soal ini dikirim otomatis oleh AI agent dan belum tayang. Periksa kebenaran klinis,
                edit bila perlu, lalu Approve agar bisa di-deploy ke station.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quality gates */}
              <div className="space-y-2 text-sm">
                {gates.map((g) => (
                  <div key={g.label} className="flex items-start gap-2">
                    {g.pass ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    )}
                    <span className={g.pass ? "text-foreground" : "text-red-700 dark:text-red-300"}>
                      {g.label}: <span className="font-mono text-xs">{g.value}</span>
                    </span>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="flex flex-wrap gap-3 pt-1">
                <Button
                  variant="default"
                  onClick={() => saveMutation.mutate("approve")}
                  disabled={isBusy || !allGatesPass}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve & Publish
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => saveMutation.mutate("reject")}
                  disabled={isBusy}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Tolak Case
                </Button>
                <Button variant="ghost" onClick={handleDiscard} disabled={isBusy} className="gap-2">
                  Hapus Permanen
                </Button>
              </div>
              {!allGatesPass && (
                <p className="text-xs text-muted-foreground">
                  Approve dikunci sampai seluruh gerbang mutu terpenuhi (sesuai aturan endpoint).
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Body: tabs edit vs preview kandidat */}
      <div className="mx-auto max-w-6xl">
        <Tabs defaultValue="edit" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="edit" className="gap-2">
              <Edit3 className="h-4 w-4" /> Detail & Rubrik
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2">
              <Eye className="h-4 w-4" /> Preview Kandidat
            </TabsTrigger>
          </TabsList>

          {/* ============ TAB EDIT ============ */}
          <TabsContent value="edit" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Informasi Dasar</CardTitle>
                <CardDescription>Identitas soal, mode ujian, dan alokasi waktu</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Judul</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Mode Ujian</Label>
                    <Select value={examMode} onValueChange={setExamMode} disabled={!isEditing}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="oral_board">Oral Board</SelectItem>
                        <SelectItem value="panel_exam">Panel Exam</SelectItem>
                        <SelectItem value="osce">OSCE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="readingTime">Waktu Baca (detik)</Label>
                    <Input
                      id="readingTime"
                      type="number"
                      min={5}
                      max={900}
                      value={readingTimeSeconds}
                      onChange={(e) => setReadingTimeSeconds(Number(e.target.value))}
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Waktu Ujian (detik)</Label>
                    <Input
                      id="time"
                      type="number"
                      min={30}
                      max={1800}
                      value={timeLimitSeconds}
                      onChange={(e) => setTimeLimitSeconds(Number(e.target.value))}
                      disabled={!isEditing}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div className="space-y-0.5">
                    <Label>Tampilkan Nilai ke Peserta</Label>
                    <p className="text-xs text-muted-foreground">
                      Bila aktif, peserta dapat melihat hasil evaluasi AI.
                    </p>
                  </div>
                  <Switch
                    checked={showResultsToCandidate}
                    onCheckedChange={setShowResultsToCandidate}
                    disabled={!isEditing}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Vignette & Tugas</CardTitle>
                <CardDescription>Kasus klinis (fase baca) dan tugas bernomor</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt">Kasus Klinis (Initial Prompt)</Label>
                  <Textarea
                    id="prompt"
                    value={initialPrompt}
                    onChange={(e) => setInitialPrompt(e.target.value)}
                    rows={8}
                    disabled={!isEditing}
                    placeholder="Identitas pasien, RIWAYAT, PEMERIKSAAN FISIS, PENUNJANG, TUGAS..."
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="questions">Soal / Pertanyaan (5–8 tugas bernomor)</Label>
                  <Textarea
                    id="questions"
                    value={questionsText}
                    onChange={(e) => setQuestionsText(e.target.value)}
                    rows={6}
                    disabled={!isEditing}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kunci Jawaban</CardTitle>
                <CardDescription>
                  Jawaban model untuk evaluasi AI. Hanya admin yang dapat mengakses.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  id="answerKey"
                  value={answerKeyText}
                  onChange={(e) => setAnswerKeyText(e.target.value)}
                  rows={10}
                  disabled={!isEditing}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daftar Tilik (Rubrik Penilaian)</CardTitle>
                <CardDescription>
                  Mode: <strong>{rubricMode === "checklist" ? "pakai daftar tilik" : "tanpa daftar tilik"}</strong>.
                  {rubricMode === "none" && (
                    <span className="ml-2 text-orange-600 dark:text-orange-400 inline-flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Tanpa daftar tilik, penilaian sepenuhnya berdasar kunci jawaban.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RubricBuilder data={rubricData} onChange={setRubricData} />
              </CardContent>
            </Card>

            {caseRow.source === "agent_api" && caseRow.status === "published" && (
              <Card>
                <CardHeader>
                  <CardTitle>Media Assets</CardTitle>
                </CardHeader>
                <CardContent>
                  <AssetUploader caseId={caseRow.id} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============ TAB PREVIEW KANDIDAT ============ */}
          <TabsContent value="preview" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Simulasi Tampilan Kandidat
                </CardTitle>
                <CardDescription>
                  Bagaimana vignette & tugas tampil di layar kandidat (bukan di modal, halaman penuh).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border border-border p-6 bg-muted/30">
                  <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
                    Fase Membaca · {Math.round((readingTimeSeconds || 0) / 60)} menit
                  </div>
                  <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                    {initialPrompt}
                  </div>
                </div>

                <Separator />

                <div className="rounded-lg border border-border p-6 bg-background">
                  <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
                    Fase Ujian · {Math.round((timeLimitSeconds || 0) / 60)} menit · mode {examMode}
                  </div>
                  <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                    {questionsText}
                  </div>
                </div>

                <Separator />

                <div className="rounded-lg border border-border p-6">
                  <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">
                    Rubrik Penilaian ({rubricMode})
                  </div>
                  {rubricMode === "checklist" ? (
                    <ol className="space-y-1.5 text-sm text-foreground list-decimal list-inside">
                      {rubricData.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="flex-1">{item.text}</span>
                          <span className="text-xs shrink-0 bg-muted px-1.5 py-0.5 rounded">
                            {item.points} pts
                            {item.isCritical && " · kritis"}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Tidak ada daftar tilik — penilaian otomatis membandingkan jawaban kandidat
                      dengan kunci jawaban.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CasePreview;
