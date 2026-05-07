"use client";

import { useCallback, useEffect, useState } from "react";

import type { MemoryAttachment } from "@/lib/memory-stash";

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

const STORAGE_KEY = "twist-sidebar-project-memory";

export function createDefaultProjectMemory(): ProjectMemoryState {
  return {
    projectId: "default",
    projectName: "My live show sidebar",
    ownerContext:
      "Downloaded open-source instance. Adapt cards to my show, my workflow, and the tools I connect.",
    audience:
      "Hosts, producers, editors, and viewers watching the enhanced stream.",
    preferredTools:
      "OpenRouter or OpenAI for model routing; local-first by default; connect my own cloud through server environment variables.",
    dataPolicy:
      "Do not store secrets in browser localStorage. Local key setup posts keys only to my local server; save transcript/card/project-memory data only when explicitly enabled.",
    storageNotes:
      "Use local JSONL, webhook/custom API, or Supabase when configured on the server.",
    autosaveCards: true,
    autosaveTranscript: false,
  };
}

function mergeProjectMemory(value: unknown): ProjectMemoryState {
  const defaults = createDefaultProjectMemory();
  if (!value || typeof value !== "object") return defaults;

  const raw = value as Partial<ProjectMemoryState>;
  return {
    ...defaults,
    ...Object.fromEntries(
      Object.entries(raw).filter(
        ([, fieldValue]) => typeof fieldValue === "string"
      )
    ),
    autosaveCards:
      typeof raw.autosaveCards === "boolean"
        ? raw.autosaveCards
        : defaults.autosaveCards,
    autosaveTranscript:
      typeof raw.autosaveTranscript === "boolean"
        ? raw.autosaveTranscript
        : defaults.autosaveTranscript,
  };
}

export function useProjectMemory() {
  const [projectMemory, setProjectMemory] = useState<ProjectMemoryState>(
    () => createDefaultProjectMemory()
  );

  /* ── hydrate ── */
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      setProjectMemory(mergeProjectMemory(JSON.parse(saved)));
    } catch {
      setProjectMemory(createDefaultProjectMemory());
    }
  }, []);

  /* ── persist ── */
  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(projectMemory)
    );
  }, [projectMemory]);

  const updateProjectMemory = useCallback(
    (
      field: keyof Omit<
        ProjectMemoryState,
        "autosaveCards" | "autosaveTranscript"
      >,
      value: string
    ) => {
      setProjectMemory((current) => ({ ...current, [field]: value }));
    },
    []
  );

  const setAutosaveCards = useCallback((value: boolean) => {
    setProjectMemory((current) => ({
      ...current,
      autosaveCards: value,
    }));
  }, []);

  const setAutosaveTranscript = useCallback((value: boolean) => {
    setProjectMemory((current) => ({
      ...current,
      autosaveTranscript: value,
    }));
  }, []);

  return {
    projectMemory,
    updateProjectMemory,
    setAutosaveCards,
    setAutosaveTranscript,
  } as const;
}

/* ── Build a public (safe-to-send) version of project memory ── */
export function buildPublicProjectMemory(
  memory: ProjectMemoryState,
  attachments: MemoryAttachment[]
) {
  return {
    projectName: memory.projectName,
    ownerContext: memory.ownerContext,
    audience: memory.audience,
    preferredTools: memory.preferredTools,
    dataPolicy: memory.dataPolicy,
    storageNotes: memory.storageNotes,
    attachedMemory: summarizeAttachedMemory(attachments),
  };
}

function summarizeAttachedMemory(attachments: MemoryAttachment[]) {
  if (attachments.length === 0) return "";

  return attachments
    .slice(0, 12)
    .map((attachment) => {
      const preview = attachment.preview
        ? ` Preview: ${attachment.preview.replace(/\s+/g, " ").slice(0, 360)}`
        : " Metadata only.";
      return `- ${attachment.relativePath} (${formatBytes(attachment.size)}).${preview}`;
    })
    .join("\n");
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024)
    return `${Math.round(value / 102.4) / 10} KB`;
  return `${Math.round(value / 1024 / 102.4) / 10} MB`;
}
