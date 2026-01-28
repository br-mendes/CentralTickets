import { differenceInSeconds, parseISO } from "date-fns";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function computeSlaPercent(params: {
  startISO: string | null;
  endISO: string | null;         // se null, usa agora
  allowedSeconds: number | null; // SLA target em segundos
  waitingSeconds?: number | null;
}) {
  const { startISO, endISO, allowedSeconds, waitingSeconds } = params;

  if (!startISO || !allowedSeconds || allowedSeconds <= 0) {
    return { percent: null as number | null, overdue: null as boolean | null };
  }

  const start = parseISO(startISO);
  const end = endISO ? parseISO(endISO) : new Date();

  let elapsed = differenceInSeconds(end, start);
  if (waitingSeconds && waitingSeconds > 0) elapsed -= waitingSeconds;

  elapsed = Math.max(0, elapsed);

  const percent = clamp((elapsed / allowedSeconds) * 100, 0, 9999);
  const overdue = elapsed > allowedSeconds;

  return {
    percent: Math.round(percent * 100) / 100,
    overdue,
  };
}