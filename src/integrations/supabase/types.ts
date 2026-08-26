export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      gatilhos_analise: {
        Row: {
          analise: string;
          created_at: string;
          detalhe: string | null;
          fuso_horario: string;
          gaps: number[];
          id: string;
          minuto: number;
          pedra: number;
          trigger_at: string;
        };
        Insert: {
          analise?: string;
          created_at?: string;
          detalhe?: string | null;
          fuso_horario?: string;
          gaps?: number[];
          id?: string;
          minuto: number;
          pedra: number;
          trigger_at?: string;
        };
        Update: {
          analise?: string;
          created_at?: string;
          detalhe?: string | null;
          fuso_horario?: string;
          gaps?: number[];
          id?: string;
          minuto?: number;
          pedra?: number;
          trigger_at?: string;
        };
        Relationships: [];
      };
      historico_blaze: {
        Row: {
          blaze_id: string;
          cor: string;
          created_at: string;
          data: string;
          hora: string;
          id: number;
          numero: number;
          timestamp: string;
        };
        Insert: {
          blaze_id: string;
          cor: string;
          created_at?: string;
          data: string;
          hora: string;
          id?: number;
          numero: number;
          timestamp: string;
        };
        Update: {
          blaze_id?: string;
          cor?: string;
          created_at?: string;
          data?: string;
          hora?: string;
          id?: number;
          numero?: number;
          timestamp?: string;
        };
        Relationships: [];
      };
      historico_sinais_audit: {
        Row: {
          analise: string;
          created_at: string | null;
          id: string;
          is_verified: boolean | null;
          minuto_alvo: string;
          nivel: string;
          predicao_horario: string;
          status: string;
          tipo_sinal: string;
        };
        Insert: {
          analise: string;
          created_at?: string | null;
          id?: string;
          is_verified?: boolean | null;
          minuto_alvo: string;
          nivel: string;
          predicao_horario: string;
          status?: string;
          tipo_sinal: string;
        };
        Update: {
          analise?: string;
          created_at?: string | null;
          id?: string;
          is_verified?: boolean | null;
          minuto_alvo?: string;
          nivel?: string;
          predicao_horario?: string;
          status?: string;
          tipo_sinal?: string;
        };
        Relationships: [];
      };
      trigger_audits: {
        Row: {
          analysis_count: number | null;
          category: string;
          confluences: string | null;
          created_at: string | null;
          gatilho: string;
          horario_alvo: string;
          horario_base: string;
          id: string;
          win: boolean | null;
        };
        Insert: {
          analysis_count?: number | null;
          category: string;
          confluences?: string | null;
          created_at?: string | null;
          gatilho: string;
          horario_alvo: string;
          horario_base: string;
          id?: string;
          win?: boolean | null;
        };
        Update: {
          analysis_count?: number | null;
          category?: string;
          confluences?: string | null;
          created_at?: string | null;
          gatilho?: string;
          horario_alvo?: string;
          horario_base?: string;
          id?: string;
          win?: boolean | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      vip_tokens: {
        Row: {
          created_at: string | null;
          expires_at: string | null;
          id: string;
          level: Database["public"]["Enums"]["vip_level"];
          member_name: string;
          status: string;
          token: string;
        };
        Insert: {
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          level?: Database["public"]["Enums"]["vip_level"];
          member_name: string;
          status?: string;
          token: string;
        };
        Update: {
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          level?: Database["public"]["Enums"]["vip_level"];
          member_name?: string;
          status?: string;
          token?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cleanup_audit_24h: { Args: never; Returns: undefined };
      cleanup_trigger_audits_24h: { Args: never; Returns: undefined };
      get_strategy_stats: {
        Args: { lookback_hours?: number };
        Returns: {
          analise: string;
          assertividade: number;
          losses: number;
          total: number;
          wins: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "user";
      vip_level: "member" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      vip_level: ["member", "admin"],
    },
  },
} as const;
