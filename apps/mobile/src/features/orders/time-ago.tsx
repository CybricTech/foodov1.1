/**
 * "5 min ago" text that keeps itself current.
 *
 * Previously the orders screen bumped a state counter every 60s purely so
 * relative timestamps would update, which re-rendered the whole screen and
 * every visible OrderCard once a minute. Now only these small Text nodes
 * re-render, off one shared interval however many are mounted.
 */
import { useSyncExternalStore } from "react";
import { Text, type TextProps } from "react-native";

import { formatTimeAgo } from "./types";

const listeners = new Set<() => void>();
let minute = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      minute += 1;
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getMinute = () => minute;

/** Re-renders the caller once a minute, sharing a single interval app-wide. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, getMinute, getMinute);
}

export function TimeAgo({ iso, ...props }: { iso: string | null } & TextProps) {
  useMinuteClock();
  return <Text {...props}>{formatTimeAgo(iso)}</Text>;
}
