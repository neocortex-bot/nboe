import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Upload, FileSpreadsheet, Eye, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import CaseForm from "./CaseForm";
import AssetUploader from "./AssetUploader";
import ExcelImporter from "./ExcelImporter";
import { Link } from "react-router-dom";

interface ClinicalCase {
  id: string;
  title: string;
  exam_mode: string;
  initial_prompt: string;
  checklist_rubric: any;
  time_limit_seconds: number;
  reading_time_seconds: number;
  questions_text: string;
  answer_key_text: string;
  show_results_to_candidate: boolean;
  status?: string;
  source?: string;
  rubric_mode?: string;
  created_by?: string | null;
}

const CaseManager = () => {
  const [editingCase, setEditingCase] = useState<ClinicalCase | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [assetCaseId, setAssetCaseId] = useState<string | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [examGroup, setExamGroup] = useState("oral_board");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isMasterAdmin } = useAuth();

  const canManage = (c: ClinicalCase) =>
    isMasterAdmin || (!!c.created_by && c.created_by === user?.id);

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["clinical_cases"],
    queryFn: async () => {
      // Fetch cases + their answer keys from the secure table
      const { data: casesData, error } = await supabase
        .from("clinical_cases")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch answer keys (admin-only table)
      const { data: answerKeys } = await supabase
        .from("case_answer_keys")
        .select("case_id, answer_key_text, checklist_rubric");

      const akMap = new Map(
        (answerKeys || []).map((ak: any) => [ak.case_id, ak])
      );

      // Merge: prefer case_answer_keys data over clinical_cases columns
      return (casesData || []).map((c: any) => {
        const ak = akMap.get(c.id);
        return {
          ...c,
          answer_key_text: ak?.answer_key_text ?? c.answer_key_text,
          checklist_rubric: ak?.checklist_rubric ?? c.checklist_rubric,
          // Normalize: published by default if status missing (older rows)
          status: c.status ?? "published",
          source: c.source ?? (c.created_by ? "admin" : "agent_api"),
          rubric_mode: c.rubric_mode ?? (Array.isArray(c.checklist_rubric) || Array.isArray((c.checklist_rubric as any)?.items) ? "checklist" : "none"),
        } as ClinicalCase;
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinical_cases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical_cases"] });
      toast({ title: "Case deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleEdit = (c: ClinicalCase) => {
    setEditingCase(c);
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingCase(null);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingCase(null);
  };

  const filteredCases = cases.filter((clinicalCase) => clinicalCase.exam_mode === examGroup);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Clinical Cases</CardTitle>
        <div className="flex gap-2">
          <Button onClick={() => setShowImporter(true)} variant="outline" size="sm">
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Import Excel
          </Button>
          <Button onClick={handleCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" /> New Case
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={examGroup} onValueChange={setExamGroup} className="mb-5">
          <TabsList>
            <TabsTrigger value="oral_board">Oral Board</TabsTrigger>
            <TabsTrigger value="panel_exam">Panel</TabsTrigger>
          </TabsList>
        </Tabs>
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : filteredCases.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Belum ada soal {examGroup === "oral_board" ? "Oral Board" : "Panel"}.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Time (s)</TableHead>
                <TableHead>Rubric Items</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCases.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {c.source === 'agent_api' && (
                        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-200">
                          AI
                        </Badge>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        c.status === 'published' 
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : c.status === 'draft'
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : 'bg-gray-100 text-gray-800 border-gray-200'
                      }`}>
                        {c.status === 'published' && 'Published'}
                        {c.status === 'draft' && 'Pending Review'}
                        {c.status === 'rejected' && 'Rejected'}
                      </span>
                      {c.rubric_mode !== 'checklist' && (
                        <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-200">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          No Rubric
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{c.exam_mode === "oral_board" ? "Oral Board" : "Panel Exam"}</TableCell>
                  <TableCell>{c.time_limit_seconds}</TableCell>
                  <TableCell>{Array.isArray(c.checklist_rubric) ? c.checklist_rubric.length : (Array.isArray(c.checklist_rubric?.items) ? c.checklist_rubric.items.length : 0)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    {canManage(c) ? (
                      <>
                        {/* Link to preview page for full-width review */}
                        <Link to={`/admin/case/preview/${c.id}`}>
                          <Button variant="ghost" size="icon" title="Review in Preview">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" onClick={() => setAssetCaseId(c.id)}>
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3.5 w-3.5" /> Hanya lihat
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showForm} onOpenChange={(o) => !o && handleFormClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCase ? "Edit Case" : "Create New Case"}</DialogTitle>
          </DialogHeader>
          <CaseForm existingCase={editingCase} onClose={handleFormClose} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!assetCaseId} onOpenChange={(o) => !o && setAssetCaseId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Assets</DialogTitle>
          </DialogHeader>
          {assetCaseId && <AssetUploader caseId={assetCaseId} />}
        </DialogContent>
      </Dialog>

      <Dialog open={showImporter} onOpenChange={(o) => !o && setShowImporter(false)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Soal dari Excel</DialogTitle>
          </DialogHeader>
          <ExcelImporter onClose={() => setShowImporter(false)} />
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CaseManager;
