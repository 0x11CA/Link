let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.08,
): void {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export type Sfx =
  | "select"
  | "connect"
  | "loop"
  | "combo"
  | "gameover"
  | "reject";

export function playSfx(kind: Sfx, enabled: boolean): void {
  if (!enabled) return;
  switch (kind) {
    case "select":
      tone(520, 0.06, "sine", 0.05);
      break;
    case "connect":
      tone(660, 0.08, "triangle", 0.06);
      break;
    case "loop":
      tone(523, 0.08, "sine", 0.07);
      setTimeout(() => tone(659, 0.08, "sine", 0.07), 70);
      setTimeout(() => tone(784, 0.12, "sine", 0.08), 140);
      break;
    case "combo":
      tone(880, 0.1, "square", 0.04);
      setTimeout(() => tone(1175, 0.12, "square", 0.04), 80);
      break;
    case "gameover":
      tone(300, 0.15, "sawtooth", 0.05);
      setTimeout(() => tone(220, 0.25, "sawtooth", 0.04), 120);
      break;
    case "reject":
      tone(180, 0.08, "triangle", 0.04);
      break;
  }
}
