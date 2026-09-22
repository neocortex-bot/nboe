import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ParsedCase {
  title: string;
  exam_mode: string;
  initial_prompt: string;
  questions_text: string;
  answer_key_text: string;
  reading_time_seconds: number;
  time_limit_seconds: number;
  show_results_to_candidate: boolean;
  rubric: { item_text: string; points: number; is_critical: boolean }[];
  errors: string[];
}

interface ExcelImporterProps {
  onClose: () => void;
}

const VALID_MODES = ["oral_board", "panel_exam"];

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  const casesData = [
    ["title", "exam_mode", "initial_prompt", "questions_text", "answer_key_text", "reading_time_seconds", "time_limit_seconds", "show_results_to_candidate"],
    ["Kasus Pneumonia", "oral_board", "Pasien laki-laki 55 tahun datang dengan keluhan batuk berdahak dan demam tinggi selama 3 hari.", "1. Apa diagnosis kerja Anda?\n2. Pemeriksaan penunjang apa yang Anda usulkan?\n3. Bagaimana tatalaksana pasien ini?", "Diagnosis: Pneumonia komunitas\nPemeriksaan: Rontgen thorax, darah lengkap, kultur sputum\nTatalaksana: Antibiotik empiris, suportif", 120, 360, false],
  ];
  const wsCases = XLSX.utils.aoa_to_sheet(casesData);
  wsCases["!cols"] = [
    { wch: 25 }, { wch: 15 }, { wch: 50 }, { wch: 40 }, { wch: 40 },
    { wch: 22 }, { wch: 20 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCases, "Cases");

  const rubricData = [
    ["case_title", "item_text", "points", "is_critical"],
    ["Kasus Pneumonia", "Menyebutkan diagnosis pneumonia komunitas", 10, true],
    ["Kasus Pneumonia", "Mengusulkan rontgen thorax", 8, false],
    ["Kasus Pneumonia", "Menyebutkan antibiotik empiris yang tepat", 10, true],
    ["Kasus Pneumonia", "Menjelaskan tatalaksana suportif", 5, false],
  ];
  const wsRubric = XLSX.utils.aoa_to_sheet(rubricData);
  wsRubric["!cols"] = [{ wch: 25 }, { wch: 45 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsRubric, "Rubric");

  XLSX.writeFile(wb, "template_soal_exam.xlsx");
}

function parseExcel(file: File): Promise<ParsedCase[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });

        const casesSheet = wb.Sheets["Cases"];
        const rubricSheet = wb.Sheets["Rubric"];

        if (!casesSheet) {
          reject(new Error("Sheet 'Cases' tidak ditemukan. Pastikan menggunakan template yang benar."));
          return;
        }

        const casesRaw: any[] = XLSX.utils.sheet_to_json(casesSheet);
        const rubricRaw: any[] = rubricSheet ? XLSX.utils.sheet_to_json(rubricSheet) : [];

        // Group rubric by case_title
        const rubricMap = new Map<string, { item_text: string; points: number; is_critical: boolean }[]>();
        for (const r of rubricRaw) {
          const key = String(r.case_title || "").trim();
          if (!key) continue;
          if (!rubricMap.has(key)) rubricMap.set(key, []);
          rubricMap.get(key)!.push({
            item_text: String(r.item_text || "").trim(),
            points: Number(r.points) || 0,
            is_critical: r.is_critical === true || String(r.is_critical).toUpperCase() === "TRUE",
          });
        }

        const parsed: ParsedCase[] = casesRaw.map((row) => {
          const errors: string[] = [];
          const title = String(row.title || "").trim();
          const exam_mode = String(row.exam_mode || "").trim();

          if (!title) errors.push("Title wajib diisi");
          if (!VALID_MODES.includes(exam_mode)) errors.push(`exam_mode harus: ${VALID_MODES.join(" / ")}`);

          const rubric = rubricMap.get(title) || [];
          const invalidRubric = rubric.filter((r) => !r.item_text);
          if (invalidRubric.length > 0) errors.push(`${invalidRubric.length} rubric item tanpa teks`);

          return {
            title,
            exam_mode: VALID_MODES.includes(exam_mode) ? exam_mode : "oral_board",
            initial_prompt: String(row.initial_prompt || "").trim(),
            questions_text: String(row.questions_text || "").trim(),
            answer_key_text: String(row.answer_key_text || "").trim(),
            reading_time_seconds: Number(row.reading_time_seconds) || 120,
            time_limit_seconds: Number(row.time_limit_seconds) || 360,
            show_results_to_candidate: row.show_results_to_candidate === true || String(row.show_results_to_candidate).toUpperCase() === "TRUE",
            rubric,
            errors,
          };
        });

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsArrayBuffer(file);
  });
}

