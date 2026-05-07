"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type ModelRoute = {
  id: string;
  label: string;
  configured: boolean;
  model: string;
  endpoint: string;
  mode: "responses" | "chat";
  accent: string;
  capabilities: string[];
};

export type RuntimeConfigStatus = {
  keySetupEnabled: boolean;
  filePath: string;
  providers: Record<
    string,
    {
      configured: boolean;
      keyConfigured: boolean;
      source: "runtime" | "env" | "none";
      redacted: string;
      model: string;
      endpoint?: string;
      transcribeModel?: string;
      realtimeModel?: string;
      translationModel?: string;
    }
  >;
};

const FALLBACK_ROUTE: ModelRoute = {
  id: "openai",
  label: "OpenAI Responses",
  configured: false,
  model: "gpt-4o",
  endpoint: "https://api.openai.com/v1/responses",
  mode: "responses",
  accent: "#7fb8d8",
  capabilities: ["web search", "schema cards"],
};

export function useModelRouter() {
  const [modelRoutes, setModelRoutes] = useState<ModelRoute[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [modelOverride, setModelOverride] = useState("");
  const [runtimeConfigStatus, setRuntimeConfigStatus] =
    useState<RuntimeConfigStatus | null>(null);

  /* ── key setup state ── */
  const [keySetupApiKey, setKeySetupApiKey] = useState("");
  const [keySetupBaseUrl, setKeySetupBaseUrl] = useState("");
  const [keySetupMessage, setKeySetupMessage] = useState("");
  const [keySetupSaving, setKeySetupSaving] = useState(false);

  const selectedRoute = useMemo<ModelRoute>(() => {
    return (
      modelRoutes.find((r) => r.id === selectedProvider) ??
      modelRoutes[0] ??
      FALLBACK_ROUTE
    );
  }, [modelRoutes, selectedProvider]);

  const activeModel = modelOverride.trim() || selectedRoute.model;

  const selectedRuntimeProvider =
    runtimeConfigStatus?.providers[selectedProvider];

  /* ── fetch model routes on mount ── */
  useEffect(() => {
    let alive = true;

    fetch("/api/model-router")
      .then((r) => r.json())
      .then((payload) => {
        if (!alive || !Array.isArray(payload?.providers)) return;

        const providers = payload.providers as ModelRoute[];
        const savedProvider = window.localStorage.getItem(
          "twist-sidebar-provider"
        );
        const nextProvider =
          providers.find((p) => p.id === savedProvider)?.id ??
          payload.defaultProvider ??
          providers[0]?.id ??
          "openai";
        const nextRoute = providers.find((p) => p.id === nextProvider);
        const savedModel = window.localStorage.getItem(
          `twist-sidebar-model-${nextProvider}`
        );

        setModelRoutes(providers);
        setSelectedProvider(nextProvider);
        setModelOverride(savedModel || nextRoute?.model || "");
      })
      .catch(() => setModelRoutes([]));

    return () => {
      alive = false;
    };
  }, []);

  /* ── fetch runtime config on mount ── */
  useEffect(() => {
    let alive = true;

    fetch("/api/runtime-config")
      .then((r) => r.json())
      .then((payload) => {
        if (alive && payload?.providers) {
          setRuntimeConfigStatus(payload as RuntimeConfigStatus);
        }
      })
      .catch(() => setRuntimeConfigStatus(null));

    return () => {
      alive = false;
    };
  }, []);

  /* ── persist provider/model selection ── */
  useEffect(() => {
    window.localStorage.setItem("twist-sidebar-provider", selectedProvider);
    if (modelOverride.trim()) {
      window.localStorage.setItem(
        `twist-sidebar-model-${selectedProvider}`,
        modelOverride.trim()
      );
    }
  }, [modelOverride, selectedProvider]);

  /* ── switch provider ── */
  const switchProvider = useCallback(
    (route: ModelRoute) => {
      setSelectedProvider(route.id);
      setModelOverride(
        window.localStorage.getItem(`twist-sidebar-model-${route.id}`) ||
          route.model
      );
    },
    []
  );

  /* ── save key ── */
  const saveRuntimeKeySetup = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!keySetupApiKey.trim() && selectedProvider !== "custom") {
        setKeySetupMessage("Paste an API key first.");
        return;
      }

      if (
        selectedProvider === "custom" &&
        !keySetupApiKey.trim() &&
        !keySetupBaseUrl.trim()
      ) {
        setKeySetupMessage(
          "Paste an API key or custom gateway URL first."
        );
        return;
      }

      setKeySetupSaving(true);
      setKeySetupMessage("");

      try {
        const response = await fetch("/api/runtime-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedProvider,
            apiKey: keySetupApiKey,
            baseUrl: keySetupBaseUrl,
            model: activeModel,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error ?? "Key setup failed.");
        }

        if (payload?.status) {
          setRuntimeConfigStatus(
            payload.status as RuntimeConfigStatus
          );
        }

        const routerPayload = await fetch("/api/model-router").then(
          (r) => r.json()
        );
        if (Array.isArray(routerPayload?.providers)) {
          setModelRoutes(routerPayload.providers as ModelRoute[]);
        }

        setKeySetupApiKey("");
        setKeySetupMessage(
          "Saved. You can press Start or run live AI now."
        );
      } catch (error) {
        setKeySetupMessage(
          error instanceof Error ? error.message : "Key setup failed."
        );
      } finally {
        setKeySetupSaving(false);
      }
    },
    [activeModel, keySetupApiKey, keySetupBaseUrl, selectedProvider]
  );

  /* ── clear key ── */
  const clearRuntimeKeySetup = useCallback(async () => {
    setKeySetupSaving(true);
    setKeySetupMessage("");

    try {
      const response = await fetch("/api/runtime-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          clear: true,
          model: activeModel,
          baseUrl: keySetupBaseUrl,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Could not clear the key."
        );
      }

      if (payload?.status) {
        setRuntimeConfigStatus(
          payload.status as RuntimeConfigStatus
        );
      }

      const routerPayload = await fetch("/api/model-router").then(
        (r) => r.json()
      );
      if (Array.isArray(routerPayload?.providers)) {
        setModelRoutes(routerPayload.providers as ModelRoute[]);
      }

      setKeySetupApiKey("");
      setKeySetupMessage("Runtime key cleared for this provider.");
    } catch (error) {
      setKeySetupMessage(
        error instanceof Error
          ? error.message
          : "Could not clear the key."
      );
    } finally {
      setKeySetupSaving(false);
    }
  }, [activeModel, keySetupBaseUrl, selectedProvider]);

  return {
    modelRoutes,
    selectedProvider,
    selectedRoute,
    activeModel,
    modelOverride,
    setModelOverride,
    runtimeConfigStatus,
    selectedRuntimeProvider,
    switchProvider,
    // key setup
    keySetupApiKey,
    setKeySetupApiKey,
    keySetupBaseUrl,
    setKeySetupBaseUrl,
    keySetupMessage,
    keySetupSaving,
    saveRuntimeKeySetup,
    clearRuntimeKeySetup,
  } as const;
}
