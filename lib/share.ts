export async function shareText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
      return true;
    } catch {
      // fall through
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
