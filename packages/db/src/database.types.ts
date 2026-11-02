export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          approval_id: string | null
          correlation_id: string
          created_at: string
          id: number
          metadata: Json
          project_id: string | null
          result: string
          target_id: string | null
          target_type: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          approval_id?: string | null
          correlation_id: string
          created_at?: string
          id?: never
          metadata?: Json
          project_id?: string | null
          result: string
          target_id?: string | null
          target_type?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          approval_id?: string | null
          correlation_id?: string
          created_at?: string
          id?: never
          metadata?: Json
          project_id?: string | null
          result?: string
          target_id?: string | null
          target_type?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["membership_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          client_visible: boolean
          created_at: string
          criteria: string
          id: string
          project_id: string
          status: Database["public"]["Enums"]["milestone_status"]
          target_date: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          client_visible?: boolean
          created_at?: string
          criteria?: string
          id?: string
          project_id: string
          status?: Database["public"]["Enums"]["milestone_status"]
          target_date?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          client_visible?: boolean
          created_at?: string
          criteria?: string
          id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["milestone_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          budget_usd: number
          client_name: string | null
          created_at: string
          created_by: string | null
          environments: string[]
          id: string
          name: string
          next_requirement_number: number
          next_task_number: number
          stack: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          budget_usd?: number
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          environments?: string[]
          id?: string
          name: string
          next_requirement_number?: number
          next_task_number?: number
          stack?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          budget_usd?: number
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          environments?: string[]
          id?: string
          name?: string
          next_requirement_number?: number
          next_task_number?: number
          stack?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_versions: {
        Row: {
          changed_at: string
          changed_by: string | null
          requirement_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          requirement_id: string
          snapshot: Json
          version: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          requirement_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "requirement_versions_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      requirements: {
        Row: {
          acceptance_criteria: string
          approval: Database["public"]["Enums"]["approval_state"]
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          priority: Database["public"]["Enums"]["requirement_priority"]
          project_id: string
          ref: number
          source: string | null
          statement: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          acceptance_criteria?: string
          approval?: Database["public"]["Enums"]["approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["requirement_priority"]
          project_id: string
          ref?: number
          source?: string | null
          statement: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          acceptance_criteria?: string
          approval?: Database["public"]["Enums"]["approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["requirement_priority"]
          project_id?: string
          ref?: number
          source?: string | null
          statement?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_allowlist: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      task_dependencies: {
        Row: {
          created_at: string
          depends_on_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          depends_on_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          depends_on_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          acceptance_criteria: string
          assignee: string | null
          assignee_type: string
          blocked_reason: string | null
          budget_usd: number
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          evidence_links: string[]
          id: string
          milestone_id: string | null
          project_id: string
          ref: number
          requirement_id: string | null
          state: Database["public"]["Enums"]["workflow_state"]
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          acceptance_criteria?: string
          assignee?: string | null
          assignee_type?: string
          blocked_reason?: string | null
          budget_usd?: number
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          evidence_links?: string[]
          id?: string
          milestone_id?: string | null
          project_id: string
          ref?: number
          requirement_id?: string | null
          state?: Database["public"]["Enums"]["workflow_state"]
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          acceptance_criteria?: string
          assignee?: string | null
          assignee_type?: string
          blocked_reason?: string | null
          budget_usd?: number
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          evidence_links?: string[]
          id?: string
          milestone_id?: string | null
          project_id?: string
          ref?: number
          requirement_id?: string | null
          state?: Database["public"]["Enums"]["workflow_state"]
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_sessions: {
        Args: never
        Returns: {
          aal: string
          created_at: string
          id: string
          ip: string
          is_current: boolean
          updated_at: string
          user_agent: string
        }[]
      }
    }
    Enums: {
      approval_state: "draft" | "approved" | "rejected"
      membership_role: "owner" | "client" | "viewer"
      milestone_status: "planned" | "in_progress" | "done"
      project_status: "active" | "on_hold" | "completed"
      requirement_priority: "must" | "should" | "could" | "wont"
      workflow_state:
        | "backlog"
        | "ready"
        | "in_progress"
        | "agent_complete"
        | "automated_checks"
        | "needs_human_review"
        | "approved"
        | "preview_ready"
        | "client_review"
        | "release_approved"
        | "deployed"
        | "verified"
        | "closed"
        | "blocked"
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
    Enums: {
      approval_state: ["draft", "approved", "rejected"],
      membership_role: ["owner", "client", "viewer"],
      milestone_status: ["planned", "in_progress", "done"],
      project_status: ["active", "on_hold", "completed"],
      requirement_priority: ["must", "should", "could", "wont"],
      workflow_state: [
        "backlog",
        "ready",
        "in_progress",
        "agent_complete",
        "automated_checks",
        "needs_human_review",
        "approved",
        "preview_ready",
        "client_review",
        "release_approved",
        "deployed",
        "verified",
        "closed",
        "blocked",
      ],
    },
  },
} as const

