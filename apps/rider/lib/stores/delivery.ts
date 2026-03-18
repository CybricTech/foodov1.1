import { create } from "zustand";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { startBroadcast, stopBroadcast } from "../tasks/location-broadcast";

export type AssignmentStatus =
  | "pending"
  | "accepted"
  | "picked_up"
  | "delivered"
  | "cancelled";

export interface DeliveryAssignment {
  id: string;
  order_id: string;
  rider_id: string;
  status: AssignmentStatus;
  dispatched_at: string | null;
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  order?: {
    id: string;
    order_number: string;
    total_kobo: number;
    customer_name: string;
    customer_phone: string;
    delivery_address: string;
    restaurant?: {
      name: string;
      address: string;
    };
  };
}

interface DeliveryState {
  assignments: DeliveryAssignment[];
  activeAssignment: DeliveryAssignment | null;
  loading: boolean;
  fetchAssignments: (riderId: string) => Promise<void>;
  handleAssignmentChange: (
    payload: RealtimePostgresChangesPayload<DeliveryAssignment>
  ) => void;
  acceptAssignment: (assignmentId: string) => Promise<void>;
  declineAssignment: (assignmentId: string) => Promise<void>;
  markPickedUp: (assignmentId: string) => Promise<void>;
  markDelivered: (assignmentId: string) => Promise<void>;
}

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  assignments: [],
  activeAssignment: null,
  loading: false,

  fetchAssignments: async (riderId: string) => {
    set({ loading: true });
    const { data } = await supabase
      .from("delivery_assignments")
      .select(
        `id, order_id, rider_id, status, dispatched_at, accepted_at, picked_up_at, delivered_at,
         order:orders(id, order_number, total_kobo, customer_name, customer_phone, delivery_address,
           restaurant:restaurants(name, address))`
      )
      .eq("rider_id", riderId)
      .in("status", ["pending", "accepted", "picked_up"])
      .order("dispatched_at", { ascending: false });

    const assignments = (data ?? []) as unknown as DeliveryAssignment[];
    const active = assignments.find(
      (a) => a.status === "accepted" || a.status === "picked_up"
    ) ?? null;
    set({ assignments, activeAssignment: active, loading: false });
  },

  handleAssignmentChange: (payload) => {
    const { eventType, new: updated, old } = payload;
    const { assignments } = get();

    if (eventType === "INSERT") {
      const newAssignment = updated as DeliveryAssignment;
      set({ assignments: [newAssignment, ...assignments] });
    } else if (eventType === "UPDATE") {
      const updatedAssignment = updated as DeliveryAssignment;
      const next = assignments.map((a) =>
        a.id === updatedAssignment.id ? { ...a, ...updatedAssignment } : a
      );
      const active = next.find(
        (a) => a.status === "accepted" || a.status === "picked_up"
      ) ?? null;
      set({ assignments: next, activeAssignment: active });
    } else if (eventType === "DELETE") {
      const removed = old as DeliveryAssignment;
      set({
        assignments: assignments.filter((a) => a.id !== removed.id),
      });
    }
  },

  acceptAssignment: async (assignmentId: string) => {
    await supabase
      .from("delivery_assignments")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", assignmentId);
    await startBroadcast();
  },

  declineAssignment: async (assignmentId: string) => {
    await supabase
      .from("delivery_assignments")
      .update({ status: "cancelled" })
      .eq("id", assignmentId);
  },

  markPickedUp: async (assignmentId: string) => {
    await supabase
      .from("delivery_assignments")
      .update({ status: "picked_up", picked_up_at: new Date().toISOString() })
      .eq("id", assignmentId);
  },

  markDelivered: async (assignmentId: string) => {
    await supabase
      .from("delivery_assignments")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", assignmentId);
    await stopBroadcast();
  },
}));
