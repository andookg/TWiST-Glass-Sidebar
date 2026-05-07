"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PersonaCard, PersonaId } from "@/lib/personas";
import { PERSONAS } from "@/lib/personas";
import type { MemoryAttachment } from "@/lib/memory-stash";

export type PromptStudioState = {
  showContext: string;
  directive: string;
  tone: string;
  guardrails: string;
  personaPrompts: Record<PersonaId, string>;
};

export type ProjectMemoryState = {
  projectId: string;
  projectName: string;
  ownerContext: string;
  audience: string;
  preferredTools: string;
  dataPolicy: string;
  storageNotes: string;
  autosaveCards: boolean;
  autosaveTranscript: boolean;
};

export function usePersonaEngine(deps: {
  activeModel: string;
  selectedProvider: string;
  promptStudio: PromptStudioState;
  projectMemory: ProjectMemoryState;
  memoryAttachments: MemoryAttachment[];
  aiMuted: boolean;
  buildPublicProjectMemory: (
    memory: ProjectMemoryState,
    attachments: MemoryAttachment[]
  ) => Record<string, unknown>;
  onCardsGenerated?: (cards: PersonaCard[]) => void;
}) {
  const {
    activeModel,
    selectedProvider,
    promptStudio,
    projectMemory,
    memoryAttachments,
    aiMuted,
    buildPublicProjectMemory,
    onCardsGenerated,
  } = deps;

  const [personaCards, setPersonaCards] = useState<PersonaCard[]>([]);
  const [activePersonaIds, setActivePersonaIds] = useState<PersonaId[]>(
    PERSONAS.map((p) => p.id)
  );
  const [speakingPersonaIds, setSpeakingPersonaIds] = useState<Set<PersonaId>>(
    new Set()
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const analyzeTimerRef = useRef<number | null>(null);
  const lastAnalyzedRef = useRef("");
  const lastAnalyzedAtRef = useRef(0);
  const analyzingRef = useRef(false);

  const latestCardsByPersona = useMemo(() => {
    const map = new Map<PersonaId, PersonaCard>();
    for (const card of personaCards) {
      if (!map.has(card.persona)) map.set(card.persona, card);
    }
    return map;
  }, [personaCards]);

  const latestNotificationCards = useMemo(
    () => personaCards.slice(0, 3),
    [personaCards]
  );

  /* ── toggle persona ── */
  const togglePersona = useCallback((personaId: PersonaId) => {
    setActivePersonaIds((current) => {
      if (current.includes(personaId)) {
        return current.filter((id) => id !== personaId);
      }
      return [...current, personaId];
    });
  }, []);

  /* ── analyze transcript ── */
  const analyzeTranscript = useCallback(
    async (windowText: string) => {
      const trimmed = windowText.trim();
      if (
        !trimmed ||
        aiMuted ||
        activePersonaIds.length === 0 ||
        analyzingRef.current
      )
        return;

      analyzingRef.current = true;
      setAnalyzing(true);
      setErrorMessage("");
      setSpeakingPersonaIds(new Set(activePersonaIds));

      try {
        const response = await fetch("/api/personas/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcriptWindow: trimmed,
            activePersonas: activePersonaIds,
            modelRouter: {
              provider: selectedProvider,
              model: activeModel,
            },
            promptStudio,
            projectMemory: buildPublicProjectMemory(
              projectMemory,
              memoryAttachments
            ),
            showMetadata: {
              title: "Live podcast demo",
              host: "Captured browser audio",
              episode: promptStudio.showContext,
            },
          }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.error ?? "Persona analysis failed."
          );
        }

        const cards = Array.isArray(payload?.cards)
          ? (payload.cards as PersonaCard[])
          : [];

        if (cards.length > 0) {
          setPersonaCards((current) =>
            [...cards, ...current].slice(0, 36)
          );
          setSpeakingPersonaIds(
            new Set(cards.map((card) => card.persona))
          );
          onCardsGenerated?.(cards);
        }

        lastAnalyzedRef.current = trimmed;
        lastAnalyzedAtRef.current = Date.now();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Persona analysis failed."
        );
      } finally {
        analyzingRef.current = false;
        setAnalyzing(false);
        window.setTimeout(() => setSpeakingPersonaIds(new Set()), 1800);
      }
    },
    [
      activeModel,
      activePersonaIds,
      aiMuted,
      buildPublicProjectMemory,
      memoryAttachments,
      onCardsGenerated,
      projectMemory,
      promptStudio,
      selectedProvider,
    ]
  );

  /* ── auto-analyze on transcript change ── */
  const scheduleAnalysis = useCallback(
    (transcriptWindow: string) => {
      if (
        !transcriptWindow ||
        transcriptWindow.length < 80 ||
        aiMuted
      )
        return;
      if (transcriptWindow === lastAnalyzedRef.current) return;

      if (analyzeTimerRef.current) {
        window.clearTimeout(analyzeTimerRef.current);
      }

      const waitMs = Math.max(
        900,
        6500 - (Date.now() - lastAnalyzedAtRef.current)
      );
      analyzeTimerRef.current = window.setTimeout(() => {
        void analyzeTranscript(transcriptWindow);
      }, waitMs);
    },
    [aiMuted, analyzeTranscript]
  );

  /* ── cleanup ── */
  useEffect(() => {
    return () => {
      if (analyzeTimerRef.current)
        window.clearTimeout(analyzeTimerRef.current);
    };
  }, []);

  /* ── clear ── */
  const clearPersonaCards = useCallback(() => {
    setPersonaCards([]);
    setErrorMessage("");
    lastAnalyzedRef.current = "";
  }, []);

  return {
    personaCards,
    activePersonaIds,
    speakingPersonaIds,
    analyzing,
    errorMessage,
    setErrorMessage,
    latestCardsByPersona,
    latestNotificationCards,
    togglePersona,
    analyzeTranscript,
    scheduleAnalysis,
    clearPersonaCards,
  } as const;
}
