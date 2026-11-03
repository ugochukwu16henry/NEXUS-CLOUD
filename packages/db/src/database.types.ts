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
      agent_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          project_id: string
          run_id: string
          summary: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          project_id: string
          run_id: string
          summary: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          project_id?: string
          run_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          budget_usd_micros: number
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          iteration: number
          kind: Database["public"]["Enums"]["agent_kind"]
          max_iterations: number
          project_id: string
          purpose: string
          spent_usd_micros: number
          started_at: string | null
          state: Json | null
          status: Database["public"]["Enums"]["agent_run_status"]
          stop_condition: string
          task_id: string
        }
        Insert: {
          budget_usd_micros: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          iteration?: number
          kind: Database["public"]["Enums"]["agent_kind"]
          max_iterations: number
          project_id: string
          purpose: string
          spent_usd_micros?: number
          started_at?: string | null
          state?: Json | null
          status?: Database["public"]["Enums"]["agent_run_status"]
          stop_condition: string
          task_id: string
        }
        Update: {
          budget_usd_micros?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          iteration?: number
          kind?: Database["public"]["Enums"]["agent_kind"]
          max_iterations?: number
          project_id?: string
          purpose?: string
          spent_usd_micros?: number
          started_at?: string | null
          state?: Json | null
          status?: Database["public"]["Enums"]["agent_run_status"]
          stop_condition?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      artifacts: {
        Row: {
          agent_run_id: string | null
          approval: Database["public"]["Enums"]["artifact_approval"]
          content_type: string
          created_at: string
          filename: string
          id: string
          kind: Database["public"]["Enums"]["artifact_kind"]
          project_id: string
          retain_until: string | null
          sha256: string
          size_bytes: number
          storage_key: string
          task_id: string | null
          uploaded_by: string | null
          visibility: Database["public"]["Enums"]["artifact_visibility"]
        }
        Insert: {
          agent_run_id?: string | null
          approval?: Database["public"]["Enums"]["artifact_approval"]
          content_type: string
          created_at?: string
          filename: string
          id?: string
          kind: Database["public"]["Enums"]["artifact_kind"]
          project_id: string
          retain_until?: string | null
          sha256: string
          size_bytes: number
          storage_key: string
          task_id?: string | null
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["artifact_visibility"]
        }
        Update: {
          agent_run_id?: string | null
          approval?: Database["public"]["Enums"]["artifact_approval"]
          content_type?: string
          created_at?: string
          filename?: string
          id?: string
          kind?: Database["public"]["Enums"]["artifact_kind"]
          project_id?: string
          retain_until?: string | null
          sha256?: string
          size_bytes?: number
          storage_key?: string
          task_id?: string | null
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["artifact_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
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
      changeset_files: {
        Row: {
          change: Database["public"]["Enums"]["file_change"]
          changeset_id: string
          held_reason: string | null
          is_binary: boolean
          path: string
          sha256: string | null
          size_bytes: number
          storage_key: string | null
          updated_at: string
        }
        Insert: {
          change: Database["public"]["Enums"]["file_change"]
          changeset_id: string
          held_reason?: string | null
          is_binary?: boolean
          path: string
          sha256?: string | null
          size_bytes?: number
          storage_key?: string | null
          updated_at?: string
        }
        Update: {
          change?: Database["public"]["Enums"]["file_change"]
          changeset_id?: string
          held_reason?: string | null
          is_binary?: boolean
          path?: string
          sha256?: string | null
          size_bytes?: number
          storage_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "changeset_files_changeset_id_fkey"
            columns: ["changeset_id"]
            isOneToOne: false
            referencedRelation: "changesets"
            referencedColumns: ["id"]
          },
        ]
      }
      changesets: {
        Row: {
          base_sha: string
          branch: string
          committed_sha: string | null
          created_at: string
          id: string
          locked_by: string | null
          locked_until: string | null
          project_id: string
          repository_id: string
          status: Database["public"]["Enums"]["changeset_status"]
          task_id: string
          updated_at: string
          version: number
        }
        Insert: {
          base_sha: string
          branch: string
          committed_sha?: string | null
          created_at?: string
          id?: string
          locked_by?: string | null
          locked_until?: string | null
          project_id: string
          repository_id: string
          status?: Database["public"]["Enums"]["changeset_status"]
          task_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          base_sha?: string
          branch?: string
          committed_sha?: string | null
          created_at?: string
          id?: string
          locked_by?: string | null
          locked_until?: string | null
          project_id?: string
          repository_id?: string
          status?: Database["public"]["Enums"]["changeset_status"]
          task_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "changesets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changesets_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changesets_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      command_approvals: {
        Row: {
          command: string
          created_at: string
          decided_at: string | null
          decision: Database["public"]["Enums"]["command_decision"]
          id: string
          project_id: string
          reason: string | null
          run_id: string
        }
        Insert: {
          command: string
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["command_decision"]
          id?: string
          project_id: string
          reason?: string | null
          run_id: string
        }
        Update: {
          command?: string
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["command_decision"]
          id?: string
          project_id?: string
          reason?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          account_login: string
          account_type: string
          created_at: string
          id: string
          installation_id: number
          installed_by: string | null
          last_error: string | null
          last_error_at: string | null
          last_ok_at: string | null
          permissions: Json
          provider: string
          repository_selection: string
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_login: string
          account_type: string
          created_at?: string
          id?: string
          installation_id: number
          installed_by?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_ok_at?: string | null
          permissions?: Json
          provider?: string
          repository_selection: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_login?: string
          account_type?: string
          created_at?: string
          id?: string
          installation_id?: number
          installed_by?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_ok_at?: string | null
          permissions?: Json
          provider?: string
          repository_selection?: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_workspace_id_fkey"
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
      model_routes: {
        Row: {
          model: string
          provider: Database["public"]["Enums"]["model_provider"]
          task_kind: Database["public"]["Enums"]["model_task_kind"]
          updated_at: string
        }
        Insert: {
          model: string
          provider: Database["public"]["Enums"]["model_provider"]
          task_kind: Database["public"]["Enums"]["model_task_kind"]
          updated_at?: string
        }
        Update: {
          model?: string
          provider?: Database["public"]["Enums"]["model_provider"]
          task_kind?: Database["public"]["Enums"]["model_task_kind"]
          updated_at?: string
        }
        Relationships: []
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
      project_model_settings: {
        Row: {
          allow_fallback: boolean
          allowed_providers: Database["public"]["Enums"]["model_provider"][]
          extended_until: string | null
          monthly_budget_usd: number
          project_id: string
          run_budget_usd: number
          updated_at: string
          version: number
        }
        Insert: {
          allow_fallback?: boolean
          allowed_providers?: Database["public"]["Enums"]["model_provider"][]
          extended_until?: string | null
          monthly_budget_usd?: number
          project_id: string
          run_budget_usd?: number
          updated_at?: string
          version?: number
        }
        Update: {
          allow_fallback?: boolean
          allowed_providers?: Database["public"]["Enums"]["model_provider"][]
          extended_until?: string | null
          monthly_budget_usd?: number
          project_id?: string
          run_budget_usd?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_model_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      repo_branches: {
        Row: {
          head_sha: string
          name: string
          protected: boolean
          repository_id: string
          updated_at: string
        }
        Insert: {
          head_sha: string
          name: string
          protected?: boolean
          repository_id: string
          updated_at?: string
        }
        Update: {
          head_sha?: string
          name?: string
          protected?: boolean
          repository_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_branches_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_commits: {
        Row: {
          author_name: string | null
          authored_at: string | null
          branch: string | null
          html_url: string | null
          message: string
          repository_id: string
          sha: string
        }
        Insert: {
          author_name?: string | null
          authored_at?: string | null
          branch?: string | null
          html_url?: string | null
          message: string
          repository_id: string
          sha: string
        }
        Update: {
          author_name?: string | null
          authored_at?: string | null
          branch?: string | null
          html_url?: string | null
          message?: string
          repository_id?: string
          sha?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_commits_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_pull_requests: {
        Row: {
          base_ref: string
          checks: string
          head_ref: string
          head_sha: string
          html_url: string
          number: number
          repository_id: string
          state: string
          title: string
          updated_at: string
        }
        Insert: {
          base_ref: string
          checks?: string
          head_ref: string
          head_sha: string
          html_url: string
          number: number
          repository_id: string
          state: string
          title: string
          updated_at?: string
        }
        Update: {
          base_ref?: string
          checks?: string
          head_ref?: string
          head_sha?: string
          html_url?: string
          number?: number
          repository_id?: string
          state?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_pull_requests_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      repositories: {
        Row: {
          default_branch: string
          full_name: string
          github_repo_id: number
          html_url: string
          id: string
          imported_at: string
          imported_by: string | null
          integration_id: string
          last_synced_at: string | null
          private: boolean
          project_id: string
        }
        Insert: {
          default_branch: string
          full_name: string
          github_repo_id: number
          html_url: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          integration_id: string
          last_synced_at?: string | null
          private: boolean
          project_id: string
        }
        Update: {
          default_branch?: string
          full_name?: string
          github_repo_id?: number
          html_url?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          integration_id?: string
          last_synced_at?: string | null
          private?: boolean
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repositories_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repositories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
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
      sandbox_sessions: {
        Row: {
          closed_at: string | null
          connected_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          idle_seconds: number
          kind: Database["public"]["Enums"]["sandbox_session_kind"]
          project_id: string
          task_id: string | null
          ticket_hash: string
        }
        Insert: {
          closed_at?: string | null
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          idle_seconds: number
          kind: Database["public"]["Enums"]["sandbox_session_kind"]
          project_id: string
          task_id?: string | null
          ticket_hash: string
        }
        Update: {
          closed_at?: string | null
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          idle_seconds?: number
          kind?: Database["public"]["Enums"]["sandbox_session_kind"]
          project_id?: string
          task_id?: string | null
          ticket_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
      spend_caps: {
        Row: {
          extended_until: string | null
          monthly_usd: number
          scope: string
          updated_at: string
          version: number
        }
        Insert: {
          extended_until?: string | null
          monthly_usd?: number
          scope?: string
          updated_at?: string
          version?: number
        }
        Update: {
          extended_until?: string | null
          monthly_usd?: number
          scope?: string
          updated_at?: string
          version?: number
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
      task_links: {
        Row: {
          created_at: string
          kind: Database["public"]["Enums"]["task_link_kind"]
          ref: string
          repository_id: string
          task_id: string
          title: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          kind: Database["public"]["Enums"]["task_link_kind"]
          ref: string
          repository_id: string
          task_id: string
          title?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          kind?: Database["public"]["Enums"]["task_link_kind"]
          ref?: string
          repository_id?: string
          task_id?: string
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_links_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_links_task_id_fkey"
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
      upload_batches: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          files: Json
          finished_at: string | null
          id: string
          project_id: string
          target: Database["public"]["Enums"]["upload_target"]
          task_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          files: Json
          finished_at?: string | null
          id?: string
          project_id: string
          target: Database["public"]["Enums"]["upload_target"]
          task_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          files?: Json
          finished_at?: string | null
          id?: string
          project_id?: string
          target?: Database["public"]["Enums"]["upload_target"]
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_batches_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          cached_tokens: number
          cost_usd_micros: number
          created_at: string
          currency: string
          error: string | null
          fallback_from_model: string | null
          fallback_from_provider:
            | Database["public"]["Enums"]["model_provider"]
            | null
          fx_rate: number
          id: string
          image_count: number
          input_tokens: number
          latency_ms: number
          model: string
          ok: boolean
          output_tokens: number
          project_id: string
          provider: Database["public"]["Enums"]["model_provider"]
          run_id: string | null
          task_id: string | null
        }
        Insert: {
          cached_tokens?: number
          cost_usd_micros: number
          created_at?: string
          currency?: string
          error?: string | null
          fallback_from_model?: string | null
          fallback_from_provider?:
            | Database["public"]["Enums"]["model_provider"]
            | null
          fx_rate?: number
          id?: string
          image_count?: number
          input_tokens?: number
          latency_ms?: number
          model: string
          ok: boolean
          output_tokens?: number
          project_id: string
          provider: Database["public"]["Enums"]["model_provider"]
          run_id?: string | null
          task_id?: string | null
        }
        Update: {
          cached_tokens?: number
          cost_usd_micros?: number
          created_at?: string
          currency?: string
          error?: string | null
          fallback_from_model?: string | null
          fallback_from_provider?:
            | Database["public"]["Enums"]["model_provider"]
            | null
          fx_rate?: number
          id?: string
          image_count?: number
          input_tokens?: number
          latency_ms?: number
          model?: string
          ok?: boolean
          output_tokens?: number
          project_id?: string
          provider?: Database["public"]["Enums"]["model_provider"]
          run_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          action: string | null
          attempts: number
          delivery_id: string
          event: string
          id: number
          installation_id: number | null
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          status: Database["public"]["Enums"]["webhook_status"]
        }
        Insert: {
          action?: string | null
          attempts?: number
          delivery_id: string
          event: string
          id?: never
          installation_id?: number | null
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: Database["public"]["Enums"]["webhook_status"]
        }
        Update: {
          action?: string | null
          attempts?: number
          delivery_id?: string
          event?: string
          id?: never
          installation_id?: number | null
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: Database["public"]["Enums"]["webhook_status"]
        }
        Relationships: []
      }
      workspace_settings: {
        Row: {
          agent_max_iterations: number
          approval_mode: Database["public"]["Enums"]["approval_mode"]
          attachment_kinds: Database["public"]["Enums"]["artifact_kind"][]
          attachment_max_mb: number
          build_command: string
          custom_commands: string[]
          install_command: string
          max_file_mb: number
          max_files: number
          max_upload_mb: number
          node_major: number
          plain_env: Json
          project_id: string
          skip_folders: string[]
          start_command: string
          terminal_idle_seconds: number
          terminal_max_sessions: number
          test_command: string
          updated_at: string
          version: number
        }
        Insert: {
          agent_max_iterations?: number
          approval_mode?: Database["public"]["Enums"]["approval_mode"]
          attachment_kinds?: Database["public"]["Enums"]["artifact_kind"][]
          attachment_max_mb?: number
          build_command?: string
          custom_commands?: string[]
          install_command?: string
          max_file_mb?: number
          max_files?: number
          max_upload_mb?: number
          node_major?: number
          plain_env?: Json
          project_id: string
          skip_folders?: string[]
          start_command?: string
          terminal_idle_seconds?: number
          terminal_max_sessions?: number
          test_command?: string
          updated_at?: string
          version?: number
        }
        Update: {
          agent_max_iterations?: number
          approval_mode?: Database["public"]["Enums"]["approval_mode"]
          attachment_kinds?: Database["public"]["Enums"]["artifact_kind"][]
          attachment_max_mb?: number
          build_command?: string
          custom_commands?: string[]
          install_command?: string
          max_file_mb?: number
          max_files?: number
          max_upload_mb?: number
          node_major?: number
          plain_env?: Json
          project_id?: string
          skip_folders?: string[]
          start_command?: string
          terminal_idle_seconds?: number
          terminal_max_sessions?: number
          test_command?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
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
      claim_webhook_events: {
        Args: { batch_size: number; only_delivery?: string }
        Returns: {
          action: string | null
          attempts: number
          delivery_id: string
          event: string
          id: number
          installation_id: number | null
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          status: Database["public"]["Enums"]["webhook_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "webhook_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
      agent_kind: "planner" | "coder"
      agent_run_status:
        | "queued"
        | "running"
        | "waiting_approval"
        | "succeeded"
        | "failed"
        | "cancelled"
      approval_mode: "ask" | "safe_list" | "custom"
      approval_state: "draft" | "approved" | "rejected"
      artifact_approval: "pending" | "approved" | "rejected"
      artifact_kind: "image" | "pdf" | "text" | "other"
      artifact_visibility: "internal" | "client"
      changeset_status: "open" | "committed" | "discarded"
      command_decision: "pending" | "approved" | "denied"
      file_change: "add" | "modify" | "delete"
      integration_status: "active" | "suspended" | "removed"
      membership_role: "owner" | "client" | "viewer"
      milestone_status: "planned" | "in_progress" | "done"
      model_provider:
        | "anthropic"
        | "openai"
        | "gemini"
        | "xai"
        | "deepseek"
        | "groq"
        | "openrouter"
        | "cerebras"
      model_task_kind:
        | "planning"
        | "routine"
        | "complex_code"
        | "review"
        | "research"
      project_status: "active" | "on_hold" | "completed"
      requirement_priority: "must" | "should" | "could" | "wont"
      sandbox_session_kind: "terminal" | "agent"
      task_link_kind: "branch" | "commit" | "pull_request"
      upload_target: "worktree" | "attachment"
      webhook_status: "pending" | "processing" | "processed" | "failed" | "dead"
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
      agent_kind: ["planner", "coder"],
      agent_run_status: [
        "queued",
        "running",
        "waiting_approval",
        "succeeded",
        "failed",
        "cancelled",
      ],
      approval_mode: ["ask", "safe_list", "custom"],
      approval_state: ["draft", "approved", "rejected"],
      artifact_approval: ["pending", "approved", "rejected"],
      artifact_kind: ["image", "pdf", "text", "other"],
      artifact_visibility: ["internal", "client"],
      changeset_status: ["open", "committed", "discarded"],
      command_decision: ["pending", "approved", "denied"],
      file_change: ["add", "modify", "delete"],
      integration_status: ["active", "suspended", "removed"],
      membership_role: ["owner", "client", "viewer"],
      milestone_status: ["planned", "in_progress", "done"],
      model_provider: [
        "anthropic",
        "openai",
        "gemini",
        "xai",
        "deepseek",
        "groq",
        "openrouter",
        "cerebras",
      ],
      model_task_kind: [
        "planning",
        "routine",
        "complex_code",
        "review",
        "research",
      ],
      project_status: ["active", "on_hold", "completed"],
      requirement_priority: ["must", "should", "could", "wont"],
      sandbox_session_kind: ["terminal", "agent"],
      task_link_kind: ["branch", "commit", "pull_request"],
      upload_target: ["worktree", "attachment"],
      webhook_status: ["pending", "processing", "processed", "failed", "dead"],
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

