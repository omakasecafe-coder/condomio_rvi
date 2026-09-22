import { useCallback, useEffect, useState } from "react";

const RESEND_DELAY_SECONDS = 60;

export function useResendCountdown() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds(current => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  const restart = useCallback(() => setSeconds(RESEND_DELAY_SECONDS), []);
  const reset = useCallback(() => setSeconds(0), []);

  return { seconds, restart, reset, canResend: seconds === 0 };
}
