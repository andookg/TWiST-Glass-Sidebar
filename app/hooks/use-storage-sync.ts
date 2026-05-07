"use client";

import { useCallback, useEffect, useState } from "react";

export type StorageStatus = {
  provider: string;
  configured: boolean;
  destination: string;
  secureByDefault: boolean;
  capabilities: string[];
};

const DEFAULT_STATUS: StorageStatus = {
  provider: "none",
  configured: false,
  destination: "not configured",
  secureByDefault: true,
  capabilities: ["demo mode"],
};

export function useStorageSync() {
  const [storageStatus, setStorageStatus] =
    useState<StorageStatus>(DEFAULT_STATUS);
  const [storageMessage, setStorageMessage] = useState("");

  /* ── fetch status on mount ── */
  useEffect(() => {
    let alive = true;

    fetch("/api/storage/status")
      .then((r) => r.json())
      .then((payload) => {
        if (alive && payload?.provider) {
          setStorageStatus(payload as StorageStatus);
        }
      })
      .catch(() => {
        setStorageStatus((current) => ({
          ...current,
          configured: false,
        }));
      });

    return () => {
      alive = false;
    };
  }, []);

  /* ── save event ── */
  const saveStorageEvent = useCallback(
    async (type: string, payload: unknown, projectId = "default") => {
      try {
        const response = await fetch("/api/storage/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, projectId, payload }),
        });
        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            result?.error ?? "Storage save failed."
          );
        }

        if (result?.status) {
          setStorageStatus(result.status as StorageStatus);
        }
        setStorageMessage(
          result?.saved
            ? "Saved to connected storage."
            : "Storage is not configured."
        );
      } catch (error) {
        setStorageMessage(
          error instanceof Error
            ? error.message
            : "Storage save failed."
        );
      }
    },
    []
  );

  return {
    storageStatus,
    setStorageStatus,
    storageMessage,
    saveStorageEvent,
  } as const;
}
