"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 120_000;

export function AutoRefreshStatus() {
  const router = useRouter();
  const [nextRefreshAt, setNextRefreshAt] = useState(() => Date.now() + REFRESH_INTERVAL_MS);
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    Math.ceil(REFRESH_INTERVAL_MS / 1000)
  );

  useEffect(() => {
    const tick = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        router.refresh();
        setNextRefreshAt(Date.now() + REFRESH_INTERVAL_MS);
      }
    }, 1000);

    return () => window.clearInterval(tick);
  }, [nextRefreshAt, router]);

  const countdownLabel = useMemo(() => {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    const minutesLabel = String(minutes).padStart(2, "0");
    const secondsLabel = String(seconds).padStart(2, "0");
    return `${minutesLabel}:${secondsLabel}`;
  }, [secondsRemaining]);

  return <div className="sync-pill">Próxima atualização automática em {countdownLabel}</div>;
}
