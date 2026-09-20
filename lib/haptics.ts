export function haptic(
  enabled: boolean,
  pattern: number | number[] = 10,
): void {
  if (!enabled) return;
  if (typeof navigator === "undefined") return;
  if (!navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}
