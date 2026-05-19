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
      blog_posts: {
        Row: {
          id: string
          slug: string
          title: string
          excerpt: string | null
          content: string
          cover_image_url: string | null
          author_name: string
          read_minutes: number | null
          is_published: boolean
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          title: string
          excerpt?: string | null
          content: string
          cover_image_url?: string | null
          author_name?: string
          read_minutes?: number | null
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          title?: string
          excerpt?: string | null
          content?: string
          cover_image_url?: string | null
          author_name?: string
          read_minutes?: number | null
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
      customer_addresses: {
        Row: {
          address: string
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          id: string
          name: string
          restaurant_name: string
          email: string
          phone: string
          message: string | null
          status: string
          source: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          restaurant_name: string
          email: string
          phone: string
          message?: string | null
          status?: string
          source?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          restaurant_name?: string
          email?: string
          phone?: string
          message?: string | null
          status?: string
          source?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
          max_selections: number | null
          menu_item_id: string
          min_selections: number
          name: string
          restaurant_id: string
        }
        Insert: {
          id?: string
          is_required?: boolean
          max_selections?: number | null
          menu_item_id: string
          min_selections?: number
          name: string
          restaurant_id: string
        }
        Update: {
          id?: string
          is_required?: boolean
          max_selections?: number | null
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
          delivery_cost_kobo: number | null
          delivery_distance_km: number | null
          delivery_fee: number
          delivery_fee_kobo: number
          delivery_fee_kobo_calculated: number | null
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_status: string | null
          discount_amount: number
          dispatch_type: string | null
          estimated_delivery_at: string | null
          fulfillment_type: string
          id: string
          late_at: string | null
          order_number: string
          payment_id: string | null
          payment_ref: string | null
          payment_status: string
          restaurant_id: string
          rider_id: string | null
          service_fee_kobo: number
          settlement_id: string | null
          special_instructions: string | null
          status: string
          subtotal: number
          subtotal_kobo: number
          total_amount: number
          total_kobo: number
          updated_at: string
          vat_kobo: number
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
          delivery_cost_kobo?: number | null
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_fee_kobo?: number
          delivery_fee_kobo_calculated?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_status?: string | null
          discount_amount?: number
          dispatch_type?: string | null
          estimated_delivery_at?: string | null
          fulfillment_type: string
          id?: string
          late_at?: string | null
          order_number: string
          payment_id?: string | null
          payment_ref?: string | null
          payment_status?: string
          restaurant_id: string
          rider_id?: string | null
          service_fee_kobo?: number
          settlement_id?: string | null
          special_instructions?: string | null
          status?: string
          subtotal: number
          subtotal_kobo?: number
          total_amount: number
          total_kobo?: number
          updated_at?: string
          vat_kobo?: number
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
          delivery_cost_kobo?: number | null
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_fee_kobo?: number
          delivery_fee_kobo_calculated?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_status?: string | null
          discount_amount?: number
          dispatch_type?: string | null
          estimated_delivery_at?: string | null
          fulfillment_type?: string
          id?: string
          late_at?: string | null
          order_number?: string
          payment_id?: string | null
          payment_ref?: string | null
          payment_status?: string
          restaurant_id?: string
          rider_id?: string | null
          service_fee_kobo?: number
          settlement_id?: string | null
          special_instructions?: string | null
          status?: string
          subtotal?: number
          subtotal_kobo?: number
          total_amount?: number
          total_kobo?: number
          updated_at?: string
          vat_kobo?: number
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
          {
            foreignKeyName: "orders_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
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
          order_id: string | null
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
          order_id?: string | null
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
          order_id?: string | null
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
          admin_alert_email: string | null
          admin_whatsapp_number: string | null
          delivery_base_fee_kobo: number
          delivery_commission_pct: number
          delivery_max_fee_kobo: number
          delivery_max_radius_km: number
          delivery_per_km_rate_kobo: number
          id: string
          merchant_charge_pct: number
          service_charge_fixed_kobo: number
          service_charge_pct: number
          settlement_hold_hours: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_alert_email?: string | null
          admin_whatsapp_number?: string | null
          delivery_base_fee_kobo?: number
          delivery_commission_pct?: number
          delivery_max_fee_kobo?: number
          delivery_max_radius_km?: number
          delivery_per_km_rate_kobo?: number
          id?: string
          merchant_charge_pct?: number
          service_charge_fixed_kobo?: number
          service_charge_pct?: number
          settlement_hold_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_alert_email?: string | null
          admin_whatsapp_number?: string | null
          delivery_base_fee_kobo?: number
          delivery_commission_pct?: number
          delivery_max_fee_kobo?: number
          delivery_max_radius_km?: number
          delivery_per_km_rate_kobo?: number
          id?: string
          merchant_charge_pct?: number
          service_charge_fixed_kobo?: number
          service_charge_pct?: number
          settlement_hold_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      restaurant_wallets: {
        Row: {
          available_balance_kobo: number
          created_at: string
          id: string
          pending_balance_kobo: number
          restaurant_id: string
          total_earned_kobo: number
          total_withdrawn_kobo: number
          updated_at: string
        }
        Insert: {
          available_balance_kobo?: number
          created_at?: string
          id?: string
          pending_balance_kobo?: number
          restaurant_id: string
          total_earned_kobo?: number
          total_withdrawn_kobo?: number
          updated_at?: string
        }
        Update: {
          available_balance_kobo?: number
          created_at?: string
          id?: string
          pending_balance_kobo?: number
          restaurant_id?: string
          total_earned_kobo?: number
          total_withdrawn_kobo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_wallets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          accepts_orders: boolean
          address: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_code: string | null
          banner_url: string | null
          city: string | null
          created_at: string
          delivery_fee: number
          delivery_radius_km: number | null
          description: string | null
          estimated_delivery_minutes: number | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          latitude: number | null
          logistics_default: string
          logo_url: string | null
          longitude: number | null
          max_delivery_radius_km: number | null
          min_order_amount: number | null
          name: string
          notification_email: string | null
          opening_hours: Json | null
          paystack_recipient_code: string | null
          phone: string | null
          primary_color: string | null
          slug: string
          state: string | null
          twitter_url: string | null
          updated_at: string
          vat_percentage: number | null
          whatsapp_number: string | null
          youtube_url: string | null
          closure_message: string | null
        }
        Insert: {
          accepts_orders?: boolean
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          banner_url?: string | null
          city?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_radius_km?: number | null
          description?: string | null
          estimated_delivery_minutes?: number | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          latitude?: number | null
          logistics_default?: string
          logo_url?: string | null
          longitude?: number | null
          max_delivery_radius_km?: number | null
          min_order_amount?: number | null
          name: string
          notification_email?: string | null
          opening_hours?: Json | null
          paystack_recipient_code?: string | null
          phone?: string | null
          primary_color?: string | null
          slug: string
          state?: string | null
          twitter_url?: string | null
          updated_at?: string
          vat_percentage?: number | null
          whatsapp_number?: string | null
          youtube_url?: string | null
          closure_message?: string | null
        }
        Update: {
          accepts_orders?: boolean
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          banner_url?: string | null
          city?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_radius_km?: number | null
          description?: string | null
          estimated_delivery_minutes?: number | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          latitude?: number | null
          logistics_default?: string
          logo_url?: string | null
          longitude?: number | null
          max_delivery_radius_km?: number | null
          min_order_amount?: number | null
          name?: string
          notification_email?: string | null
          opening_hours?: Json | null
          paystack_recipient_code?: string | null
          phone?: string | null
          primary_color?: string | null
          slug?: string
          state?: string | null
          twitter_url?: string | null
          updated_at?: string
          vat_percentage?: number | null
          whatsapp_number?: string | null
          youtube_url?: string | null
          closure_message?: string | null
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
      settlements: {
        Row: {
          amount_kobo: number
          bank_reference: string | null
          created_at: string
          delivery_commission_kobo: number
          failure_reason: string | null
          gross_total_kobo: number
          id: string
          initiated_at: string
          merchant_charge_total_kobo: number
          order_count: number
          paid_at: string | null
          paystack_transfer_code: string | null
          paystack_transfer_ref: string | null
          period_date: string | null
          receipt_url: string | null
          recorded_by: string | null
          restaurant_id: string
          service_fee_total_kobo: number
          settlement_type: string
          status: string
        }
        Insert: {
          amount_kobo: number
          bank_reference?: string | null
          created_at?: string
          delivery_commission_kobo?: number
          failure_reason?: string | null
          gross_total_kobo?: number
          id?: string
          initiated_at?: string
          merchant_charge_total_kobo?: number
          order_count?: number
          paid_at?: string | null
          paystack_transfer_code?: string | null
          paystack_transfer_ref?: string | null
          period_date?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          restaurant_id: string
          service_fee_total_kobo?: number
          settlement_type?: string
          status?: string
        }
        Update: {
          amount_kobo?: number
          bank_reference?: string | null
          created_at?: string
          delivery_commission_kobo?: number
          failure_reason?: string | null
          gross_total_kobo?: number
          id?: string
          initiated_at?: string
          merchant_charge_total_kobo?: number
          order_count?: number
          paid_at?: string | null
          paystack_transfer_code?: string | null
          paystack_transfer_ref?: string | null
          period_date?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          restaurant_id?: string
          service_fee_total_kobo?: number
          settlement_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          channel: string
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
          channel?: string
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
          channel?: string
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
      wallet_transactions: {
        Row: {
          amount_kobo: number
          available_at: string | null
          created_at: string
          description: string | null
          direction: string
          id: string
          order_id: string | null
          restaurant_id: string
          settlement_id: string | null
          status: string
          type: string
        }
        Insert: {
          amount_kobo: number
          available_at?: string | null
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          order_id?: string | null
          restaurant_id: string
          settlement_id?: string | null
          status?: string
          type: string
        }
        Update: {
          amount_kobo?: number
          available_at?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          order_id?: string | null
          restaurant_id?: string
          settlement_id?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_wallet_txn_settlement"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_restaurant_id_fkey"
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
      debit_wallet_for_settlement: {
        Args: { p_amount_kobo: number; p_restaurant_id: string }
        Returns: undefined
      }
      get_my_restaurant_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      increment_wallet_pending: {
        Args: { p_amount_kobo: number; p_restaurant_id: string }
        Returns: undefined
      }
      mark_late_orders: { Args: never; Returns: undefined }
      release_pending_wallet_balances: { Args: never; Returns: undefined }
      restore_failed_settlement: {
        Args: { p_amount_kobo: number; p_restaurant_id: string }
        Returns: undefined
      }
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
  public: {
    Enums: {},
  },
} as const
