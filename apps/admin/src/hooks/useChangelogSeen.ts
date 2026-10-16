import { useCallback, useState } from "react";

import { ENV } from "@/config/env";

/**
 * The version whose notes the operator has already looked at.
 *
 * `localStorage`, not the API: whether *this person on this browser* has read
 * the notes is a device-local fact, and sending it to the server would mean a
 * column, an endpoint and a migration to answer a question nobody else asks.
 * The same reasoning the locale choice already follows.
 */
const SEEN_KEY = "admin-changelog-seen";

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    // Storage blocked by the browser. Not a reason to fail to render — and the
    // worst case is a dot that never goes away.
    return null;
  }
}

/**
 * Whether the running release has notes the operator has not seen yet.
 *
 * Lives in `src/hooks` rather than inside the changelog feature because two
 * places need the same answer: the changelog page marks it read, and the
 * sidebar's version stamp shows the dot that sends people there. The Golden
 * Rule forbids the dashboard feature importing the changelog feature, so the
 * shared part is promoted instead of one reaching into the other.
 */
export function useChangelogSeen() {
  const [seen, setSeen] = useState<string | null>(readSeen);

  // An unstamped local build has no version to compare, so it never claims
  // there is something new to read.
  const hasUnseen = ENV.APP_VERSION !== "" && ENV.APP_VERSION !== seen;

  const markSeen = useCallback(() => {
    if (ENV.APP_VERSION === "") return;

    setSeen(ENV.APP_VERSION);

    try {
      localStorage.setItem(SEEN_KEY, ENV.APP_VERSION);
    } catch {
      // Same as above: the in-memory marker still clears the dot this session.
    }
  }, []);

  return { hasUnseen, markSeen };
}
