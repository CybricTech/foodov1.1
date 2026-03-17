/**
 * Background GPS broadcast task.
 * Broadcasts rider location every GPS_BROADCAST_INTERVAL_MS during active delivery.
 * Runs as an Android Foreground Service so it survives app backgrounding.
 *
 * IMPORTANT: This file must be imported at the ROOT of the entry point (app/_layout.tsx)
 * so TaskManager.defineTask runs before the task is started.
 */
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { supabase } from "../supabase";
import { useAuthStore } from "../stores/auth";
import { LOCATION_TASK_NAME, GPS_BROADCAST_INTERVAL_MS } from "../../constants";

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("[GPS] task error:", error.message);
    return;
  }
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;

  const { latitude, longitude } = locations[0].coords;
  const rider = useAuthStore.getState().rider;
  if (!rider) return;

  const { error: dbError } = await supabase
    .from("platform_riders")
    .update({ current_lat: latitude, current_lng: longitude })
    .eq("id", rider.id);

  if (dbError) {
    console.error("[GPS] update error:", dbError.message);
  }
});

export async function startBroadcast(): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    console.warn("[GPS] foreground permission not granted");
    return;
  }
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== "granted") {
    console.warn("[GPS] background permission not granted — location may stop when backgrounded");
  }

  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (isRunning) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: GPS_BROADCAST_INTERVAL_MS,
    distanceInterval: 0,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Foodo Rider",
      notificationBody: "Tracking your location for active delivery",
      notificationColor: "#FF6B35",
    },
  });
}

export async function stopBroadcast(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
