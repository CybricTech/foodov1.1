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
      activity_log: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          alerted_at: string | null
          changes: Json
          created_at: string
          id: number
          operation: string
          record_id: string | null
          restaurant_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          alerted_at?: string | null
          changes?: Json
          created_at?: string
          id?: number
          operation: string
          record_id?: string | null
          restaurant_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          alerted_at?: string | null
          changes?: Json
          created_at?: string
          id?: number
          operation?: string
          record_id?: string | null
          restaurant_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
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
      auth_events: {
        Row: {
          alerted_at: string | null
          created_at: string
          email: string | null
          event: string
          id: number
          ip: unknown
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          alerted_at?: string | null
          created_at?: string
          email?: string | null
          event: string
          id?: number
          ip?: unknown
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          alerted_at?: string | null
          created_at?: string
          email?: string | null
          event?: string
          id?: number
          ip?: unknown
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_name: string
          content: string
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          is_published: boolean
          published_at: string | null
          read_minutes: number | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author_name?: string
          content: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          read_minutes?: number | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          read_minutes?: number | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bolt_auth_tokens: {
        Row: {
          access_token: string
          expires_at: string
          id: string
          refreshed_at: string
        }
        Insert: {
          access_token: string
          expires_at: string
          id?: string
          refreshed_at?: string
        }
        Update: {
          access_token?: string
          expires_at?: string
          id?: string
          refreshed_at?: string
        }
        Relationships: []
      }
      bolt_rides: {
        Row: {
          attempt: number
          bolt_ride_id: number | null
          booked_at: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          currency_code: string | null
          driver_assigned_at: string | null
          driver_lat: number | null
          driver_lng: number | null
          driver_name: string | null
          driver_phone: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          environment: string
          estimate_kobo: number | null
          eta_seconds: number | null
          fare_breakdown: Json | null
          fare_kobo: number | null
          id: string
          invoice_url: string | null
          last_error: string | null
          last_error_code: string | null
          location_updated_at: string | null
          note_to_driver: string | null
          order_id: string
          picked_up_at: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          restaurant_id: string
          state: string
          tracking_url: string | null
          updated_at: string
          vehicle_category: string | null
        }
        Insert: {
          attempt?: number
          bolt_ride_id?: number | null
          booked_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency_code?: string | null
          driver_assigned_at?: string | null
          driver_lat?: number | null
          driver_lng?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          environment?: string
          estimate_kobo?: number | null
          eta_seconds?: number | null
          fare_breakdown?: Json | null
          fare_kobo?: number | null
          id?: string
          invoice_url?: string | null
          last_error?: string | null
          last_error_code?: string | null
          location_updated_at?: string | null
          note_to_driver?: string | null
          order_id: string
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          restaurant_id: string
          state?: string
          tracking_url?: string | null
          updated_at?: string
          vehicle_category?: string | null
        }
        Update: {
          attempt?: number
          bolt_ride_id?: number | null
          booked_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency_code?: string | null
          driver_assigned_at?: string | null
          driver_lat?: number | null
          driver_lng?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          environment?: string
          estimate_kobo?: number | null
          eta_seconds?: number | null
          fare_breakdown?: Json | null
          fare_kobo?: number | null
          id?: string
          invoice_url?: string | null
          last_error?: string | null
          last_error_code?: string | null
          location_updated_at?: string | null
          note_to_driver?: string | null
          order_id?: string
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          restaurant_id?: string
          state?: string
          tracking_url?: string | null
          updated_at?: string
          vehicle_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bolt_rides_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_rides_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog_entries: {
        Row: {
          body: string
          created_at: string
          id: string
          image_url: string | null
          published_at: string | null
          tag: string
          title: string
          updated_at: string
          version_label: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          tag?: string
          title: string
          updated_at?: string
          version_label?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          tag?: string
          title?: string
          updated_at?: string
          version_label?: string | null
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address: string
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string | null
          lat: number | null
          lng: number | null
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
          lat?: number | null
          lng?: number | null
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
          lat?: number | null
          lng?: number | null
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
      demo_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          notes: string | null
          phone: string
          restaurant_name: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          notes?: string | null
          phone: string
          restaurant_name: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          notes?: string | null
          phone?: string
          restaurant_name?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          expo_push_token: string
          id: string
          last_seen_at: string
          platform: string | null
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_push_token: string
          id?: string
          last_seen_at?: string
          platform?: string | null
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          platform?: string | null
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_redemptions: {
        Row: {
          amount_kobo: number
          created_at: string
          customer_id: string | null
          customer_phone: string
          discount_id: string
          id: string
          order_id: string | null
          restaurant_id: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          customer_id?: string | null
          customer_phone: string
          discount_id: string
          id?: string
          order_id?: string | null
          restaurant_id: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          customer_id?: string | null
          customer_phone?: string
          discount_id?: string
          id?: string
          order_id?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          archived_at: string | null
          code: string | null
          created_at: string
          delivery_zones: Json | null
          description: string | null
          ends_at: string | null
          free_delivery_dispatch: string | null
          fulfillment_type: string | null
          id: string
          is_active: boolean
          max_discount_kobo: number | null
          min_order_kobo: number
          name: string
          restaurant_id: string
          starts_at: string | null
          times_redeemed: number
          trigger: string
          type: string
          updated_at: string
          usage_limit_per_customer: number | null
          usage_limit_total: number | null
          value: number | null
        }
        Insert: {
          archived_at?: string | null
          code?: string | null
          created_at?: string
          delivery_zones?: Json | null
          description?: string | null
          ends_at?: string | null
          free_delivery_dispatch?: string | null
          fulfillment_type?: string | null
          id?: string
          is_active?: boolean
          max_discount_kobo?: number | null
          min_order_kobo?: number
          name: string
          restaurant_id: string
          starts_at?: string | null
          times_redeemed?: number
          trigger: string
          type: string
          updated_at?: string
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
          value?: number | null
        }
        Update: {
          archived_at?: string | null
          code?: string | null
          created_at?: string
          delivery_zones?: Json | null
          description?: string | null
          ends_at?: string | null
          free_delivery_dispatch?: string | null
          fulfillment_type?: string | null
          id?: string
          is_active?: boolean
          max_discount_kobo?: number | null
          min_order_kobo?: number
          name?: string
          restaurant_id?: string
          starts_at?: string | null
          times_redeemed?: number
          trigger?: string
          type?: string
          updated_at?: string
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "discounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          created_at: string
          earn_item_ids: string[]
          earn_min_order_kobo: number
          earn_scope: string
          id: string
          is_active: boolean
          restaurant_id: string
          reward_item_ids: string[]
          reward_label: string | null
          reward_max_discount_kobo: number | null
          reward_type: string
          reward_value: number | null
          stamps_required: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          earn_item_ids?: string[]
          earn_min_order_kobo?: number
          earn_scope?: string
          id?: string
          is_active?: boolean
          restaurant_id: string
          reward_item_ids?: string[]
          reward_label?: string | null
          reward_max_discount_kobo?: number | null
          reward_type?: string
          reward_value?: number | null
          stamps_required?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          earn_item_ids?: string[]
          earn_min_order_kobo?: number
          earn_scope?: string
          id?: string
          is_active?: boolean
          restaurant_id?: string
          reward_item_ids?: string[]
          reward_label?: string | null
          reward_max_discount_kobo?: number | null
          reward_type?: string
          reward_value?: number | null
          stamps_required?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_stamps: {
        Row: {
          created_at: string
          customer_phone: string
          delta: number
          id: string
          order_id: string | null
          program_id: string
          reason: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          customer_phone: string
          delta: number
          id?: string
          order_id?: string | null
          program_id: string
          reason: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          customer_phone?: string
          delta?: number
          id?: string
          order_id?: string | null
          program_id?: string
          reason?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_stamps_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_stamps_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_stamps_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
          is_addon_group: boolean
          name: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_addon_group?: boolean
          name: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_addon_group?: boolean
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
          linked_item_id: string | null
          name: string
          option_id: string
          price_modifier: number
          price_modifier_kobo: number
          restaurant_id: string
        }
        Insert: {
          id?: string
          is_available?: boolean
          linked_item_id?: string | null
          name: string
          option_id: string
          price_modifier?: number
          price_modifier_kobo?: number
          restaurant_id: string
        }
        Update: {
          id?: string
          is_available?: boolean
          linked_item_id?: string | null
          name?: string
          option_id?: string
          price_modifier?: number
          price_modifier_kobo?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_option_choices_linked_item_id_fkey"
            columns: ["linked_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
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
          featured_order: number
          id: string
          image_url: string | null
          is_addon_only: boolean
          is_available: boolean
          is_featured: boolean
          is_made_to_order: boolean
          made_to_order_lead_hours: number | null
          name: string
          prep_time_minutes: number | null
          price: number
          price_kobo: number
          restaurant_id: string
          show_new_badge: boolean
          stock_quantity: number | null
          track_inventory: boolean
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          featured_order?: number
          id?: string
          image_url?: string | null
          is_addon_only?: boolean
          is_available?: boolean
          is_featured?: boolean
          is_made_to_order?: boolean
          made_to_order_lead_hours?: number | null
          name: string
          prep_time_minutes?: number | null
          price: number
          price_kobo?: number
          restaurant_id: string
          show_new_badge?: boolean
          stock_quantity?: number | null
          track_inventory?: boolean
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          featured_order?: number
          id?: string
          image_url?: string | null
          is_addon_only?: boolean
          is_available?: boolean
          is_featured?: boolean
          is_made_to_order?: boolean
          made_to_order_lead_hours?: number | null
          name?: string
          prep_time_minutes?: number | null
          price?: number
          price_kobo?: number
          restaurant_id?: string
          show_new_badge?: boolean
          stock_quantity?: number | null
          track_inventory?: boolean
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
      merchant_agreements: {
        Row: {
          countersigned_at: string | null
          created_at: string
          created_by: string | null
          docuseal_submission_id: number | null
          fee_terms: Json
          final_pdf_path: string | null
          id: string
          kitchyn_signer_email: string | null
          legal_name: string | null
          merchant_signed_at: string | null
          merchant_signer_email: string | null
          rc_number: string | null
          restaurant_id: string
          status: string
          template_version: string
          unsigned_pdf_path: string | null
          updated_at: string
        }
        Insert: {
          countersigned_at?: string | null
          created_at?: string
          created_by?: string | null
          docuseal_submission_id?: number | null
          fee_terms?: Json
          final_pdf_path?: string | null
          id?: string
          kitchyn_signer_email?: string | null
          legal_name?: string | null
          merchant_signed_at?: string | null
          merchant_signer_email?: string | null
          rc_number?: string | null
          restaurant_id: string
          status?: string
          template_version?: string
          unsigned_pdf_path?: string | null
          updated_at?: string
        }
        Update: {
          countersigned_at?: string | null
          created_at?: string
          created_by?: string | null
          docuseal_submission_id?: number | null
          fee_terms?: Json
          final_pdf_path?: string | null
          id?: string
          kitchyn_signer_email?: string | null
          legal_name?: string | null
          merchant_signed_at?: string | null
          merchant_signer_email?: string | null
          rc_number?: string | null
          restaurant_id?: string
          status?: string
          template_version?: string
          unsigned_pdf_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_agreements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      monnify_auth_tokens: {
        Row: {
          access_token: string
          expires_at: string
          id: string
          refreshed_at: string
        }
        Insert: {
          access_token: string
          expires_at: string
          id?: string
          refreshed_at?: string
        }
        Update: {
          access_token?: string
          expires_at?: string
          id?: string
          refreshed_at?: string
        }
        Relationships: []
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
          activated_at: string | null
          bolt_autobook_stopped_at: string | null
          bolt_autobook_stopped_by: string | null
          bolt_booking_claimed_at: string | null
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
          delivery_cost_source: string | null
          delivery_distance_km: number | null
          delivery_fee: number
          delivery_fee_kobo: number
          delivery_fee_kobo_calculated: number | null
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_status: string | null
          discount_amount: number
          discount_code: string | null
          discount_id: string | null
          discount_kobo: number
          dispatch_state: string | null
          dispatch_type: string | null
          estimated_delivery_at: string | null
          fulfillment_type: string
          id: string
          late_at: string | null
          loyalty_redeemed: boolean
          loyalty_stamps_spent: number | null
          order_number: string
          payment_id: string | null
          payment_ref: string | null
          payment_status: string
          restaurant_id: string
          rider_alert_sent_at: string | null
          rider_id: string | null
          rider_request_due_at: string | null
          rider_request_source: string | null
          rider_requested_at: string | null
          scheduled_alert_sent_at: string | null
          scheduled_for: string | null
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
          activated_at?: string | null
          bolt_autobook_stopped_at?: string | null
          bolt_autobook_stopped_by?: string | null
          bolt_booking_claimed_at?: string | null
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
          delivery_cost_source?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_fee_kobo?: number
          delivery_fee_kobo_calculated?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_status?: string | null
          discount_amount?: number
          discount_code?: string | null
          discount_id?: string | null
          discount_kobo?: number
          dispatch_state?: string | null
          dispatch_type?: string | null
          estimated_delivery_at?: string | null
          fulfillment_type: string
          id?: string
          late_at?: string | null
          loyalty_redeemed?: boolean
          loyalty_stamps_spent?: number | null
          order_number: string
          payment_id?: string | null
          payment_ref?: string | null
          payment_status?: string
          restaurant_id: string
          rider_alert_sent_at?: string | null
          rider_id?: string | null
          rider_request_due_at?: string | null
          rider_request_source?: string | null
          rider_requested_at?: string | null
          scheduled_alert_sent_at?: string | null
          scheduled_for?: string | null
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
          activated_at?: string | null
          bolt_autobook_stopped_at?: string | null
          bolt_autobook_stopped_by?: string | null
          bolt_booking_claimed_at?: string | null
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
          delivery_cost_source?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_fee_kobo?: number
          delivery_fee_kobo_calculated?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_status?: string | null
          discount_amount?: number
          discount_code?: string | null
          discount_id?: string | null
          discount_kobo?: number
          dispatch_state?: string | null
          dispatch_type?: string | null
          estimated_delivery_at?: string | null
          fulfillment_type?: string
          id?: string
          late_at?: string | null
          loyalty_redeemed?: boolean
          loyalty_stamps_spent?: number | null
          order_number?: string
          payment_id?: string | null
          payment_ref?: string | null
          payment_status?: string
          restaurant_id?: string
          rider_alert_sent_at?: string | null
          rider_id?: string | null
          rider_request_due_at?: string | null
          rider_request_source?: string | null
          rider_requested_at?: string | null
          scheduled_alert_sent_at?: string | null
          scheduled_for?: string | null
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
            foreignKeyName: "orders_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
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
          monnify_ref: string | null
          monnify_status: string | null
          order_id: string | null
          paid_at: string | null
          payment_provider: string
          paystack_ref: string | null
          paystack_status: string | null
          provider_transaction_ref: string | null
          restaurant_id: string
        }
        Insert: {
          amount_kobo: number
          channel?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          monnify_ref?: string | null
          monnify_status?: string | null
          order_id?: string | null
          paid_at?: string | null
          payment_provider?: string
          paystack_ref?: string | null
          paystack_status?: string | null
          provider_transaction_ref?: string | null
          restaurant_id: string
        }
        Update: {
          amount_kobo?: number
          channel?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          monnify_ref?: string | null
          monnify_status?: string | null
          order_id?: string | null
          paid_at?: string | null
          payment_provider?: string
          paystack_ref?: string | null
          paystack_status?: string | null
          provider_transaction_ref?: string | null
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
          auto_payout_enabled: boolean
          auto_payout_shadow: boolean
          bolt_booking_enabled: boolean
          bolt_booking_shadow: boolean
          bolt_environment: string
          delivery_base_fee_kobo: number
          delivery_commission_pct: number
          delivery_max_fee_kobo: number
          delivery_max_radius_km: number
          delivery_per_km_rate_kobo: number
          id: string
          merchant_charge_pct: number
          rider_request_lead_minutes: number
          service_charge_fixed_kobo: number
          service_charge_pct: number
          settlement_hold_hours: number
          timed_rider_request_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_alert_email?: string | null
          admin_whatsapp_number?: string | null
          auto_payout_enabled?: boolean
          auto_payout_shadow?: boolean
          bolt_booking_enabled?: boolean
          bolt_booking_shadow?: boolean
          bolt_environment?: string
          delivery_base_fee_kobo?: number
          delivery_commission_pct?: number
          delivery_max_fee_kobo?: number
          delivery_max_radius_km?: number
          delivery_per_km_rate_kobo?: number
          id?: string
          merchant_charge_pct?: number
          rider_request_lead_minutes?: number
          service_charge_fixed_kobo?: number
          service_charge_pct?: number
          settlement_hold_hours?: number
          timed_rider_request_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_alert_email?: string | null
          admin_whatsapp_number?: string | null
          auto_payout_enabled?: boolean
          auto_payout_shadow?: boolean
          bolt_booking_enabled?: boolean
          bolt_booking_shadow?: boolean
          bolt_environment?: string
          delivery_base_fee_kobo?: number
          delivery_commission_pct?: number
          delivery_max_fee_kobo?: number
          delivery_max_radius_km?: number
          delivery_per_km_rate_kobo?: number
          id?: string
          merchant_charge_pct?: number
          rider_request_lead_minutes?: number
          service_charge_fixed_kobo?: number
          service_charge_pct?: number
          settlement_hold_hours?: number
          timed_rider_request_enabled?: boolean
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
          accepts_delivery: boolean
          accepts_orders: boolean
          accepts_pickup: boolean
          address: string | null
          auto_payout_enabled: boolean
          bank_account_name: string | null
          bank_account_number: string | null
          bank_code: string | null
          banner_focal_x: number
          banner_focal_x_mobile: number
          banner_focal_y: number
          banner_focal_y_mobile: number
          banner_url: string | null
          city: string | null
          closure_message: string | null
          closure_message_history: string[]
          created_at: string
          delivery_commission_pct: number | null
          delivery_fee: number
          delivery_radius_km: number | null
          description: string | null
          dispatch_policy: string
          dispatch_policy_locked_at: string | null
          dispatch_policy_locked_by: string | null
          estimated_delivery_minutes: number | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          is_test: boolean
          latitude: number | null
          location_verified_at: string | null
          logistics_default: string
          logo_url: string | null
          longitude: number | null
          max_delivery_radius_km: number | null
          min_order_amount: number | null
          monnify_bank_verified_at: string | null
          name: string
          notification_email: string | null
          opening_hours: Json | null
          paystack_recipient_code: string | null
          phone: string | null
          place_id: string | null
          primary_color: string | null
          restaurant_base_fee_kobo: number | null
          restaurant_max_fee_kobo: number | null
          restaurant_per_km_rate_kobo: number | null
          rider_request_lead_minutes: number | null
          scheduling_settings: Json | null
          slug: string
          sms_sender_id: string | null
          sms_sender_requested_at: string | null
          sms_sender_status: string | null
          state: string | null
          twitter_url: string | null
          updated_at: string
          vat_percentage: number | null
          whatsapp_number: string | null
          youtube_url: string | null
        }
        Insert: {
          accepts_delivery?: boolean
          accepts_orders?: boolean
          accepts_pickup?: boolean
          address?: string | null
          auto_payout_enabled?: boolean
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          banner_focal_x?: number
          banner_focal_x_mobile?: number
          banner_focal_y?: number
          banner_focal_y_mobile?: number
          banner_url?: string | null
          city?: string | null
          closure_message?: string | null
          closure_message_history?: string[]
          created_at?: string
          delivery_commission_pct?: number | null
          delivery_fee?: number
          delivery_radius_km?: number | null
          description?: string | null
          dispatch_policy?: string
          dispatch_policy_locked_at?: string | null
          dispatch_policy_locked_by?: string | null
          estimated_delivery_minutes?: number | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          is_test?: boolean
          latitude?: number | null
          location_verified_at?: string | null
          logistics_default?: string
          logo_url?: string | null
          longitude?: number | null
          max_delivery_radius_km?: number | null
          min_order_amount?: number | null
          monnify_bank_verified_at?: string | null
          name: string
          notification_email?: string | null
          opening_hours?: Json | null
          paystack_recipient_code?: string | null
          phone?: string | null
          place_id?: string | null
          primary_color?: string | null
          restaurant_base_fee_kobo?: number | null
          restaurant_max_fee_kobo?: number | null
          restaurant_per_km_rate_kobo?: number | null
          rider_request_lead_minutes?: number | null
          scheduling_settings?: Json | null
          slug: string
          sms_sender_id?: string | null
          sms_sender_requested_at?: string | null
          sms_sender_status?: string | null
          state?: string | null
          twitter_url?: string | null
          updated_at?: string
          vat_percentage?: number | null
          whatsapp_number?: string | null
          youtube_url?: string | null
        }
        Update: {
          accepts_delivery?: boolean
          accepts_orders?: boolean
          accepts_pickup?: boolean
          address?: string | null
          auto_payout_enabled?: boolean
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          banner_focal_x?: number
          banner_focal_x_mobile?: number
          banner_focal_y?: number
          banner_focal_y_mobile?: number
          banner_url?: string | null
          city?: string | null
          closure_message?: string | null
          closure_message_history?: string[]
          created_at?: string
          delivery_commission_pct?: number | null
          delivery_fee?: number
          delivery_radius_km?: number | null
          description?: string | null
          dispatch_policy?: string
          dispatch_policy_locked_at?: string | null
          dispatch_policy_locked_by?: string | null
          estimated_delivery_minutes?: number | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          is_test?: boolean
          latitude?: number | null
          location_verified_at?: string | null
          logistics_default?: string
          logo_url?: string | null
          longitude?: number | null
          max_delivery_radius_km?: number | null
          min_order_amount?: number | null
          monnify_bank_verified_at?: string | null
          name?: string
          notification_email?: string | null
          opening_hours?: Json | null
          paystack_recipient_code?: string | null
          phone?: string | null
          place_id?: string | null
          primary_color?: string | null
          restaurant_base_fee_kobo?: number | null
          restaurant_max_fee_kobo?: number | null
          restaurant_per_km_rate_kobo?: number | null
          rider_request_lead_minutes?: number | null
          scheduling_settings?: Json | null
          slug?: string
          sms_sender_id?: string | null
          sms_sender_requested_at?: string | null
          sms_sender_status?: string | null
          state?: string | null
          twitter_url?: string | null
          updated_at?: string
          vat_percentage?: number | null
          whatsapp_number?: string | null
          youtube_url?: string | null
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
          canonical_net_kobo: number | null
          created_at: string
          delivery_commission_kobo: number
          failure_reason: string | null
          gross_total_kobo: number
          id: string
          initiated_at: string
          merchant_charge_total_kobo: number
          monnify_disbursement_reference: string | null
          monnify_transaction_reference: string | null
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
          canonical_net_kobo?: number | null
          created_at?: string
          delivery_commission_kobo?: number
          failure_reason?: string | null
          gross_total_kobo?: number
          id?: string
          initiated_at?: string
          merchant_charge_total_kobo?: number
          monnify_disbursement_reference?: string | null
          monnify_transaction_reference?: string | null
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
          canonical_net_kobo?: number | null
          created_at?: string
          delivery_commission_kobo?: number
          failure_reason?: string | null
          gross_total_kobo?: number
          id?: string
          initiated_at?: string
          merchant_charge_total_kobo?: number
          monnify_disbursement_reference?: string | null
          monnify_transaction_reference?: string | null
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
          last_seen_changelog_at: string | null
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
          last_seen_changelog_at?: string | null
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
          last_seen_changelog_at?: string | null
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
      audit_trail: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          actor_name: string | null
          actor_role_label: string | null
          created_at: string | null
          detail: Json | null
          id: string | null
          operation: string | null
          restaurant_id: string | null
          restaurant_name: string | null
          source: string | null
          table_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_scheduled_orders: { Args: never; Returns: undefined }
      debit_wallet_for_settlement: {
        Args: { p_amount_kobo: number; p_restaurant_id: string }
        Returns: undefined
      }
      evaluate_audit_alerts: {
        Args: never
        Returns: {
          actor_email: string
          detail: Json
          event_at: string
          restaurant_name: string
          rule: string
          target_email: string
        }[]
      }
      finance_assert_admin: { Args: never; Returns: undefined }
      finance_daily: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day: string
          delivery_margin_kobo: number
          foodo_net_kobo: number
          gateway_fees_kobo: number
          gmv_kobo: number
          merchant_charge_kobo: number
          net_revenue_kobo: number
          order_count: number
          pending_platform_deliveries: number
          service_fees_kobo: number
        }[]
      }
      finance_order_economics: {
        Args: { p_from: string; p_to: string }
        Returns: {
          created_at: string
          delivery_cost_kobo: number
          delivery_fee_kobo: number
          delivery_margin_kobo: number
          discount_kobo: number
          dispatch_type: string
          foodo_net_kobo: number
          fulfillment_type: string
          gateway_fee_kobo: number
          merchant_charge_kobo: number
          order_id: string
          order_total_kobo: number
          own_commission_kobo: number
          payment_status: string
          platform_delivery_margin_kobo: number
          platform_delivery_pending: boolean
          restaurant_id: string
          restaurant_name: string
          service_fee_kobo: number
          status: string
          subtotal_kobo: number
          vat_kobo: number
          wat_date: string
        }[]
      }
      finance_per_merchant: {
        Args: { p_from: string; p_to: string }
        Returns: {
          delivery_margin_kobo: number
          foodo_net_kobo: number
          gateway_fees_kobo: number
          gmv_kobo: number
          merchant_charge_kobo: number
          net_revenue_kobo: number
          order_count: number
          restaurant_id: string
          restaurant_name: string
          service_fees_kobo: number
        }[]
      }
      finance_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_order_value_kobo: number
          delivery_fees_realised_kobo: number
          delivery_margin_kobo: number
          discounts_kobo: number
          foodo_net_kobo: number
          gateway_fees_kobo: number
          gmv_kobo: number
          merchant_charge_kobo: number
          net_revenue_kobo: number
          order_count: number
          own_commission_kobo: number
          pending_platform_deliveries: number
          platform_delivery_margin_kobo: number
          refund_count: number
          refunds_kobo: number
          rider_costs_kobo: number
          service_fees_kobo: number
          take_rate: number
          vat_collected_kobo: number
        }[]
      }
      foodo_order_net_kobo: {
        Args: {
          p_dc_pct: number
          p_delivery: number
          p_dispatch: string
          p_mc_pct: number
          p_service: number
          p_subtotal: number
          p_total: number
          p_vat: number
        }
        Returns: number
      }
      foodo_resolved_dispatch_type: {
        Args: { p_order_id: string }
        Returns: string
      }
      get_my_restaurant_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      increment_wallet_pending: {
        Args: { p_amount_kobo: number; p_restaurant_id: string }
        Returns: undefined
      }
      loyalty_accrue_for_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      loyalty_balance: {
        Args: { p_phone: string; p_program_id: string }
        Returns: number
      }
      loyalty_program_participants: {
        Args: { p_program_id: string }
        Returns: {
          balance: number
          customer_phone: string
          last_activity: string
          stamp_count: number
          total_earned: number
        }[]
      }
      mark_late_orders: { Args: never; Returns: undefined }
      prune_audit_data: { Args: never; Returns: undefined }
      recompute_all_restaurant_wallets: { Args: never; Returns: undefined }
      recompute_restaurant_wallet: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      redeem_discount: { Args: { p_discount_id: string }; Returns: number }
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
