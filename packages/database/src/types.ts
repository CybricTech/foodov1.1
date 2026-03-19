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
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          first_order_at: string | null
          full_name: string | null
          id: string
          last_order_at: string | null
          notes: string | null
          phone: string
          restaurant_id: string
          total_orders: number
          total_spent: number
          total_spent_kobo: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_order_at?: string | null
          full_name?: string | null
          id?: string
          last_order_at?: string | null
          notes?: string | null
          phone: string
          restaurant_id: string
          total_orders?: number
          total_spent?: number
          total_spent_kobo?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          first_order_at?: string | null
          full_name?: string | null
          id?: string
          last_order_at?: string | null
          notes?: string | null
          phone?: string
          restaurant_id?: string
          total_orders?: number
          total_spent?: number
          total_spent_kobo?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_assignments: {
        Row: {
          assigned_at: string
          delivered_at: string | null
          dispatch_type: string
          id: string
          order_id: string
          picked_up_at: string | null
          restaurant_id: string
          rider_id: string | null
          rider_lat: number | null
          rider_lng: number | null
          share_link_token: string | null
          status: string
          third_party_provider: string | null
          third_party_ref: string | null
        }
        Insert: {
          assigned_at?: string
          delivered_at?: string | null
          dispatch_type: string
          id?: string
          order_id: string
          picked_up_at?: string | null
          restaurant_id: string
          rider_id?: string | null
          rider_lat?: number | null
          rider_lng?: number | null
          share_link_token?: string | null
          status?: string
          third_party_provider?: string | null
          third_party_ref?: string | null
        }
        Update: {
          assigned_at?: string
          delivered_at?: string | null
          dispatch_type?: string
          id?: string
          order_id?: string
          picked_up_at?: string | null
          restaurant_id?: string
          rider_id?: string | null
          rider_lat?: number | null
          rider_lng?: number | null
          share_link_token?: string | null
          status?: string
          third_party_provider?: string | null
          third_party_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_option_choices: {
        Row: {
          id: string
          is_available: boolean
          name: string
          option_id: string
          price_modifier: number
          price_modifier_kobo: number
          restaurant_id: string
        }
        Insert: {
          id?: string
          is_available?: boolean
          name: string
          option_id: string
          price_modifier?: number
          price_modifier_kobo?: number
          restaurant_id: string
        }
        Update: {
          id?: string
          is_available?: boolean
          name?: string
          option_id?: string
          price_modifier?: number
          price_modifier_kobo?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_option_choices_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "menu_item_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_option_choices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_options: {
        Row: {
          id: string
          is_required: boolean
          max_selections: number
          menu_item_id: string
          min_selections: number
          name: string
          restaurant_id: string
        }
        Insert: {
          id?: string
          is_required?: boolean
          max_selections?: number
          menu_item_id: string
          min_selections?: number
          name: string
          restaurant_id: string
        }
        Update: {
          id?: string
          is_required?: boolean
          max_selections?: number
          menu_item_id?: string
          min_selections?: number
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_options_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_options_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_available: boolean
          is_featured: boolean
          name: string
          prep_time_minutes: number | null
          price: number
          price_kobo: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          name: string
          prep_time_minutes?: number | null
          price: number
          price_kobo?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          name?: string
          prep_time_minutes?: number | null
          price?: number
          price_kobo?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          item_name: string
          item_price: number
          item_price_kobo: number
          line_total: number
          line_total_kobo: number
          menu_item_id: string
          order_id: string
          quantity: number
          restaurant_id: string
          selected_options: Json | null
        }
        Insert: {
          id?: string
          item_name: string
          item_price: number
          item_price_kobo?: number
          line_total: number
          line_total_kobo?: number
          menu_item_id: string
          order_id: string
          quantity?: number
          restaurant_id: string
          selected_options?: Json | null
        }
        Update: {
          id?: string
          item_name?: string
          item_price?: number
          item_price_kobo?: number
          line_total?: number
          line_total_kobo?: number
          menu_item_id?: string
          order_id?: string
          quantity?: number
          restaurant_id?: string
          selected_options?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_reason: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee: number
          delivery_fee_kobo: number
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_status: string | null
          discount_amount: number
          estimated_delivery_at: string | null
          fulfillment_type: string
          id: string
          order_number: string
          payment_id: string | null
          payment_ref: string | null
          payment_status: string
          restaurant_id: string
          rider_id: string | null
          special_instructions: string | null
          status: string
          subtotal: number
          subtotal_kobo: number
          total_amount: number
          total_kobo: number
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_reason?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_fee_kobo?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_status?: string | null
          discount_amount?: number
          estimated_delivery_at?: string | null
          fulfillment_type: string
          id?: string
          order_number: string
          payment_id?: string | null
          payment_ref?: string | null
          payment_status?: string
          restaurant_id: string
          rider_id?: string | null
          special_instructions?: string | null
          status?: string
          subtotal: number
          subtotal_kobo?: number
          total_amount: number
          total_kobo?: number
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_reason?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_fee_kobo?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_status?: string | null
          discount_amount?: number
          estimated_delivery_at?: string | null
          fulfillment_type?: string
          id?: string
          order_number?: string
          payment_id?: string | null
          payment_ref?: string | null
          payment_status?: string
          restaurant_id?: string
          rider_id?: string | null
          special_instructions?: string | null
          status?: string
          subtotal?: number
          subtotal_kobo?: number
          total_amount?: number
          total_kobo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_kobo: number
          channel: string | null
          created_at: string
          currency: string
          id: string
          metadata: Json | null
          order_id: string
          paid_at: string | null
          paystack_ref: string
          paystack_status: string
          restaurant_id: string
        }
        Insert: {
          amount_kobo: number
          channel?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          order_id: string
          paid_at?: string | null
          paystack_ref: string
          paystack_status: string
          restaurant_id: string
        }
        Update: {
          amount_kobo?: number
          channel?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          order_id?: string
          paid_at?: string | null
          paystack_ref?: string
          paystack_status?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_riders: {
        Row: {
          active_deliveries: number
          created_at: string
          current_lat: number | null
          current_lng: number | null
          expo_push_token: string | null
          id: string
          is_active: boolean
          is_online: boolean
          last_seen_at: string | null
          total_deliveries: number
          total_earnings_kobo: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_deliveries?: number
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          expo_push_token?: string | null
          id?: string
          is_active?: boolean
          is_online?: boolean
          last_seen_at?: string | null
          total_deliveries?: number
          total_earnings_kobo?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_deliveries?: number
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          expo_push_token?: string | null
          id?: string
          is_active?: boolean
          is_online?: boolean
          last_seen_at?: string | null
          total_deliveries?: number
          total_earnings_kobo?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_riders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          accepts_orders: boolean
          address: string | null
          banner_url: string | null
          city: string | null
          created_at: string
          delivery_fee: number
          delivery_radius_km: number | null
          description: string | null
          estimated_delivery_minutes: number | null
          id: string
          is_active: boolean
          logistics_default: string
          logo_url: string | null
          min_order_amount: number | null
          name: string
          phone: string | null
          primary_color: string | null
          slug: string
          state: string | null
          updated_at: string
        }
        Insert: {
          accepts_orders?: boolean
          address?: string | null
          banner_url?: string | null
          city?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_radius_km?: number | null
          description?: string | null
          estimated_delivery_minutes?: number | null
          id?: string
          is_active?: boolean
          logistics_default?: string
          logo_url?: string | null
          min_order_amount?: number | null
          name: string
          phone?: string | null
          primary_color?: string | null
          slug: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          accepts_orders?: boolean
          address?: string | null
          banner_url?: string | null
          city?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_radius_km?: number | null
          description?: string | null
          estimated_delivery_minutes?: number | null
          id?: string
          is_active?: boolean
          logistics_default?: string
          logo_url?: string | null
          min_order_amount?: number | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          slug?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string | null
          id: string
          is_approved: boolean
          order_id: string | null
          rating: number
          restaurant_id: string
          reviewer_name: string
          reviewer_phone: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_approved?: boolean
          order_id?: string | null
          rating: number
          restaurant_id: string
          reviewer_name: string
          reviewer_phone?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_approved?: boolean
          order_id?: string | null
          rating?: number
          restaurant_id?: string
          reviewer_name?: string
          reviewer_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          message: string | null
          message_body: string
          order_id: string | null
          phone: string | null
          provider: string
          provider_ref: string | null
          recipient_phone: string
          restaurant_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          message_body: string
          order_id?: string | null
          phone?: string | null
          provider: string
          provider_ref?: string | null
          recipient_phone: string
          restaurant_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          message_body?: string
          order_id?: string | null
          phone?: string | null
          provider?: string
          provider_ref?: string | null
          recipient_phone?: string
          restaurant_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          restaurant_id: string | null
          role: string
          updated_at: string
          vehicle_type: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          restaurant_id?: string | null
          role: string
          updated_at?: string
          vehicle_type?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          restaurant_id?: string | null
          role?: string
          updated_at?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_restaurant_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      upsert_customer: {
        Args: {
          p_email?: string
          p_full_name: string
          p_order_total_kobo?: number
          p_phone: string
          p_restaurant_id: string
        }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// ── Convenience type aliases ──────────────────────────────────
type PublicTables = Database["public"]["Tables"];

export type Restaurant = PublicTables["restaurants"]["Row"];
export type Customer = PublicTables["customers"]["Row"];
export type Order = PublicTables["orders"]["Row"];
export type OrderItem = PublicTables["order_items"]["Row"];
export type MenuCategory = PublicTables["menu_categories"]["Row"];
export type MenuItem = PublicTables["menu_items"]["Row"];
export type MenuItemOption = PublicTables["menu_item_options"]["Row"];
export type MenuItemOptionChoice = PublicTables["menu_item_option_choices"]["Row"];
export type DeliveryAssignment = PublicTables["delivery_assignments"]["Row"];
export type Payment = PublicTables["payments"]["Row"];
export type SmsLog = PublicTables["sms_logs"]["Row"];
export type UserProfile = PublicTables["user_profiles"]["Row"];
export type PlatformRider = PublicTables["platform_riders"]["Row"];
export type Review = PublicTables["reviews"]["Row"];
export type ReviewInsert = PublicTables["reviews"]["Insert"];

export type MenuItemWithOptions = MenuItem & {
  options: (MenuItemOption & { choices: MenuItemOptionChoice[] })[];
};
export type OrderWithItems = Order & {
  items: OrderItem[];
  delivery_assignment: DeliveryAssignment | null;
};
export type CustomerWithOrders = Customer & {
  orders: Pick<Order, "id" | "order_number" | "total_amount" | "status" | "created_at">[];
};
export interface SelectedOptionSnapshot {
  optionId: string;
  optionName: string;
  choices: { choiceId: string; choiceName: string; priceModifierKobo: number }[];
}
