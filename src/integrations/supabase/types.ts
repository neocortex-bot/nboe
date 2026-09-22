export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      case_answer_keys: {
        Row: {
          answer_key_text: string
          case_id: string
          checklist_rubric: Json
          created_at: string
          id: string
        }
        Insert: {
          answer_key_text?: string
          case_id: string
          checklist_rubric?: Json
          created_at?: string
          id?: string
        }
        Update: {
          answer_key_text?: string
          case_id?: string
          checklist_rubric?: Json
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_answer_keys_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_assets: {
        Row: {
          answer_text: string
          asset_type: string
          asset_url: string
          case_id: string
          category: string
          created_at: string
          id: string
          trigger_keywords: string[]
        }
        Insert: {
          answer_text?: string
          asset_type?: string
          asset_url: string
          case_id: string
          category?: string
          created_at?: string
          id?: string
          trigger_keywords?: string[]
        }
        Update: {
          answer_text?: string
          asset_type?: string
          asset_url?: string
          case_id?: string
          category?: string
          created_at?: string
          id?: string
          trigger_keywords?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "case_assets_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender?: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_cases: {
        Row: {
          answer_key_text: string
          checklist_rubric: Json
          created_at: string
          created_by: string | null
          exam_mode: string
          id: string
          initial_prompt: string
          questions_text: string
          reading_time_seconds: number
          reviewed_at: string | null
          reviewed_by: string | null
          rubric_mode: string
          show_results_to_candidate: boolean
          source: string
          status: string
          time_limit_seconds: number
          title: string
        }
        Insert: {
          answer_key_text?: string
          checklist_rubric?: Json
          created_at?: string
          created_by?: string | null
          exam_mode?: string
          id?: string
          initial_prompt?: string
          questions_text?: string
          reading_time_seconds?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_mode?: string
          show_results_to_candidate?: boolean
          source?: string
          status?: string
          time_limit_seconds?: number
          title: string
        }
        Update: {
          answer_key_text?: string
          checklist_rubric?: Json
          created_at?: string
          created_by?: string | null
          exam_mode?: string
          id?: string
          initial_prompt?: string
          questions_text?: string
          reading_time_seconds?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_mode?: string
          show_results_to_candidate?: boolean
          source?: string
          status?: string
          time_limit_seconds?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_cases_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_results: {
        Row: {
          ai_score_report: Json | null
          audio_file_url: string | null
          candidate_id: string
          created_at: string
          id: string
          session_id: string
          transcript: string | null
        }
        Insert: {
          ai_score_report?: Json | null
          audio_file_url?: string | null
          candidate_id: string
          created_at?: string
          id?: string
          session_id: string
          transcript?: string | null
        }
        Update: {
          ai_score_report?: Json | null
          audio_file_url?: string | null
          candidate_id?: string
          created_at?: string
          id?: string
          session_id?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sequence_items: {
        Row: {
          case_id: string
          created_at: string
          id: string
          sequence_order: number
          session_id: string | null
          station_token: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          sequence_order: number
          session_id?: string | null
          station_token: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          sequence_order?: number
          session_id?: string | null
          station_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sequence_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sequence_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          case_id: string
          created_at: string
          current_candidate_id: string | null
          id: string
          session_start_time: string | null
          station_token: string
          status: string
        }
        Insert: {
          case_id: string
          created_at?: string
          current_candidate_id?: string | null
          id?: string
          session_start_time?: string | null
          station_token: string
          status?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          current_candidate_id?: string | null
          id?: string
          session_start_time?: string | null
          station_token?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_current_candidate_id_fkey"
            columns: ["current_candidate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          dob: string | null
          email: string
          full_name: string
          id: string
          nim: string | null
        }
        Insert: {
          created_at?: string
          dob?: string | null
          email: string
          full_name: string
          id: string
          nim?: string | null
        }
        Update: {
          created_at?: string
          dob?: string | null
          email?: string
          full_name?: string
          id?: string
          nim?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_station_sequence: {
        Args: { _completed_sequence_order: number; _station_token: string }
        Returns: {
          next_case_id: string
          next_id: string
          next_is_last: boolean
          next_sequence_order: number
          next_session_start_time: string
          next_status: string
        }[]
      }
      claim_exam_session: {
        Args: { _candidate_id: string; _session_id: string }
        Returns: Json
      }
      get_case_assets_for_display: {
        Args: { _case_id: string }
        Returns: {
          answer_text: string
          asset_type: string
          asset_url: string
          category: string
          id: string
          trigger_keywords: string[]
        }[]
      }
      get_case_display: {
        Args: { _case_id: string }
        Returns: {
          exam_mode: string
          initial_prompt: string
          questions_text: string
          reading_time_seconds: number
          show_results_to_candidate: boolean
          time_limit_seconds: number
          title: string
        }[]
      }
      get_session_by_token: {
        Args: { _token: string }
        Returns: {
          case_id: string
          id: string
          session_start_time: string
          status: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      owns_case: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
      regenerate_station_session: {
        Args: { _case_id: string; _new_token: string }
        Returns: {
          case_id: string
          id: string
          session_start_time: string
          status: string
        }[]
      }
      start_exam_timer: { Args: { _session_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "candidate"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "candidate"],
    },
  },
} as const
