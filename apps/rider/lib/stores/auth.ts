import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../supabase";

interface RiderProfile {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  is_online: boolean;
  active_deliveries: number;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  rider: RiderProfile | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setRider: (rider: RiderProfile | null) => void;
  signOut: () => Promise<void>;
  fetchRider: () => Promise<void>;
  toggleOnline: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  rider: null,
  loading: true,

  setSession: (session) => {
    set({ session, user: session?.user ?? null, loading: false });
  },

  setRider: (rider) => set({ rider }),

  fetchRider: async () => {
    const { user } = get();
    if (!user) return;
    const { data } = await supabase
      .from("platform_riders")
      .select("id, user_id, name, phone, is_online, active_deliveries")
      .eq("user_id", user.id)
      .single();
    if (data) set({ rider: data as RiderProfile });
  },

  toggleOnline: async () => {
    const { rider } = get();
    if (!rider) return;
    const newStatus = !rider.is_online;
    await supabase
      .from("platform_riders")
      .update({ is_online: newStatus })
      .eq("id", rider.id);
    set({ rider: { ...rider, is_online: newStatus } });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, rider: null });
  },
}));
