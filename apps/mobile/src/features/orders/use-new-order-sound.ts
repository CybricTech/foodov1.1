/**
 * New-order chime — the mobile equivalent of the web frontline's WebAudio beep.
 *
 * The web client synthesizes an 880→1100→880 tone on every new order and loops
 * it every 3s while there are un-accepted orders (with a mute toggle). RN has no
 * WebAudio, so we ship that exact tone as a bundled WAV (`assets/new_order.wav`,
 * generated to mirror the web envelope) and drive it with `expo-audio`.
 *
 * Exposes `play()` (seek-to-start + play so rapid repeats restart cleanly) and a
 * `muted` toggle. Looping cadence is owned by the screen, matching web.
 */
import { useCallback, useEffect } from "react";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";

// Static require so Metro bundles the asset.
const NEW_ORDER_SOUND = require("../../../assets/new_order.wav");

export function useNewOrderSound(muted: boolean) {
  const player = useAudioPlayer(NEW_ORDER_SOUND);

  useEffect(() => {
    // Allow the chime to sound even when the device ringer is on silent — a
    // kitchen tablet on a counter must still alert staff. Best-effort; ignore
    // failures on platforms/permissions that reject it.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const play = useCallback(() => {
    if (muted) return;
    try {
      // Restart from the top so back-to-back orders each get a full chime.
      player.seekTo(0).catch(() => {});
      player.play();
    } catch {
      // Player not ready / unloaded — non-fatal.
    }
  }, [muted, player]);

  return { play };
}
