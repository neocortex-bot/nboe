import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import RubricBuilder, { type RubricData } from "./RubricBuilder";
import AssetUploader from "./AssetUploader";

interface CaseFormProps {
  existingCase?: {
    id: string;
    title: string;
    exam_mode: string;
    initial_prompt: string;
    checklist_rubric: any;
    time_limit_seconds: number;
    reading_time_seconds?: number;
    questions_text?: string;
    answer_key_text?: string;
    show_results_to_candidate?: boolean;
  } | null;
  onClose: () => void;
}

function normalizeItem(item: any): { text: string; points: number; isCritical: boolean } {
  if (typeof item === "string") {
    return { text: item, points: 10, isCritical: false };
  }
  return {
    text: item.text || item.item_text || String(item),
    points: item.points ?? 10,
    isCritical: item.isCritical ?? item.is_critical ?? false,
  };
}

function parseRubricData(raw: any): RubricData {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "enabled" in raw) {
    return {
      enabled: !!raw.enabled,
      items: Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [],
    };
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return { enabled: true, items: raw.map(normalizeItem) };
  }
  return { enabled: false, items: [] };
}

const CaseForm = ({ existingCase, onClose }: CaseFormProps) => {
  const [title, setTitle] = useState(existingCase?.title ?? "");
  const [examMode, setExamMode] = useState(existingCase?.exam_mode ?? "oral_board");
  const [initialPrompt, setInitialPrompt] = useState(existingCase?.initial_prompt ?? "");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(existingCase?.time_limit_seconds ?? 360);
  const [readingTimeSeconds, setReadingTimeSeconds] = useState(existingCase?.reading_time_seconds ?? 120);
  const [questionsText, setQuestionsText] = useState(existingCase?.questions_text ?? "");
  const [answerKeyText, setAnswerKeyText] = useState(existingCase?.answer_key_text ?? "");
  const [showResultsToCandidate, setShowResultsToCandidate] = useState(
    existingCase?.show_results_to_candidate ?? false
  );
  const [rubricData, setRubricData] = useState<RubricData>(
    parseRubricData(existingCase?.checklist_rubric)
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const casePayload = {
        title,
        exam_mode: examMode,
        initial_prompt: initialPrompt,
        time_limit_seconds: timeLimitSeconds,
        reading_time_seconds: readingTimeSeconds,
        questions_text: questionsText,
        show_results_to_candidate: showResultsToCandidate,
        // Keep answer_key_text and checklist_rubric on clinical_cases for backward compat
        // but the authoritative source is now case_answer_keys
        answer_key_text: answerKeyText,
        checklist_rubric: rubricData as any,
        // Deteksi mode penilaian: daftar tilik aktif hanya bila enabled & ada items
        rubric_mode: rubricData.enabled && rubricData.items.length > 0 ? "checklist" : "none",
      };

      let caseId = existingCase?.id;

      if (existingCase) {
        const { error } = await supabase.from("clinical_cases").update(casePayload).eq("id", existingCase.id);
        if (error) throw error;
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("clinical_cases")
          .insert({ ...casePayload, created_by: authData.user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        caseId = data.id;
      }

      // Upsert into case_answer_keys (admin-only table)
      if (caseId) {
        const { error: akError } = await supabase
          .from("case_answer_keys")
          .upsert(
            {
              case_id: caseId,
              answer_key_text: answerKeyText,
              checklist_rubric: rubricData as any,
            },
            { onConflict: "case_id" }
          );
        if (akError) {
          console.error("Failed to save answer keys:", akError);
          // Don't throw — the case itself was saved
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical_cases"] });
      toast({ title: existingCase ? "Case updated" : "Case created" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>Exam Mode</Label>
        <Select value={examMode} onValueChange={setExamMode}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="oral_board">Oral Board</SelectItem>
            <SelectItem value="panel_exam">Panel Exam</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt">Kasus Klinis (Initial Prompt)</Label>
        <Textarea
          id="prompt"
          value={initialPrompt}
          onChange={(e) => setInitialPrompt(e.target.value)}
          rows={5}
          placeholder="Deskripsi kasus klinis yang akan ditampilkan saat fase membaca..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="questions">Soal / Pertanyaan</Label>
        <Textarea
          id="questions"
          value={questionsText}
          onChange={(e) => setQuestionsText(e.target.value)}
          rows={4}
          placeholder="Pertanyaan yang ditampilkan setelah waktu baca selesai, bersama kasus di atas..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="answerKey">Kunci Jawaban (Answer Key)</Label>
        <p className="text-xs text-muted-foreground">
          Jawaban lengkap dan benar sebagai referensi AI untuk memberikan nilai. Data ini hanya dapat diakses oleh admin.
        </p>
        <Textarea
          id="answerKey"
          value={answerKeyText}
          onChange={(e) => setAnswerKeyText(e.target.value)}
          rows={6}
          placeholder="Tuliskan jawaban lengkap yang benar untuk setiap pertanyaan di atas..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="readingTime">Waktu Baca (detik)</Label>
          <Input
            id="readingTime"
            type="number"
            min={0}
            value={readingTimeSeconds}
            onChange={(e) => setReadingTimeSeconds(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="time">Waktu Ujian (detik)</Label>
          <Input
            id="time"
            type="number"
            min={60}
            value={timeLimitSeconds}
            onChange={(e) => setTimeLimitSeconds(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="showResults">Tampilkan Nilai ke Peserta</Label>
          <p className="text-xs text-muted-foreground">
            Bila aktif, peserta dapat melihat hasil evaluasi AI di halaman ujian mereka.
          </p>
        </div>
        <Switch
          id="showResults"
          checked={showResultsToCandidate}
          onCheckedChange={setShowResultsToCandidate}
        />
      </div>

      <RubricBuilder data={rubricData} onChange={setRubricData} />

      {existingCase?.id && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label className="text-base font-semibold">Media Assets</Label>
            <p className="text-xs text-muted-foreground">
              Upload gambar/video yang akan tampil saat kandidat meminta pemeriksaan tertentu.
            </p>
            <AssetUploader caseId={existingCase.id} />
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : existingCase ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
};

export default CaseForm;
