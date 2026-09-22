import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CaseManager from "@/components/admin/CaseManager";
import SessionManager from "@/components/admin/SessionManager";
import ParticipantList from "@/components/admin/ParticipantList";
import ResultsViewer from "@/components/admin/ResultsViewer";
import { LogOut, BookOpen, Users, Radio } from "lucide-react";

const AdminDashboard = () => {
  const { signOut, user } = useAuth();
  const [sessionExamMode, setSessionExamMode] = useState("oral_board");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </header>

      <main className="container mx-auto p-6">
        <Tabs defaultValue="cases">
          <TabsList className="mb-6">
            <TabsTrigger value="cases" className="gap-2">
              <BookOpen className="h-4 w-4" /> Exam Details
            </TabsTrigger>
            <TabsTrigger value="participants" className="gap-2">
              <Users className="h-4 w-4" /> Participants
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2">
              <Radio className="h-4 w-4" /> Sessions
            </TabsTrigger>
          </TabsList>
          <TabsContent value="cases">
            <CaseManager />
          </TabsContent>
          <TabsContent value="participants">
            <ParticipantList />
          </TabsContent>
          <TabsContent value="sessions">
            <div className="space-y-6">
              <Tabs value={sessionExamMode} onValueChange={setSessionExamMode}>
                <TabsList>
                  <TabsTrigger value="oral_board">Oral Board</TabsTrigger>
                  <TabsTrigger value="panel_exam">Panel</TabsTrigger>
                </TabsList>
              </Tabs>
              <SessionManager examMode={sessionExamMode} />
              <ResultsViewer examMode={sessionExamMode} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
