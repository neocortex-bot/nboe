import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generateBookingCode } from "@/lib/bookingCode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Rocket, Copy, Trash2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, Search, Plus, Monitor } from "lucide-react";
import StationDeployResults from "@/components/admin/StationDeployResults";
import CaseTransferList from "@/components/admin/CaseTransferList";
import DeployedStationsTable from "@/components/admin/DeployedStationsTable";

interface SessionManagerProps {
  examMode: string;
}

const SessionManager = ({ examMode }: SessionManagerProps) => {
  const [selectedCasesByMode, setSelectedCasesByMode] = useState<Record<string, { id: string; title: string }[]>>({
    oral_board: [],
    panel_exam: [],
  });
  const [pcCount, setPcCount] = useState(1);
  const [deployedTokens, setDeployedTokens] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const selectedCases = selectedCasesByMode[examMode] ?? [];
  const modeLabel = examMode === "oral_board" ? "Oral Board" : "Panel";
  const setSelectedCases = (nextCases: { id: string; title: string }[]) => {
    setSelectedCasesByMode((current) => ({ ...current, [examMode]: nextCases }));
  };

  const { data: cases = [] } = useQuery({
    queryKey: ["clinical_cases"],
    queryFn: async () => {
      // Fetch all fields with source and status for filtering/preview
      const { data, error } = await supabase
        .from("clinical_cases")
        .select("*")
        .eq("status", "published") // ONLY publishable cases
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Merge with case_answer_keys for complete data
      const { data: answerKeys } = await supabase
        .from("case_answer_keys")
        .select("case_id, answer_key_text, checklist_rubric");
      
      const akMap = new Map(
        (answerKeys || []).map((ak: any) => [ak.case_id, ak])
      );
      
      return (data || []).map((c: any) => ({
        ...c,
        answer_key_text: c.answer_key_text || akMap.get(c.id)?.answer_key_text,
        checklist_rubric: c.checklist_rubric || akMap.get(c.id)?.checklist_rubric,
      }));
    },
  });

  const casesForMode = cases.filter((clinicalCase: any) => clinicalCase.exam_mode === examMode);

  const deployMutation = useMutation({
    mutationFn: async () => {
      if (selectedCases.length === 0) throw new Error("Pilih minimal satu case");
      if (pcCount < 1 || pcCount > 50) throw new Error("Jumlah PC harus 1-50");

      const tokens: string[] = [];

      for (let pc = 0; pc < pcCount; pc++) {
        const token = generateBookingCode();

        // Create first session
        const { data: sessionData, error: sessionError } = await supabase
          .from("exam_sessions")
          .insert({ case_id: selectedCases[0].id, station_token: token, status: "waiting" })
          .select("id")
          .single();
        if (sessionError) throw sessionError;

        // Create sequence items
        const sequenceItems = selectedCases.map((c, i) => ({
          station_token: token,
          case_id: c.id,
          sequence_order: i + 1,
          session_id: i === 0 ? sessionData.id : null,
        }));

        const { error: seqError } = await supabase.from("exam_sequence_items").insert(sequenceItems);
        if (seqError) throw seqError;

        tokens.push(token);
      }

      return tokens;
    },
    onSuccess: (tokens) => {
      queryClient.invalidateQueries({ queryKey: ["exam_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["deployed_stations"] });
      setDeployedTokens(tokens);
      setShowResults(true);
      setSelectedCases([]);
      setPcCount(1);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Deploy Session {modeLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CaseTransferList
            cases={casesForMode}
            selectedCases={selectedCases}
            onSelectedCasesChange={setSelectedCases}
          />

          {selectedCases.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <label className="text-sm font-medium">Jumlah PC/Monitor:</label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPcCount((v) => Math.max(1, v - 1))}
                    disabled={pcCount <= 1}
                  >
                    <span className="text-lg leading-none">−</span>
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={pcCount || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") { setPcCount(0); return; }
                      const num = parseInt(val);
                      if (!isNaN(num)) setPcCount(Math.min(50, num));
                    }}
                    className="w-16 text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPcCount((v) => Math.min(50, v + 1))}
                    disabled={pcCount >= 50}
                  >
                    <span className="text-lg leading-none">+</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={() => deployMutation.mutate()}
            disabled={selectedCases.length === 0 || deployMutation.isPending || pcCount < 1}
            className="w-full sm:w-auto"
          >
            <Rocket className="h-4 w-4 mr-2" />
            Deploy {pcCount > 1 ? `${pcCount} Session ${modeLabel}` : `Session ${modeLabel}`}
            {selectedCases.length > 1 ? ` (${selectedCases.length} ujian)` : ""}
          </Button>
        </CardContent>
      </Card>

      <DeployedStationsTable examMode={examMode} />

      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Station Deployed! 🚀</DialogTitle>
            <DialogDescription>
              {deployedTokens.length} station berhasil di-deploy. Ketik kode di browser PC station.
            </DialogDescription>
          </DialogHeader>
          <StationDeployResults tokens={deployedTokens} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SessionManager;