const ExcelImporter = ({ onClose }: ExcelImporterProps) => {
  const [parsed, setParsed] = useState<ParsedCase[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const validCases = parsed?.filter((c) => c.errors.length === 0) || [];
  const hasErrors = parsed?.some((c) => c.errors.length > 0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const result = await parseExcel(file);
      if (result.length === 0) {
        toast({ title: "File kosong", description: "Tidak ada data di sheet Cases.", variant: "destructive" });
      } else {
        setParsed(result);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const importMutation = useMutation({
    mutationFn: async (cases: ParsedCase[]) => {
      for (const c of cases) {
        // Insert clinical_case
        const { data: inserted, error } = await supabase
          .from("clinical_cases")
          .insert({
            title: c.title,
            exam_mode: c.exam_mode,
            initial_prompt: c.initial_prompt,
            questions_text: c.questions_text,
            answer_key_text: c.answer_key_text,
            reading_time_seconds: c.reading_time_seconds,
            time_limit_seconds: c.time_limit_seconds,
            show_results_to_candidate: c.show_results_to_candidate,
            checklist_rubric: {
              enabled: c.rubric.length > 0,
              items: c.rubric.map((r) => ({
                text: r.item_text,
                points: r.points,
                isCritical: r.is_critical,
              })),
            },
            rubric_mode: c.rubric.length > 0 ? "checklist" : "none",
          })
          .select("id")
          .single();
        if (error) throw new Error(`Gagal insert "${c.title}": ${error.message}`);

        // Insert answer key
        if (inserted) {
          const { error: akError } = await supabase
            .from("case_answer_keys")
            .insert({
              case_id: inserted.id,
              answer_key_text: c.answer_key_text,
              checklist_rubric: {
                enabled: c.rubric.length > 0,
                items: c.rubric.map((r) => ({
                  text: r.item_text,
                  points: r.points,
                  isCritical: r.is_critical,
                })),
              },
            });
          if (akError) throw new Error(`Gagal insert answer key "${c.title}": ${akError.message}`);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical_cases"] });
      toast({ title: "Import berhasil", description: `${validCases.length} kasus berhasil diimport.` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" /> Download Template
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={loading}>
          <Upload className="h-4 w-4 mr-2" /> {loading ? "Membaca..." : "Upload Excel"}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
      </div>

      {parsed && (
        <>
          <div className="border rounded-md overflow-auto max-h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Waktu (s)</TableHead>
                  <TableHead>Rubric</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.map((c, i) => (
                  <TableRow key={i} className={c.errors.length > 0 ? "bg-destructive/10" : ""}>
                    <TableCell>
                      {c.errors.length > 0 ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{c.title || <span className="text-muted-foreground italic">kosong</span>}</TableCell>
                    <TableCell>{c.exam_mode === "oral_board" ? "Oral Board" : c.exam_mode === "panel_exam" ? "Panel Exam" : c.exam_mode}</TableCell>
                    <TableCell>{c.time_limit_seconds}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.rubric.length} item</Badge>
                    </TableCell>
                    <TableCell>
                      {c.errors.length > 0 ? (
                        <span className="text-sm text-destructive">{c.errors.join("; ")}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">OK</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {validCases.length} dari {parsed.length} kasus valid
              {hasErrors && " — perbaiki baris merah di Excel lalu upload ulang"}
            </p>
            <Button
              onClick={() => importMutation.mutate(validCases)}
              disabled={validCases.length === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? "Mengimport..." : `Import ${validCases.length} Kasus`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ExcelImporter;
