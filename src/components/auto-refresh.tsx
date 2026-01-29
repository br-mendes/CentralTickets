"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AutoRefreshProps = {
  intervalSeconds?: number;
};

export function AutoRefresh({ intervalSeconds = 60 }: AutoRefreshProps) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(intervalSeconds);

  useEffect(() => {
    setRemaining(intervalSeconds);
    const intervalId = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          router.refresh();
          return intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [intervalSeconds, router]);

  const label = useMemo(() => {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remaining]);

  return (
    <div className="sync-pill" role="status" aria-live="polite">
      Atualização automática em {label}
    </div>
  );
}
