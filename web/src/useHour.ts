/** The hour on the device's clock, checked once a minute. */
import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

export function useHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = window.setInterval(() => setHour(new Date().getHours()), MINUTE_MS);
    return () => window.clearInterval(id);
  }, []);
  return hour;
}
