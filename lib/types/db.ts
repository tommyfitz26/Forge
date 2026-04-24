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
      api_costs: {
        Row: {
          capture_id: string | null
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number | null
          output_tokens: number | null
          provider: string
          task: string
        }
        Insert: {
          capture_id?: string | null
          cost_usd: number
          created_at?: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          provider: string
          task: string
        }
        Update: {
          capture_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          provider?: string
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_costs_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          capture_id: string
          created_at: string
          id: string
          kind: string
          storage_path: string
        }
        Insert: {
          capture_id: string
          created_at?: string
          id?: string
          kind: string
          storage_path: string
        }
        Update: {
          capture_id?: string
          created_at?: string
          id?: string
          kind?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_events: {
        Row: {
          capture_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          capture_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          capture_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "capture_events_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      captures: {
        Row: {
          archive_reason: string | null
          audio_duration_seconds: number | null
          content: string
          created_at: string
          id: string
          kind: string
          original_transcript: string | null
          research_status: string | null
          source: string
          state: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archive_reason?: string | null
          audio_duration_seconds?: number | null
          content: string
          created_at?: string
          id?: string
          kind: string
          original_transcript?: string | null
          research_status?: string | null
          source?: string
          state?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archive_reason?: string | null
          audio_duration_seconds?: number | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          original_transcript?: string | null
          research_status?: string | null
          source?: string
          state?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          capture_id: string
          ended_at: string | null
          id: string
          messages: Json
          started_at: string
          turn_count: number
        }
        Insert: {
          capture_id: string
          ended_at?: string | null
          id?: string
          messages?: Json
          started_at?: string
          turn_count?: number
        }
        Update: {
          capture_id?: string
          ended_at?: string | null
          id?: string
          messages?: Json
          started_at?: string
          turn_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          completed_at: string | null
          error: string | null
          id: string
          idempotency_key: string
          job_name: string
          result: Json | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          id?: string
          idempotency_key: string
          job_name: string
          result?: Json | null
          started_at?: string
          status: string
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string
          job_name?: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      links: {
        Row: {
          capture_a: string
          capture_b: string
          confirmed_at: string | null
          created_at: string
          id: string
          kind: string
          last_suggested_at: string | null
          reason: string | null
        }
        Insert: {
          capture_a: string
          capture_b: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          kind: string
          last_suggested_at?: string | null
          reason?: string | null
        }
        Update: {
          capture_a?: string
          capture_b?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_suggested_at?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "links_capture_a_fkey"
            columns: ["capture_a"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_capture_b_fkey"
            columns: ["capture_b"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      nudges: {
        Row: {
          capture_id: string
          id: string
          question: string
          responded_at: string | null
          response_summary: string | null
          scheduled_for: string
          sent_at: string | null
          skipped_reason: string | null
        }
        Insert: {
          capture_id: string
          id?: string
          question: string
          responded_at?: string | null
          response_summary?: string | null
          scheduled_for: string
          sent_at?: string | null
          skipped_reason?: string | null
        }
        Update: {
          capture_id?: string
          id?: string
          question?: string
          responded_at?: string | null
          response_summary?: string | null
          scheduled_for?: string
          sent_at?: string | null
          skipped_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nudges_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      research: {
        Row: {
          angles: Json
          capture_id: string
          competitors: Json
          confidence: string | null
          cost_usd: number | null
          generated_at: string
          id: string
          market_context: string | null
          model: string
          raw_response: Json | null
          recent_news: Json
          sources_count: number | null
        }
        Insert: {
          angles?: Json
          capture_id: string
          competitors?: Json
          confidence?: string | null
          cost_usd?: number | null
          generated_at?: string
          id?: string
          market_context?: string | null
          model: string
          raw_response?: Json | null
          recent_news?: Json
          sources_count?: number | null
        }
        Update: {
          angles?: Json
          capture_id?: string
          competitors?: Json
          confidence?: string | null
          cost_usd?: number | null
          generated_at?: string
          id?: string
          market_context?: string | null
          model?: string
          raw_response?: Json | null
          recent_news?: Json
          sources_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "research_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          settings: Json
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          settings?: Json
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          settings?: Json
        }
        Relationships: []
      }
      weekly_summaries: {
        Row: {
          captures_included: string[]
          email_content_md: string | null
          email_message_id: string | null
          generated_at: string
          id: string
          patterns_detected: Json
          sent_at: string | null
          status: string
          user_id: string
          week_of: string
        }
        Insert: {
          captures_included?: string[]
          email_content_md?: string | null
          email_message_id?: string | null
          generated_at?: string
          id?: string
          patterns_detected?: Json
          sent_at?: string | null
          status?: string
          user_id: string
          week_of: string
        }
        Update: {
          captures_included?: string[]
          email_content_md?: string | null
          email_message_id?: string | null
          generated_at?: string
          id?: string
          patterns_detected?: Json
          sent_at?: string | null
          status?: string
          user_id?: string
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      capture_belongs_to_me: { Args: { cap_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
