import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 10;

interface DeployedStationsTableProps {
  examMode: string;
}

const DeployedStationsTable = ({ examMode }: DeployedStationsTableProps) => {
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stationsResult, isLoading } = useQuery({
    queryKey: ["deployed_stations", examMode, page],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select("id, station_token, status, created_at, clinical_cases(title, exam_mode), profiles!exam_sessions_current_candidate_id_fkey(full_name, nim)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const matchingSessions = (data || []).filter(
        (session: any) => session.clinical_cases?.exam_mode === examMode
      );
      const from = page * PAGE_SIZE;
      return {
        sessions: matchingSessions.slice(from, from + PAGE_SIZE),
        total: matchingSessions.length,
      };
    },
  });

  useEffect(() => setPage(0), [examMode]);

  const sessions = stationsResult?.sessions || [];
  const totalPages = Math.ceil((stationsResult?.total || 0) / PAGE_SIZE);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: relatedResults, error: relatedResultsError } = await supabase
        .from("exam_results")
        .select("id, audio_file_url")
        .eq("session_id", id);

      if (relatedResultsError) throw relatedResultsError;

      const audioPaths = (relatedResults ?? [])
        .map((result) => result.audio_file_url)
        .filter((path): path is string => !!path);

      if (audioPaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("exam-audio")
          .remove(audioPaths);
        if (storageError) {
          console.warn("Failed to delete related audio files:", storageError);
        }
      }

      const { error: deleteResultsError } = await supabase
        .from("exam_results")
        .delete()
        .eq("session_id", id);
      if (deleteResultsError) throw deleteResultsError;

      const { error: deleteSessionError } = await supabase
        .from("exam_sessions")
        .delete()
        .eq("id", id);
      if (deleteSessionError) throw deleteSessionError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployed_stations"] });
      queryClient.invalidateQueries({ queryKey: ["exam_results_admin"] });
      toast({ title: "Session berhasil dihapus" });
    },
    onError: (e: Error) => {
      toast({ title: "Gagal menghapus session", description: e.message, variant: "destructive" });
    },
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "waiting": return "secondary";
      case "active": return "default";
      case "completed": return "outline";
      default: return "destructive";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployed Sessions — {examMode === "oral_board" ? "Oral Board" : "Panel"}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Belum ada station yang di-deploy.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode Station</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Peserta</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-mono text-base font-bold tracking-widest">{s.station_token}</span>
                    </TableCell>
                    <TableCell className="text-sm">{s.clinical_cases?.title ?? "—"}</TableCell>
                    <TableCell>
                      {s.profiles ? (
                        <div>
                          <span className="font-medium text-sm">{s.profiles.full_name}</span>
                          {s.profiles.nim && (
                            <span className="text-xs text-muted-foreground ml-1">({s.profiles.nim})</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColor(s.status)}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/station/${s.station_token}`);
                          toast({ title: "URL disalin" });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Hapus session ini? Hasil ujian terkait juga akan dihapus agar kandidat bisa retake.")) {
                            deleteMutation.mutate(s.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DeployedStationsTable;
