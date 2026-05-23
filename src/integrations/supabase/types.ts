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
      agent_actions: {
        Row: {
          action_type: string | null
          created_at: string
          exception_id: string | null
          id: string
          policy_basis: string | null
          reason: string | null
          result: string | null
          tenant_id: string
          unit_id: string
        }
        Insert: {
          action_type?: string | null
          created_at?: string
          exception_id?: string | null
          id?: string
          policy_basis?: string | null
          reason?: string | null
          result?: string | null
          tenant_id: string
          unit_id: string
        }
        Update: {
          action_type?: string | null
          created_at?: string
          exception_id?: string | null
          id?: string
          policy_basis?: string | null
          reason?: string | null
          result?: string | null
          tenant_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          body: string | null
          channel: string | null
          created_at: string
          exception_id: string | null
          id: string
          message_type: string | null
          sent_at: string | null
          tenant_id: string
        }
        Insert: {
          body?: string | null
          channel?: string | null
          created_at?: string
          exception_id?: string | null
          id?: string
          message_type?: string | null
          sent_at?: string | null
          tenant_id: string
        }
        Update: {
          body?: string | null
          channel?: string | null
          created_at?: string
          exception_id?: string | null
          id?: string
          message_type?: string | null
          sent_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exceptions: {
        Row: {
          created_at: string
          human_needed: boolean | null
          id: string
          recommended_action: string | null
          rent_obligation_id: string
          risk_breakdown: Json | null
          risk_score: number | null
          severity: string | null
          status: string | null
          tenant_id: string
          type: string | null
          unit_id: string
        }
        Insert: {
          created_at?: string
          human_needed?: boolean | null
          id?: string
          recommended_action?: string | null
          rent_obligation_id: string
          risk_breakdown?: Json | null
          risk_score?: number | null
          severity?: string | null
          status?: string | null
          tenant_id: string
          type?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string
          human_needed?: boolean | null
          id?: string
          recommended_action?: string | null
          rent_obligation_id?: string
          risk_breakdown?: Json | null
          risk_score?: number | null
          severity?: string | null
          status?: string | null
          tenant_id?: string
          type?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exceptions_rent_obligation_id_fkey"
            columns: ["rent_obligation_id"]
            isOneToOne: false
            referencedRelation: "rent_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exceptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exceptions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      guardrails: {
        Row: {
          critical_risk_threshold: number | null
          escalation_rules: Json | null
          id: string
          max_auto_plan_amount: number | null
          max_installments: number | null
          max_retry_attempts: number | null
          stripe_test_clock_id: string | null
          updated_at: string
        }
        Insert: {
          critical_risk_threshold?: number | null
          escalation_rules?: Json | null
          id?: string
          max_auto_plan_amount?: number | null
          max_installments?: number | null
          max_retry_attempts?: number | null
          stripe_test_clock_id?: string | null
          updated_at?: string
        }
        Update: {
          critical_risk_threshold?: number | null
          escalation_rules?: Json | null
          id?: string
          max_auto_plan_amount?: number | null
          max_installments?: number | null
          max_retry_attempts?: number | null
          stripe_test_clock_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      owner_payouts: {
        Row: {
          created_at: string
          expected_payout: number | null
          gross_collected: number | null
          id: string
          management_fee: number | null
          month: string
          owner_id: string
          property_id: string
          status: string | null
          withheld_amount: number | null
        }
        Insert: {
          created_at?: string
          expected_payout?: number | null
          gross_collected?: number | null
          id?: string
          management_fee?: number | null
          month: string
          owner_id: string
          property_id: string
          status?: string | null
          withheld_amount?: number | null
        }
        Update: {
          created_at?: string
          expected_payout?: number | null
          gross_collected?: number | null
          id?: string
          management_fee?: number | null
          month?: string
          owner_id?: string
          property_id?: string
          status?: string | null
          withheld_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_payouts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_payouts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          created_at: string
          id: string
          management_fee_rate: number | null
          name: string
          payout_iban: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          management_fee_rate?: number | null
          name: string
          payout_iban?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          management_fee_rate?: number | null
          name?: string
          payout_iban?: string | null
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string
          failure_reason: string | null
          id: string
          occurred_at: string | null
          rent_obligation_id: string
          source: string | null
          stripe_event_id: string | null
          tenant_id: string
          type: string
          unit_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          occurred_at?: string | null
          rent_obligation_id: string
          source?: string | null
          stripe_event_id?: string | null
          tenant_id: string
          type: string
          unit_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          occurred_at?: string | null
          rent_obligation_id?: string
          source?: string | null
          stripe_event_id?: string | null
          tenant_id?: string
          type?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_rent_obligation_id_fkey"
            columns: ["rent_obligation_id"]
            isOneToOne: false
            referencedRelation: "rent_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plan_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          payment_plan_id: string
          sequence: number
          status: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          due_date?: string | null
          id?: string
          payment_plan_id: string
          sequence: number
          status?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          payment_plan_id?: string
          sequence?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_plan_installments_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          created_at: string
          id: string
          installment_count: number | null
          rent_obligation_id: string
          status: string | null
          tenant_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          installment_count?: number | null
          rent_obligation_id: string
          status?: string | null
          tenant_id: string
          total_amount: number
        }
        Update: {
          created_at?: string
          id?: string
          installment_count?: number | null
          rent_obligation_id?: string
          status?: string | null
          tenant_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_rent_obligation_id_fkey"
            columns: ["rent_obligation_id"]
            isOneToOne: false
            referencedRelation: "rent_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          city: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          owner_id: string | null
          postal_code: string | null
          street: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          owner_id?: string | null
          postal_code?: string | null
          street?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          owner_id?: string | null
          postal_code?: string | null
          street?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_obligations: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          month: string
          property_id: string
          status: string
          stripe_invoice_id: string | null
          tenant_id: string
          unit_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          month: string
          property_id: string
          status: string
          stripe_invoice_id?: string | null
          tenant_id: string
          unit_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          month?: string
          property_id?: string
          status?: string
          stripe_invoice_id?: string | null
          tenant_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_obligations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_obligations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_obligations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      sepa_mandates: {
        Row: {
          created_at: string
          iban: string | null
          id: string
          mandate_reference: string | null
          signed_date: string | null
          status: string | null
          stripe_mandate_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          iban?: string | null
          id?: string
          mandate_reference?: string | null
          signed_date?: string | null
          status?: string | null
          stripe_mandate_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          iban?: string | null
          id?: string
          mandate_reference?: string | null
          signed_date?: string | null
          status?: string | null
          stripe_mandate_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sepa_mandates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          behavior_profile: string | null
          created_at: string
          due_day: number | null
          email: string | null
          id: string
          name: string
          phone: string | null
          rent_amount: number
          risk_score: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          unit_id: string
        }
        Insert: {
          behavior_profile?: string | null
          created_at?: string
          due_day?: number | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          rent_amount: number
          risk_score?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          unit_id: string
        }
        Update: {
          behavior_profile?: string | null
          created_at?: string
          due_day?: number | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          rent_amount?: number
          risk_score?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          floor: string | null
          id: string
          label: string
          property_id: string
        }
        Insert: {
          created_at?: string
          floor?: string | null
          id?: string
          label: string
          property_id: string
        }
        Update: {
          created_at?: string
          floor?: string | null
          id?: string
          label?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      portfolio_kpis: {
        Row: {
          auto_cleared_rate: number | null
          auto_recovered_rate: number | null
          collected: number | null
          expected_rent: number | null
          human_review_rate: number | null
          in_payment_plan: number | null
          needs_human_review: number | null
          recovered_by_agent: number | null
          unit_count: number | null
        }
        Relationships: []
      }
      property_kpis: {
        Row: {
          auto_cleared_rate: number | null
          auto_recovered_rate: number | null
          collected: number | null
          expected_rent: number | null
          human_review_rate: number | null
          in_payment_plan: number | null
          needs_human_review: number | null
          property_id: string | null
          recovered_by_agent: number | null
          unit_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rent_obligations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_kpis: {
        Row: {
          expected_rent: number | null
          status: string | null
          unit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rent_obligations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
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
