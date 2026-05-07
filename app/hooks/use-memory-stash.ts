"use client";

import { useCallback, useEffect, useState } from "react";

import type { MemoryAttachment } from "@/lib/memory-stash";

const TEXT_MEMORY_EXTENSIONS = new Set([
  "csv", "json", "log", "md", "mdx", "txt", "ts", "tsx", "js", "jsx",
  "css", "html", "xml", "yaml", "yml", "toml", "env", "py", "rb", "go",
  "rs", "java", "php", "sql", "sh",
]);

const MAX_MEMORY_FILES_PER_PICK = 40;
const MAX_MEMORY_TOTAL_PREVIEW_CHARS = 90_000;

export type FolderInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  directory?: string;
  webkitdirectory?: string;
};

export function useMemoryStash(deps: {
  projectId: string;
  onStorageStatusUpdate?: (status: unknown) => void;
}) {
  const { projectId, onStorageStatusUpdate } = deps;

  const [memoryAttachments, setMemoryAttachments] = useState<
    MemoryAttachment[]
  >([]);
  const [memoryStashMessage, setMemoryStashMessage] = useState("");
  const [memoryStashLoading, setMemoryStashLoading] = useState(false);

  /* ── fetch stash on project change ── */
  useEffect(() => {
    let alive = true;
    const encodedId = encodeURIComponent(projectId || "default");

    fetch(`/api/memory/stash?projectId=${encodedId}`)
      .then((r) => r.json())
      .then((payload) => {
        if (alive && Array.isArray(payload?.attachments)) {
          setMemoryAttachments(
            payload.attachments as MemoryAttachment[]
          );
        }
      })
      .catch(() => {
        if (alive) setMemoryAttachments([]);
      });

    return () => {
      alive = false;
    };
  }, [projectId]);

  /* ── stash files ── */
  const stashMemoryFiles = useCallback(
    async (files: FileList) => {
      setMemoryStashLoading(true);
      setMemoryStashMessage("");

      try {
        const attachments = await createMemoryAttachments(files);
        if (attachments.length === 0) {
          setMemoryStashMessage("No files were selected.");
          return;
        }

        const response = await fetch("/api/memory/stash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            mode: "append",
            attachments,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.error ?? "Memory stash failed."
          );
        }

        if (Array.isArray(payload?.status?.attachments)) {
          setMemoryAttachments(
            payload.status.attachments as MemoryAttachment[]
          );
        }
        if (payload?.storage?.status) {
          onStorageStatusUpdate?.(payload.storage.status);
        }
        setMemoryStashMessage(
          `${attachments.length} file${attachments.length === 1 ? "" : "s"} stashed as agent memory.`
        );
      } catch (error) {
        setMemoryStashMessage(
          error instanceof Error
            ? error.message
            : "Memory stash failed."
        );
      } finally {
        setMemoryStashLoading(false);
      }
    },
    [projectId, onStorageStatusUpdate]
  );

  /* ── clear stash ── */
  const clearMemoryStash = useCallback(async () => {
    setMemoryStashLoading(true);
    setMemoryStashMessage("");

    try {
      const response = await fetch("/api/memory/stash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          mode: "clear",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Could not clear memory stash."
        );
      }

      setMemoryAttachments([]);
      if (payload?.storage?.status) {
        onStorageStatusUpdate?.(payload.storage.status);
      }
      setMemoryStashMessage("Memory stash cleared.");
    } catch (error) {
      setMemoryStashMessage(
        error instanceof Error
          ? error.message
          : "Could not clear memory stash."
      );
    } finally {
      setMemoryStashLoading(false);
    }
  }, [projectId, onStorageStatusUpdate]);

  /* ── handle file input ── */
  const handleMemoryFilesPicked = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.currentTarget.files;
      event.currentTarget.value = "";
      if (!files?.length) return;
      await stashMemoryFiles(files);
    },
    [stashMemoryFiles]
  );

  return {
    memoryAttachments,
    memoryStashMessage,
    memoryStashLoading,
    handleMemoryFilesPicked,
    clearMemoryStash,
  } as const;
}

/* ── Helpers ── */

async function createMemoryAttachments(
  files: FileList
): Promise<MemoryAttachment[]> {
  const selectedFiles = Array.from(files).slice(
    0,
    MAX_MEMORY_FILES_PER_PICK
  );
  const attachments: MemoryAttachment[] = [];
  let previewBudget = MAX_MEMORY_TOTAL_PREVIEW_CHARS;

  for (const [index, file] of selectedFiles.entries()) {
    const relativePath =
      (file as File & { webkitRelativePath?: string })
        .webkitRelativePath || file.name;
    let preview = "";

    if (previewBudget > 0 && isReadableMemoryFile(file)) {
      const text = await file.text().catch(() => "");
      preview = text.slice(0, Math.min(12_000, previewBudget));
      previewBudget -= preview.length;
    }

    attachments.push({
      id: `memory-${Date.now()}-${index}-${slugify(relativePath)}`,
      name: file.name,
      relativePath,
      mimeType: file.type || "unknown",
      size: file.size,
      modifiedAt: file.lastModified,
      preview,
      createdAt: new Date().toISOString(),
    });
  }

  return attachments;
}

function isReadableMemoryFile(file: File) {
  if (file.size > 1_500_000) return false;
  if (file.type.startsWith("text/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_MEMORY_EXTENSIONS.has(extension);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
