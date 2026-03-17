import { useState, useEffect } from "react";
import * as Location from "expo-location";

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  error: string | null;
}

export function useCurrentLocation(): LocationState {
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    error: null,
  });

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setState((s) => ({ ...s, error: "Location permission denied" }));
        return;
      }

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000 },
        (loc) => {
          setState({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            error: null,
          });
        }
      );
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  return state;
}
