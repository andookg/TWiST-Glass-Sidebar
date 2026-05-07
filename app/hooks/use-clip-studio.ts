"use client";

import { useCallback, useState } from "react";

import type { ClipHandoffManifest, ClipSuggestion } from "@/lib/clips";

export function useClipStudio(deps: {
  saveStorageEvent: (
    type: string,
    payload: unknown,
    projectId?: string
  ) => Promise<void>;
  setStorageStatus: (status: unknown) => void;
}) {
  const { saveStorageEvent, setStorageStatus } = deps;

  const [clipSuggestions, setClipSuggestions] = useState<ClipSuggestion[]>(
    []
  );
  const [clipLoading, setClipLoading] = useState(false);
  const [clipMessage, setClipMessage] = useState("");
  const [handoffManifest, setHandoffManifest] =
    useState<ClipHandoffManifest | null>(null);

  /* ── suggest clips ── */
  const suggestClips = useCallback(
    async (input: {
      transcriptWindow: string;
      personaCards: unknown[];
      modelRouter: { provider: string; model: string };
      promptStudio: unknown;
      projectMemory: unknown;
      sampleLines: string[];
    }) => {
      const windowText =
        input.transcriptWindow || input.sampleLines.join("\n");
      setClipLoading(true);
      setClipMessage("");

      try {
        const response = await fetch("/api/clips/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcriptWindow: windowText,
            personaCards: input.personaCards.slice(0, 12),
            modelRouter: input.modelRouter,
            promptStudio: input.promptStudio,
            projectMemory: input.projectMemory,
          }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.error ?? "Clip suggestions failed."
          );
        }

        const clips = Array.isArray(payload?.clips)
          ? (payload.clips as ClipSuggestion[])
          : [];
        setClipSuggestions(clips);
        setHandoffManifest(null);
        setClipMessage(
          clips.length > 0
            ? `${clips.length} clip suggestions ready for Remotion or bot handoff.`
            : "No strong clip moments found yet."
        );

        if (clips.length > 0) {
          void saveStorageEvent("clip_suggestions", {
            clips,
            transcriptWindow: windowText,
            projectMemory: input.projectMemory,
            modelRouter: payload?.modelRouter,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Clip suggestions failed.";
        setClipMessage(message);
      } finally {
        setClipLoading(false);
      }
    },
    [saveStorageEvent]
  );

  /* ── create bot handoff ── */
  const createBotHandoff = useCallback(
    async (projectMemory: unknown) => {
      if (clipSuggestions.length === 0) {
        setClipMessage(
          "Create clip suggestions before sending a bot handoff."
        );
        return;
      }

      setClipLoading(true);
      setClipMessage("");

      try {
        const response = await fetch("/api/agent/clip-handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clips: clipSuggestions,
            projectMemory,
          }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.error ?? "Bot handoff failed."
          );
        }

        const manifest = payload?.manifest as
          | ClipHandoffManifest
          | undefined;
        setHandoffManifest(manifest ?? null);
        if (payload?.storage?.status) {
          setStorageStatus(payload.storage.status);
        }
        setClipMessage(
          manifest
            ? `${manifest.actions.length} render actions are ready for external agents.`
            : "Bot handoff manifest created."
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Bot handoff failed.";
        setClipMessage(message);
      } finally {
        setClipLoading(false);
      }
    },
    [clipSuggestions, setStorageStatus]
  );

  /* ── clear ── */
  const clearClips = useCallback(() => {
    setClipSuggestions([]);
    setHandoffManifest(null);
    setClipMessage("");
  }, []);

  return {
    clipSuggestions,
    clipLoading,
    clipMessage,
    handoffManifest,
    suggestClips,
    createBotHandoff,
    clearClips,
  } as const;
}
