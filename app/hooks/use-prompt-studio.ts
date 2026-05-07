"use client";

import { useCallback, useEffect, useState } from "react";

import type { PersonaId } from "@/lib/personas";
import { PERSONAS } from "@/lib/personas";

export type PromptStudioState = {
  showContext: string;
  directive: string;
  tone: string;
  guardrails: string;
  personaPrompts: Record<PersonaId, string>;
};

const STORAGE_KEY = "twist-sidebar-prompt-studio";

export const PROMPT_PRESETS = [
  {
    id: "bounty",
    label: "Bounty sharp",
    directive:
      "Prioritize high-signal cards that prove the app is listening live. Write like a premium producer whispering the next useful thing into the host's ear.",
    tone: "fast, clever, specific, producer-brain, never generic",
    guardrails:
      "No recap filler. Every card must add a fact, joke, framing angle, news hook, or production cue.",
  },
  {
    id: "research",
    label: "Research desk",
    directive:
      "Make the sidebar feel like a live research room. Favor evidence, timestamps, named entities, search-worthy claims, and context that helps the host sound prepared.",
    tone: "precise, calm, cited, useful",
    guardrails:
      "Do not guess current facts. When unsure, say what should be verified and why it matters.",
  },
  {
    id: "writers",
    label: "Writers' room",
    directive:
      "Make the personas feel like an active writers' room. Give punchy tags, contrarian angles, callbacks, and segment ideas that can be used immediately on-air.",
    tone: "witty, energetic, lightly chaotic, clean enough for a demo",
    guardrails:
      "Avoid mean-spirited attacks on private people. Keep jokes short and tied to the transcript.",
  },
] as const;

export function createDefaultPromptStudio(): PromptStudioState {
  return {
    showContext:
      "A live tech/startup podcast companion for TWiST-style conversations. The sidebar should help hosts by surfacing useful facts, recent context, jokes, and production cues in real time.",
    directive:
      "Write short, specific cards that feel live. Prefer concrete claims, named entities, punchlines, and next-best actions over summaries.",
    tone: "premium, quick, sharp, informed, playful without being sloppy",
    guardrails:
      "No generic summaries. No long essays. Cite when checking facts or news. Keep cynical commentary edgy but not hateful or abusive.",
    personaPrompts: {
      "fact-checker":
        "Extract the claim, say what needs verification, and provide a crisp correction or useful stat.",
      "comedy-writer":
        "Write one usable one-liner or tag. Make it short enough to read on-air.",
      "news-update":
        "Surface recent relevant news only when it clearly connects to the transcript.",
      "cynical-commentary":
        "Be skeptical and funny, not cruel. Aim for producer-room snark.",
    },
  };
}

function mergePromptStudio(value: unknown): PromptStudioState {
  const defaults = createDefaultPromptStudio();
  if (!value || typeof value !== "object") return defaults;

  const raw = value as Partial<PromptStudioState>;
  return {
    showContext:
      typeof raw.showContext === "string"
        ? raw.showContext
        : defaults.showContext,
    directive:
      typeof raw.directive === "string"
        ? raw.directive
        : defaults.directive,
    tone:
      typeof raw.tone === "string" ? raw.tone : defaults.tone,
    guardrails:
      typeof raw.guardrails === "string"
        ? raw.guardrails
        : defaults.guardrails,
    personaPrompts: {
      ...defaults.personaPrompts,
      ...(raw.personaPrompts && typeof raw.personaPrompts === "object"
        ? raw.personaPrompts
        : {}),
    },
  };
}

export function usePromptStudio() {
  const [promptStudio, setPromptStudio] = useState<PromptStudioState>(
    () => createDefaultPromptStudio()
  );

  /* ── hydrate ── */
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      setPromptStudio(mergePromptStudio(JSON.parse(saved)));
    } catch {
      setPromptStudio(createDefaultPromptStudio());
    }
  }, []);

  /* ── persist ── */
  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(promptStudio)
    );
  }, [promptStudio]);

  const updatePromptStudio = useCallback(
    (
      field: keyof Omit<PromptStudioState, "personaPrompts">,
      value: string
    ) => {
      setPromptStudio((current) => ({ ...current, [field]: value }));
    },
    []
  );

  const updatePersonaPrompt = useCallback(
    (personaId: PersonaId, value: string) => {
      setPromptStudio((current) => ({
        ...current,
        personaPrompts: { ...current.personaPrompts, [personaId]: value },
      }));
    },
    []
  );

  const applyPromptPreset = useCallback(
    (preset: (typeof PROMPT_PRESETS)[number]) => {
      setPromptStudio((current) => ({
        ...current,
        directive: preset.directive,
        tone: preset.tone,
        guardrails: preset.guardrails,
      }));
    },
    []
  );

  const resetPromptStudio = useCallback(() => {
    setPromptStudio(createDefaultPromptStudio());
  }, []);

  return {
    promptStudio,
    updatePromptStudio,
    updatePersonaPrompt,
    applyPromptPreset,
    resetPromptStudio,
    PERSONAS,
  } as const;
}
