"use client";

import {
  Activity,
  Bell,
  Bot,
  Captions,
  CircleStop,
  Clapperboard,
  Cloud,
  Database,
  Eraser,
  Eye,
  FileJson,
  FileText,
  FolderOpen,
  Gauge,
  GlassWater,
  HardDrive,
  Info,
  Mic,
  Moon,
  MonitorUp,
  NotebookPen,
  PanelRightOpen,
  Play,
  Radio,
  RotateCcw,
  Scissors,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ClipHandoffManifest, ClipSuggestion } from "@/lib/clips";
import type { MemoryAttachment } from "@/lib/memory-stash";
import { PERSONAS, PersonaCard, PersonaId, getPersona } from "@/lib/personas";

import { ErrorBoundary } from "@/app/components/error-boundary";
import { PersonaAvatar, PersonaIcon, FlowIcon, GlassNotification } from "@/app/components/shared";
import type { FlowStepId } from "@/app/components/shared";
import { formatTime, formatBytes } from "@/app/utils/format";

import {
  useTheme,
  useAudioCapture,
  useRealtimeTranscription,
  useModelRouter,
  usePromptStudio,
  useProjectMemory,
  useMemoryStash,
  useStorageSync,
  useClipStudio,
  useStreamRecorder,
  STATUS_COPY,
  PROMPT_PRESETS,
  buildPublicProjectMemory,
  createDefaultPromptStudio,
  createDefaultProjectMemory,
  extractClientSecret,
  getEventItemId,
  getPreviousItemId,
  orderTranscript,
  waitForIceGathering,
} from "@/app/hooks";

import { OPENAI_REALTIME_DEFAULTS } from "@/lib/realtime-models";

import type {
  FolderInputProps,
  CaptureMode,
  ThemeMode,
  RuntimeStatus,
  TranscriptTurn,
  ModelRoute,
  PromptStudioState,
  ProjectMemoryState,
  StorageStatus,
  RuntimeConfigStatus,
} from "@/app/hooks";

const LEGACY_OPENAI_PERSONA_MODEL = ["gpt", "5.5"].join("-");

type ViewMode = "enhanced" | "regular";
type CaptureErrorKind = "permission" | "no-audio" | "unsupported" | "generic";

type CaptureErrorCopy = {
  kind: CaptureErrorKind;
  message: string;
};

type MixedCapture = {
  context: AudioContext;
  inputStreams: MediaStream[];
};

type CaptureStreamResult = {
  stream: MediaStream;
  mix?: MixedCapture;
};

function getTabCaptureStream() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new DOMException(
      "Screen or tab capture is not available in this browser.",
      "NotFoundError"
    );
  }

  return navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
}

function getMicCaptureStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
}

async function getCaptureStream(mode: CaptureMode): Promise<CaptureStreamResult> {
  if (mode === "mic") {
    return { stream: await getMicCaptureStream() };
  }

  if (mode === "tab") {
    return { stream: await getTabCaptureStream() };
  }

  const tabStream = await getTabCaptureStream();
  if (tabStream.getAudioTracks().length === 0) {
    tabStream.getTracks().forEach((track) => track.stop());
    throw new Error("No audio track was shared. Choose a browser tab and enable tab audio.");
  }

  let micStream: MediaStream | null = null;
  let context: AudioContext | null = null;

  try {
    micStream = await getMicCaptureStream();
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("This browser cannot mix tab audio and microphone audio.");
    }

    context = new AudioContextCtor({ latencyHint: "interactive" });
    const destination = context.createMediaStreamDestination();
    const tabSource = context.createMediaStreamSource(new MediaStream(tabStream.getAudioTracks()));
    const micSource = context.createMediaStreamSource(new MediaStream(micStream.getAudioTracks()));
    const tabGain = context.createGain();
    const micGain = context.createGain();
    tabGain.gain.value = 1;
    micGain.gain.value = 0.92;
    tabSource.connect(tabGain).connect(destination);
    micSource.connect(micGain).connect(destination);
    await context.resume().catch(() => {});

    const mixedStream = new MediaStream([
      ...destination.stream.getAudioTracks(),
      ...tabStream.getVideoTracks()
    ]);

    return {
      stream: mixedStream,
      mix: {
        context,
        inputStreams: [tabStream, micStream]
      }
    };
  } catch (error) {
    tabStream.getTracks().forEach((track) => track.stop());
    micStream?.getTracks().forEach((track) => track.stop());
    void context?.close();
    throw error;
  }
}

function normalizeCaptureError(error: unknown, mode: CaptureMode): CaptureErrorCopy {
  const errorName =
    error && typeof error === "object" && "name" in error ? String(error.name) : "";
  const rawMessage = error instanceof Error ? error.message : "";
  const lowerMessage = rawMessage.toLowerCase();

  if (
    errorName === "NotAllowedError" ||
    errorName === "SecurityError" ||
    lowerMessage.includes("permission") ||
    lowerMessage.includes("denied")
  ) {
    return {
      kind: "permission",
      message:
        mode === "mic"
          ? "Microphone permission is blocked for this browser/site. macOS can be allowed while the local page still needs a fresh browser permission grant."
          : mode === "both"
            ? "Dual capture was blocked. The app needs permission for the show tab first, then the microphone."
          : "Tab capture was blocked. Press Start again and choose a browser tab with audio enabled."
    };
  }

  if (errorName === "NotFoundError" || lowerMessage.includes("requested device not found")) {
    return {
      kind: "unsupported",
      message:
        mode === "mic"
          ? "No microphone device is available to this browser."
          : "This browser cannot expose tab or screen capture here. Open http://127.0.0.1:3000 in Chrome, Brave, or Safari for tab audio, or use Mic/Sample in this browser."
    };
  }

  if (lowerMessage.includes("no audio track")) {
    return {
      kind: "no-audio",
      message: "No audio track was shared. Choose a browser tab and enable tab audio."
    };
  }

  return {
    kind: "generic",
    message: rawMessage || "Unable to start live capture. Check browser permissions."
  };
}

function mergePromptStudio(value: unknown): PromptStudioState {
  const defaults = createDefaultPromptStudio();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<PromptStudioState>;
  return {
    showContext: typeof raw.showContext === "string" ? raw.showContext : defaults.showContext,
    directive: typeof raw.directive === "string" ? raw.directive : defaults.directive,
    tone: typeof raw.tone === "string" ? raw.tone : defaults.tone,
    guardrails: typeof raw.guardrails === "string" ? raw.guardrails : defaults.guardrails,
    personaPrompts: {
      ...defaults.personaPrompts,
      ...(raw.personaPrompts && typeof raw.personaPrompts === "object" ? raw.personaPrompts : {}),
    },
  };
}

function mergeProjectMemory(value: unknown): ProjectMemoryState {
  const defaults = createDefaultProjectMemory();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<ProjectMemoryState>;
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")),
    autosaveCards: typeof raw.autosaveCards === "boolean" ? raw.autosaveCards : defaults.autosaveCards,
    autosaveTranscript: typeof raw.autosaveTranscript === "boolean" ? raw.autosaveTranscript : defaults.autosaveTranscript,
  };
}

function normalizeSelectedModel(provider: string, value: string, fallback = "") {
  const model = value.trim();
  if (!model) {
    return fallback;
  }

  if (provider === "openai" && model.toLowerCase() === LEGACY_OPENAI_PERSONA_MODEL) {
    return fallback && fallback.toLowerCase() !== LEGACY_OPENAI_PERSONA_MODEL ? fallback : "gpt-4o";
  }

  return model;
}

const TEXT_MEMORY_EXTENSIONS = new Set([
  "csv","json","log","md","mdx","txt","ts","tsx","js","jsx","css","html","xml","yaml","yml","toml","env","py","rb","go","rs","java","php","sql","sh",
]);

async function createMemoryAttachments(files: FileList): Promise<MemoryAttachment[]> {
  const selected = Array.from(files).slice(0, 40);
  const attachments: MemoryAttachment[] = [];
  let budget = 90_000;
  for (const [i, file] of selected.entries()) {
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    let preview = "";
    const isReadable = file.size <= 1_500_000 && (file.type.startsWith("text/") || TEXT_MEMORY_EXTENSIONS.has(file.name.split(".").pop()?.toLowerCase() ?? ""));
    if (budget > 0 && isReadable) {
      const text = await file.text().catch(() => "");
      preview = text.slice(0, Math.min(12_000, budget));
      budget -= preview.length;
    }
    attachments.push({
      id: `memory-${Date.now()}-${i}-${file.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
      name: file.name, relativePath: relPath, mimeType: file.type || "unknown",
      size: file.size, modifiedAt: file.lastModified, preview, createdAt: new Date().toISOString(),
    });
  }
  return attachments;
}

function summarizeAttachedMemory(attachments: MemoryAttachment[]) {
  if (attachments.length === 0) return "";
  return attachments.slice(0, 12).map((a) => {
    const p = a.preview ? ` Preview: ${a.preview.replace(/\s+/g, " ").slice(0, 360)}` : " Metadata only.";
    return `- ${a.relativePath} (${formatBytes(a.size)}).${p}`;
  }).join("\n");
}

const SAMPLE_SHOW = {
  title: "The $60 billion resource hiding in space, and the startup trying to mine it | E2268",
  host: "This Week in Startups",
  episode: "TWiST E2268 at 56:59",
  url: "https://www.youtube.com/watch?v=TN2RmNuX4-k&t=3419s",
  timestamp: "56:59"
};

const SAMPLE_LINES = [
  "TWiST E2268 sample: the hosts discuss Open Granola and the idea of real-time feedback that surfaces useful startup resources during an active conversation.",
  "Jason asks to see the GitHub project in action, noting that the open-source app is getting close to 2,000 stars, uses an MIT license, and already has community forks.",
  "The demo setup mentions fast local transcription with Parakeet, OpenRouter for LLM routing, local options like Ollama or MLX, embeddings, and an insights panel that reacts while people talk."
];

const MIN_PERSONA_ANALYSIS_CHARS = 24;

function buildTranscriptWindow(turns: TranscriptTurn[]) {
  return turns
    .filter((turn) => turn.final && turn.text.trim())
    .slice(-6)
    .map((turn) => turn.text.trim())
    .join("\n");
}

function buildNextTranscriptWindow(
  currentTurns: TranscriptTurn[],
  nextTurn: Omit<TranscriptTurn, "createdAt">
) {
  const now = new Date().toISOString();
  const merged = [
    ...currentTurns.filter((turn) => turn.id !== nextTurn.id),
    { ...nextTurn, createdAt: now }
  ];

  return buildTranscriptWindow(orderTranscript(merged).slice(-24));
}

const AGENT_FLOW_STEPS = [
  { id: "listen", label: "Listen", detail: "audio stream" },
  { id: "transcribe", label: "Transcribe", detail: "rolling memory" },
  { id: "route", label: "Route", detail: "model + prompts" },
  { id: "reason", label: "Reason", detail: "persona workers" },
  { id: "publish", label: "Publish", detail: "glass cards" },
  { id: "clip", label: "Clip", detail: "render props" },
  { id: "store", label: "Store", detail: "your cloud" }
] as const;


export default function Home() {
  const [captureMode, setCaptureMode] = useState<CaptureMode>("tab");
  const [viewMode, setViewMode] = useState<ViewMode>("enhanced");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [simpleMode, setSimpleMode] = useState(true);
  const [glassFlowMode, setGlassFlowMode] = useState(true);
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [promptPanelOpen, setPromptPanelOpen] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [clipPanelOpen, setClipPanelOpen] = useState(false);
  const [agentBriefOpen, setAgentBriefOpen] = useState(false);
  const [agentBrief, setAgentBrief] = useState<Record<string, unknown> | null>(null);
  const [agentBriefLoading, setAgentBriefLoading] = useState(false);
  const [agentBriefMessage, setAgentBriefMessage] = useState("");
  const [promptStudio, setPromptStudio] = useState<PromptStudioState>(() =>
    createDefaultPromptStudio()
  );
  const [projectMemory, setProjectMemory] = useState<ProjectMemoryState>(() =>
    createDefaultProjectMemory()
  );
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({
    provider: "none",
    configured: false,
    destination: "not configured",
    secureByDefault: true,
    capabilities: ["demo mode"]
  });
  const [storageMessage, setStorageMessage] = useState("");
  const [runtimeConfigStatus, setRuntimeConfigStatus] = useState<RuntimeConfigStatus | null>(null);
  const [modelRoutes, setModelRoutes] = useState<ModelRoute[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [modelOverride, setModelOverride] = useState("");
  const [keySetupApiKey, setKeySetupApiKey] = useState("");
  const [keySetupBaseUrl, setKeySetupBaseUrl] = useState("");
  const [keySetupTranscribeModel, setKeySetupTranscribeModel] = useState<string>(
    OPENAI_REALTIME_DEFAULTS.transcribeModel
  );
  const [keySetupRealtimeModel, setKeySetupRealtimeModel] = useState<string>(
    OPENAI_REALTIME_DEFAULTS.realtimeModel
  );
  const [keySetupTranslationModel, setKeySetupTranslationModel] = useState<string>(
    OPENAI_REALTIME_DEFAULTS.translationModel
  );
  const [keySetupMessage, setKeySetupMessage] = useState("");
  const [keySetupSaving, setKeySetupSaving] = useState(false);
  const [status, setStatus] = useState<RuntimeStatus>("idle");
  const [speechActive, setSpeechActive] = useState(false);
  const [aiMuted, setAiMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [captureErrorKind, setCaptureErrorKind] = useState<CaptureErrorKind | null>(null);
  const [transcriptTurns, setTranscriptTurns] = useState<TranscriptTurn[]>([]);
  const [personaCards, setPersonaCards] = useState<PersonaCard[]>([]);
  const [activePersonaIds, setActivePersonaIds] = useState<PersonaId[]>(
    PERSONAS.map((persona) => persona.id)
  );
  const [speakingPersonaIds, setSpeakingPersonaIds] = useState<Set<PersonaId>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [clipSuggestions, setClipSuggestions] = useState<ClipSuggestion[]>([]);
  const [clipLoading, setClipLoading] = useState(false);
  const [clipMessage, setClipMessage] = useState("");
  const [handoffManifest, setHandoffManifest] = useState<ClipHandoffManifest | null>(null);
  const [memoryAttachments, setMemoryAttachments] = useState<MemoryAttachment[]>([]);
  const [memoryStashMessage, setMemoryStashMessage] = useState("");
  const [memoryStashLoading, setMemoryStashLoading] = useState(false);
  const {
    recordingKind,
    error: recordingError,
    startShow: startShowRecording,
    startEnhanced: startEnhancedRecording,
    stop: stopRecording,
    isRecording
  } = useStreamRecorder();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileStashInputRef = useRef<HTMLInputElement | null>(null);
  const folderStashInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const captureMixRef = useRef<MixedCapture | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyzeTimerRef = useRef<number | null>(null);
  const analyzeTranscriptRef = useRef<(windowText: string) => void>(() => {});
  const pendingAnalysisRef = useRef("");
  const transcriptTurnsRef = useRef<TranscriptTurn[]>([]);
  const aiMutedRef = useRef(false);
  const lastAnalyzedRef = useRef("");
  const lastAnalyzedAtRef = useRef(0);
  const analyzingRef = useRef(false);
  const sampleIndexRef = useRef(0);

  const hasFinalTranscript = transcriptTurns.some(
    (turn) => turn.final && turn.text.trim().length > 0
  );

  const latestCardsByPersona = useMemo(() => {
    const map = new Map<PersonaId, PersonaCard>();
    for (const card of personaCards) {
      if (!map.has(card.persona)) {
        map.set(card.persona, card);
      }
    }
    return map;
  }, [personaCards]);

  const latestNotificationCards = useMemo(() => personaCards.slice(0, 3), [personaCards]);

  const selectedRoute = useMemo<ModelRoute>(() => {
    return (
      modelRoutes.find((route) => route.id === selectedProvider) ??
      modelRoutes[0] ?? {
        id: "openai",
        label: "OpenAI Responses",
        configured: false,
        model: "gpt-4o",
        endpoint: "https://api.openai.com/v1/responses",
        mode: "responses",
        accent: "#7fb8d8",
        capabilities: ["web search", "schema cards"]
      }
    );
  }, [modelRoutes, selectedProvider]);

  const activeModel = normalizeSelectedModel(
    selectedProvider,
    modelOverride.trim() || selectedRoute.model,
    selectedRoute.model
  );
  const selectedRuntimeProvider = runtimeConfigStatus?.providers[selectedProvider];

  const agentFlowState = useMemo(() => {
    return {
      listen: status === "listening" || status === "connecting" || status === "reconnecting",
      transcribe: speechActive || transcriptTurns.length > 0,
      route: analyzing || Boolean(activeModel),
      reason: analyzing || speakingPersonaIds.size > 0,
      publish: personaCards.length > 0,
      clip: clipLoading || clipSuggestions.length > 0,
      store:
        storageStatus.configured ||
        projectMemory.autosaveCards ||
        projectMemory.autosaveTranscript ||
        memoryAttachments.length > 0
    };
  }, [
    activeModel,
    analyzing,
    clipLoading,
    clipSuggestions.length,
    memoryAttachments.length,
    personaCards.length,
    projectMemory.autosaveCards,
    projectMemory.autosaveTranscript,
    speechActive,
    speakingPersonaIds.size,
    status,
    storageStatus.configured,
    transcriptTurns.length
  ]);

  const transcriptWindow = useMemo(() => buildTranscriptWindow(transcriptTurns), [transcriptTurns]);

  useEffect(() => {
    transcriptTurnsRef.current = transcriptTurns;
  }, [transcriptTurns]);

  useEffect(() => {
    aiMutedRef.current = aiMuted;
  }, [aiMuted]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("twist-sidebar-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setThemeMode(savedTheme);
    }

    const savedGlassMode = window.localStorage.getItem("twist-sidebar-glass-flow");
    if (savedGlassMode === "on" || savedGlassMode === "off") {
      setGlassFlowMode(savedGlassMode === "on");
    }

    const savedSimpleMode = window.localStorage.getItem("twist-sidebar-simple-mode");
    if (savedSimpleMode === "on" || savedSimpleMode === "off") {
      setSimpleMode(savedSimpleMode === "on");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("twist-sidebar-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.glassFlow = glassFlowMode ? "on" : "off";
    window.localStorage.setItem("twist-sidebar-glass-flow", glassFlowMode ? "on" : "off");
  }, [glassFlowMode]);

  useEffect(() => {
    document.documentElement.dataset.simpleMode = simpleMode ? "on" : "off";
    window.localStorage.setItem("twist-sidebar-simple-mode", simpleMode ? "on" : "off");
  }, [simpleMode]);

  useEffect(() => {
    const savedPromptStudio = window.localStorage.getItem("twist-sidebar-prompt-studio");
    if (!savedPromptStudio) {
      return;
    }

    try {
      setPromptStudio(mergePromptStudio(JSON.parse(savedPromptStudio)));
    } catch {
      setPromptStudio(createDefaultPromptStudio());
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "twist-sidebar-prompt-studio",
      JSON.stringify(promptStudio)
    );
  }, [promptStudio]);

  useEffect(() => {
    const savedProjectMemory = window.localStorage.getItem("twist-sidebar-project-memory");
    if (!savedProjectMemory) {
      return;
    }

    try {
      setProjectMemory(mergeProjectMemory(JSON.parse(savedProjectMemory)));
    } catch {
      setProjectMemory(createDefaultProjectMemory());
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "twist-sidebar-project-memory",
      JSON.stringify(projectMemory)
    );
  }, [projectMemory]);

  useEffect(() => {
    let alive = true;
    const projectId = encodeURIComponent(projectMemory.projectId || "default");

    fetch(`/api/memory/stash?projectId=${projectId}`)
      .then((response) => response.json())
      .then((payload) => {
        if (alive && Array.isArray(payload?.attachments)) {
          setMemoryAttachments(payload.attachments as MemoryAttachment[]);
        }
      })
      .catch(() => {
        if (alive) {
          setMemoryAttachments([]);
        }
      });

    return () => {
      alive = false;
    };
  }, [projectMemory.projectId]);

  useEffect(() => {
    let alive = true;
    fetch("/api/storage/status")
      .then((response) => response.json())
      .then((payload) => {
        if (alive && payload?.provider) {
          setStorageStatus(payload as StorageStatus);
        }
      })
      .catch(() => {
        setStorageStatus((current) => ({ ...current, configured: false }));
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/runtime-config")
      .then((response) => response.json())
      .then((payload) => {
        if (alive && payload?.providers) {
          setRuntimeConfigStatus(payload as RuntimeConfigStatus);
          const openai = (payload as RuntimeConfigStatus).providers.openai;
          setKeySetupTranscribeModel(
            openai?.transcribeModel || OPENAI_REALTIME_DEFAULTS.transcribeModel
          );
          setKeySetupRealtimeModel(
            openai?.realtimeModel || OPENAI_REALTIME_DEFAULTS.realtimeModel
          );
          setKeySetupTranslationModel(
            openai?.translationModel || OPENAI_REALTIME_DEFAULTS.translationModel
          );
        }
      })
      .catch(() => {
        setRuntimeConfigStatus(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    fetch("/api/model-router")
      .then((response) => response.json())
      .then((payload) => {
        if (!alive || !Array.isArray(payload?.providers)) {
          return;
        }

        const providers = payload.providers as ModelRoute[];
        const savedProvider = window.localStorage.getItem("twist-sidebar-provider");
        const nextProvider =
          providers.find((provider) => provider.id === savedProvider)?.id ??
          payload.defaultProvider ??
          providers[0]?.id ??
          "openai";
        const nextRoute = providers.find((provider) => provider.id === nextProvider);
        const savedModel = window.localStorage.getItem(`twist-sidebar-model-${nextProvider}`);
        const normalizedModel = normalizeSelectedModel(
          nextProvider,
          savedModel || "",
          nextRoute?.model || ""
        );
        if (savedModel && normalizedModel !== savedModel) {
          window.localStorage.setItem(`twist-sidebar-model-${nextProvider}`, normalizedModel);
        }

        setModelRoutes(providers);
        setSelectedProvider(nextProvider);
        setModelOverride(normalizedModel || nextRoute?.model || "");
      })
      .catch(() => {
        setModelRoutes([]);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("twist-sidebar-provider", selectedProvider);
    const normalizedModel = normalizeSelectedModel(selectedProvider, modelOverride, "");
    if (normalizedModel) {
      window.localStorage.setItem(`twist-sidebar-model-${selectedProvider}`, normalizedModel);
    }
  }, [modelOverride, selectedProvider]);

  const analyzeTranscript = useCallback(
    async (windowText: string) => {
      const trimmed = windowText.trim();
      if (!trimmed || aiMuted || activePersonaIds.length === 0) {
        return;
      }

      if (analyzingRef.current) {
        pendingAnalysisRef.current = trimmed;
        return;
      }

      analyzingRef.current = true;
      setAnalyzing(true);
      setErrorMessage("");
      setSpeakingPersonaIds(new Set(activePersonaIds));

      try {
        const isSampleWindow = trimmed.includes("TWiST E2268 sample");
        const response = await fetch("/api/personas/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            transcriptWindow: trimmed,
            activePersonas: activePersonaIds,
            modelRouter: {
              provider: selectedProvider,
              model: activeModel
            },
            promptStudio,
            projectMemory: buildPublicProjectMemory(projectMemory, memoryAttachments),
            showMetadata: {
              title: isSampleWindow ? SAMPLE_SHOW.title : "Live podcast demo",
              host: isSampleWindow ? SAMPLE_SHOW.host : "Captured browser audio",
              episode: isSampleWindow ? SAMPLE_SHOW.episode : promptStudio.showContext,
              url: isSampleWindow ? SAMPLE_SHOW.url : undefined,
              timestamp: isSampleWindow ? SAMPLE_SHOW.timestamp : undefined
            }
          })
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error ?? "Persona analysis failed.");
        }

        const cards = Array.isArray(payload?.cards)
          ? (payload.cards as PersonaCard[])
          : [];

        if (cards.length === 0) {
          setErrorMessage(
            payload?.fallbackReason ??
              "No persona cards came back for that transcript yet; listening for the next turn."
          );
          return;
        }

        setPersonaCards((current) => [...cards, ...current].slice(0, 36));
        setSpeakingPersonaIds(new Set(cards.map((card) => card.persona)));
        if (projectMemory.autosaveCards) {
          void saveStorageEvent("persona_cards", {
            cards,
            modelRouter: payload?.modelRouter,
            projectMemory: buildPublicProjectMemory(projectMemory, memoryAttachments),
            transcriptWindow: trimmed
          });
        }

        lastAnalyzedRef.current = trimmed;
        lastAnalyzedAtRef.current = Date.now();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Persona analysis failed.");
      } finally {
        const pending = pendingAnalysisRef.current;
        pendingAnalysisRef.current = "";
        analyzingRef.current = false;
        setAnalyzing(false);
        window.setTimeout(() => setSpeakingPersonaIds(new Set()), 1800);

        if (pending && pending !== trimmed) {
          window.setTimeout(() => {
            void analyzeTranscriptRef.current(pending);
          }, 250);
        }
      }
    },
    [
      activeModel,
      activePersonaIds,
      aiMuted,
      memoryAttachments,
      projectMemory,
      promptStudio,
      selectedProvider
    ]
  );

  useEffect(() => {
    analyzeTranscriptRef.current = analyzeTranscript;
  }, [analyzeTranscript]);

  useEffect(() => {
    if (!transcriptWindow || transcriptWindow.trim().length < MIN_PERSONA_ANALYSIS_CHARS || aiMuted) {
      return;
    }

    if (transcriptWindow === lastAnalyzedRef.current) {
      return;
    }

    if (analyzeTimerRef.current) {
      window.clearTimeout(analyzeTimerRef.current);
    }

    const waitMs = Math.max(300, 1200 - (Date.now() - lastAnalyzedAtRef.current));
    analyzeTimerRef.current = window.setTimeout(() => {
      void analyzeTranscript(transcriptWindow);
    }, waitMs);

    return () => {
      if (analyzeTimerRef.current) {
        window.clearTimeout(analyzeTimerRef.current);
      }
    };
  }, [aiMuted, analyzeTranscript, transcriptWindow]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || stream.getVideoTracks().length === 0) {
      return;
    }

    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [status]);

  useEffect(() => {
    return () => {
      if (analyzeTimerRef.current) {
        window.clearTimeout(analyzeTimerRef.current);
      }
      channelRef.current?.close();
      peerRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopCaptureMix();
      stopMeter();
    };
  }, []);

  const startCapture = async () => {
    setStatus("connecting");
    setErrorMessage("");
    setCaptureErrorKind(null);

    const activateCapture = async (mode: CaptureMode) => {
      stopEverything("connecting");
      const capture = await getCaptureStream(mode);
      const stream = capture.stream;
      const audioTrack = stream.getAudioTracks()[0];

      if (!audioTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("No audio track was shared. Choose a browser tab and enable tab audio.");
      }

      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => stopEverything("stopped"), { once: true });
      });

      captureMixRef.current = capture.mix ?? null;
      capture.mix?.inputStreams.forEach((inputStream) => {
        inputStream.getTracks().forEach((track) => {
          track.addEventListener("ended", () => stopEverything("stopped"), { once: true });
        });
      });
      streamRef.current = stream;
      startMeter(stream);
      await connectRealtime(stream);
      setStatus("listening");
    };

    try {
      await activateCapture(captureMode);
    } catch (error) {
      const captureError = normalizeCaptureError(error, captureMode);
      const canFallbackToMic = captureMode !== "mic";

      if (canFallbackToMic) {
        try {
          setCaptureMode("mic");
          await activateCapture("mic");
          return;
        } catch (micError) {
          const micCaptureError = normalizeCaptureError(micError, "mic");
          if (micCaptureError.kind === "unsupported") {
            setCaptureMode("mic");
            stopEverything("stopped");
            setCaptureErrorKind(null);
            setErrorMessage("");
            addSampleTranscript();
            return;
          }

          stopEverything("error");
          setCaptureErrorKind(micCaptureError.kind);
          setErrorMessage(micCaptureError.message);
          return;
        }
      }

      stopEverything("error");
      setCaptureErrorKind(captureError.kind);
      setErrorMessage(captureError.message);
    }
  };

  const stopCapture = () => {
    stopRecording();
    stopEverything("stopped");
  };

  const clearTranscript = () => {
    setTranscriptTurns([]);
    setPersonaCards([]);
    setClipSuggestions([]);
    setHandoffManifest(null);
    setClipMessage("");
    setErrorMessage("");
    setCaptureErrorKind(null);
    lastAnalyzedRef.current = "";
  };

  const addSampleTranscript = () => {
    const text = SAMPLE_LINES[sampleIndexRef.current % SAMPLE_LINES.length];
    sampleIndexRef.current += 1;

    upsertTranscript({
      id: `sample-${Date.now()}`,
      previousId: transcriptTurns.at(-1)?.id ?? null,
      text,
      draft: "",
      final: true
    });

    window.setTimeout(() => {
      void analyzeTranscript([transcriptWindow, text].filter(Boolean).join("\n"));
    }, 150);
  };

  const togglePersona = (personaId: PersonaId) => {
    setActivePersonaIds((current) => {
      if (current.includes(personaId)) {
        return current.filter((id) => id !== personaId);
      }
      return [...current, personaId];
    });
  };

  const applyPromptPreset = (preset: (typeof PROMPT_PRESETS)[number]) => {
    setPromptStudio((current) => ({
      ...current,
      directive: preset.directive,
      tone: preset.tone,
      guardrails: preset.guardrails
    }));
  };

  const updatePromptStudio = (
    field: keyof Omit<PromptStudioState, "personaPrompts">,
    value: string
  ) => {
    setPromptStudio((current) => ({
      ...current,
      [field]: value
    }));
  };

  const updatePersonaPrompt = (personaId: PersonaId, value: string) => {
    setPromptStudio((current) => ({
      ...current,
      personaPrompts: {
        ...current.personaPrompts,
        [personaId]: value
      }
    }));
  };

  const updateProjectMemory = (
    field: keyof Omit<ProjectMemoryState, "autosaveCards" | "autosaveTranscript">,
    value: string
  ) => {
    setProjectMemory((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleMemoryFilesPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    event.currentTarget.value = "";
    if (!files?.length) {
      return;
    }

    await stashMemoryFiles(files);
  };

  const stashMemoryFiles = async (files: FileList) => {
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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: projectMemory.projectId,
          mode: "append",
          attachments
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Memory stash failed.");
      }

      if (Array.isArray(payload?.status?.attachments)) {
        setMemoryAttachments(payload.status.attachments as MemoryAttachment[]);
      }
      if (payload?.storage?.status) {
        setStorageStatus(payload.storage.status as StorageStatus);
      }
      setMemoryStashMessage(`${attachments.length} file${attachments.length === 1 ? "" : "s"} stashed as agent memory.`);
    } catch (error) {
      setMemoryStashMessage(error instanceof Error ? error.message : "Memory stash failed.");
    } finally {
      setMemoryStashLoading(false);
    }
  };

  const clearMemoryStash = async () => {
    setMemoryStashLoading(true);
    setMemoryStashMessage("");

    try {
      const response = await fetch("/api/memory/stash", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: projectMemory.projectId,
          mode: "clear"
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not clear memory stash.");
      }

      setMemoryAttachments([]);
      if (payload?.storage?.status) {
        setStorageStatus(payload.storage.status as StorageStatus);
      }
      setMemoryStashMessage("Memory stash cleared.");
    } catch (error) {
      setMemoryStashMessage(error instanceof Error ? error.message : "Could not clear memory stash.");
    } finally {
      setMemoryStashLoading(false);
    }
  };

  const saveRuntimeKeySetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const hasOpenAIModelSetup =
      selectedProvider === "openai" &&
      Boolean(
        keySetupTranscribeModel.trim() ||
          keySetupRealtimeModel.trim() ||
          keySetupTranslationModel.trim()
      );

    if (
      !keySetupApiKey.trim() &&
      selectedProvider !== "custom" &&
      !selectedRuntimeProvider?.keyConfigured &&
      !hasOpenAIModelSetup
    ) {
      setKeySetupMessage("Paste an API key first.");
      return;
    }

    if (selectedProvider === "custom" && !keySetupApiKey.trim() && !keySetupBaseUrl.trim()) {
      setKeySetupMessage("Paste an API key or custom gateway URL first.");
      return;
    }

    setKeySetupSaving(true);
    setKeySetupMessage("");

    try {
      const response = await fetch("/api/runtime-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: keySetupApiKey,
          baseUrl: keySetupBaseUrl,
          model: activeModel,
          transcribeModel: selectedProvider === "openai" ? keySetupTranscribeModel : undefined,
          realtimeModel: selectedProvider === "openai" ? keySetupRealtimeModel : undefined,
          translationModel: selectedProvider === "openai" ? keySetupTranslationModel : undefined
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Key setup failed.");
      }

      const nextStatus = payload?.status as RuntimeConfigStatus | undefined;
      if (nextStatus) {
        setRuntimeConfigStatus(nextStatus);
      }

      const routerPayload = await fetch("/api/model-router").then((routerResponse) =>
        routerResponse.json()
      );
      if (Array.isArray(routerPayload?.providers)) {
        setModelRoutes(routerPayload.providers as ModelRoute[]);
      }

      setKeySetupApiKey("");
      const nextProvider = nextStatus?.providers[selectedProvider];
      setKeySetupMessage(
        nextProvider?.keyConfigured
          ? "Saved. You can press Start or run live AI now."
          : "Model settings saved. Paste an API key to go live."
      );
    } catch (error) {
      setKeySetupMessage(error instanceof Error ? error.message : "Key setup failed.");
    } finally {
      setKeySetupSaving(false);
    }
  };

  const clearRuntimeKeySetup = async () => {
    setKeySetupSaving(true);
    setKeySetupMessage("");

    try {
      const response = await fetch("/api/runtime-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider: selectedProvider,
          clear: true,
          model: activeModel,
          baseUrl: keySetupBaseUrl,
          transcribeModel: selectedProvider === "openai" ? keySetupTranscribeModel : undefined,
          realtimeModel: selectedProvider === "openai" ? keySetupRealtimeModel : undefined,
          translationModel: selectedProvider === "openai" ? keySetupTranslationModel : undefined
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not clear the key.");
      }

      if (payload?.status) {
        setRuntimeConfigStatus(payload.status as RuntimeConfigStatus);
      }

      const routerPayload = await fetch("/api/model-router").then((routerResponse) =>
        routerResponse.json()
      );
      if (Array.isArray(routerPayload?.providers)) {
        setModelRoutes(routerPayload.providers as ModelRoute[]);
      }

      setKeySetupApiKey("");
      setKeySetupMessage("Runtime key cleared for this provider.");
    } catch (error) {
      setKeySetupMessage(error instanceof Error ? error.message : "Could not clear the key.");
    } finally {
      setKeySetupSaving(false);
    }
  };

  const openAgentBrief = async (forceRefresh = false) => {
    if (agentBriefOpen && !forceRefresh) {
      setAgentBriefOpen(false);
      return;
    }

    setAgentBriefOpen(true);
    setAgentBriefLoading(true);
    setAgentBriefMessage("");

    try {
      const response = await fetch(
        `/api/agent/brief?projectId=${encodeURIComponent(projectMemory.projectId || "default")}`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load agent brief.");
      }

      setAgentBrief(payload as Record<string, unknown>);
      setAgentBriefMessage("Agent brief ready.");
    } catch (error) {
      setAgentBriefMessage(error instanceof Error ? error.message : "Could not load agent brief.");
    } finally {
      setAgentBriefLoading(false);
    }
  };

  const copyAgentBrief = async () => {
    if (!agentBrief) {
      setAgentBriefMessage("Open the brief first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(agentBrief, null, 2));
      setAgentBriefMessage("Copied agent brief JSON.");
    } catch {
      setAgentBriefMessage("Clipboard blocked. Agents can read /api/agent/brief directly.");
    }
  };

  const saveStorageEvent = async (type: string, payload: unknown) => {
    try {
      const response = await fetch("/api/storage/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type,
          projectId: projectMemory.projectId,
          payload
        })
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error ?? "Storage save failed.");
      }

      if (result?.status) {
        setStorageStatus(result.status as StorageStatus);
      }
      setStorageMessage(result?.saved ? "Saved to connected storage." : "Storage is not configured.");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "Storage save failed.");
    }
  };

  const suggestClips = async () => {
    const windowText = transcriptWindow || SAMPLE_LINES.join("\n");
    setClipLoading(true);
    setClipMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/clips/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          transcriptWindow: windowText,
          personaCards: personaCards.slice(0, 12),
          modelRouter: {
            provider: selectedProvider,
            model: activeModel
          },
          promptStudio,
          projectMemory: buildPublicProjectMemory(projectMemory, memoryAttachments)
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Clip suggestions failed.");
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
          projectMemory: buildPublicProjectMemory(projectMemory, memoryAttachments),
          modelRouter: payload?.modelRouter
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clip suggestions failed.";
      setClipMessage(message);
      setErrorMessage(message);
    } finally {
      setClipLoading(false);
    }
  };

  const createBotHandoff = async () => {
    if (clipSuggestions.length === 0) {
      setClipMessage("Create clip suggestions before sending a bot handoff.");
      return;
    }

    setClipLoading(true);
    setClipMessage("");

    try {
      const response = await fetch("/api/agent/clip-handoff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clips: clipSuggestions,
          projectMemory: buildPublicProjectMemory(projectMemory, memoryAttachments)
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Bot handoff failed.");
      }

      const manifest = payload?.manifest as ClipHandoffManifest | undefined;
      setHandoffManifest(manifest ?? null);
      if (payload?.storage?.status) {
        setStorageStatus(payload.storage.status as StorageStatus);
      }
      setClipMessage(
        manifest
          ? `${manifest.actions.length} render actions are ready for external agents.`
          : "Bot handoff manifest created."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bot handoff failed.";
      setClipMessage(message);
      setErrorMessage(message);
    } finally {
      setClipLoading(false);
    }
  };

  const handleRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    const type = String(event.type ?? "");
    const itemId = getEventItemId(event);

    if (type === "input_audio_buffer.speech_started") {
      setSpeechActive(true);
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      setSpeechActive(false);
      return;
    }

    if (type === "input_audio_buffer.committed" && itemId) {
      upsertTranscript({
        id: itemId,
        previousId: getPreviousItemId(event),
        text: "",
        draft: "Listening...",
        final: false
      });
      return;
    }

    if (type.includes("input_audio_transcription.delta") && itemId) {
      const delta = String(event.delta ?? "");
      if (delta) {
        appendTranscriptDraft(itemId, delta);
      }
      return;
    }

    if (type.includes("input_audio_transcription.completed") && itemId) {
      const transcript = String(event.transcript ?? event.text ?? "").trim();
      if (transcript) {
        const nextTurn = {
          id: itemId,
          previousId: getPreviousItemId(event),
          text: transcript,
          draft: "",
          final: true
        } satisfies Omit<TranscriptTurn, "createdAt">;

        upsertTranscript(nextTurn);

        const nextWindow = buildNextTranscriptWindow(transcriptTurnsRef.current, nextTurn);
        if (nextWindow.trim().length >= MIN_PERSONA_ANALYSIS_CHARS && !aiMutedRef.current) {
          if (analyzeTimerRef.current) {
            window.clearTimeout(analyzeTimerRef.current);
          }

          analyzeTimerRef.current = window.setTimeout(() => {
            void analyzeTranscriptRef.current(nextWindow);
          }, 250);
        }
      }
      setSpeechActive(false);
      return;
    }

    if (type.includes("input_audio_transcription.failed")) {
      setErrorMessage("Realtime transcription failed for one speech turn.");
    }
  }, []);

  const isRunning =
    status === "connecting" || status === "listening" || status === "reconnecting";
  const hasVideo = Boolean(streamRef.current?.getVideoTracks().length);
  const recordingLabel =
    recordingKind === "show"
      ? "regular"
      : recordingKind === "enhanced"
        ? "enhanced"
        : "";

  return (
    <main
      className={`app-shell ${simpleMode ? "simple-mode" : ""} ${
        viewMode === "regular" ? "regular-mode" : ""
      } ${
        glassFlowMode ? "glass-flow-mode" : ""
      }`}
    >
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Radio size={22} />
          </div>
          <div>
            <h1>TWiST Glass Sidebar</h1>
            <p>{STATUS_COPY[status]} live intelligence layer</p>
          </div>
        </div>

        <div className="top-actions">
          {isRunning ? (
            <button className="primary-button stop" onClick={stopCapture}>
              <CircleStop size={18} />
              <span>Stop</span>
            </button>
          ) : (
            <button className="primary-button" onClick={() => void startCapture()}>
              <Play size={18} />
              <span>Start</span>
            </button>
          )}
          <button
            className={`icon-button live-button ${aiMuted ? "danger" : ""}`}
            onClick={() => setAiMuted((muted) => !muted)}
            title={aiMuted ? "Unmute AI output" : "Mute AI output"}
          >
            {aiMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            <span>{aiMuted ? "Muted" : "AI Live"}</span>
          </button>
          <button
            className={`icon-button view-button ${viewMode === "enhanced" ? "selected" : ""}`}
            onClick={() => setViewMode(viewMode === "enhanced" ? "regular" : "enhanced")}
            title={viewMode === "enhanced" ? "Show regular stream" : "Show enhanced stream"}
          >
            {viewMode === "enhanced" ? <Eye size={18} /> : <PanelRightOpen size={18} />}
            <span>{viewMode === "enhanced" ? "Enhanced" : "Regular"}</span>
          </button>
          <button
            className={`icon-button router-button ${modelPanelOpen ? "selected" : ""}`}
            onClick={() => setModelPanelOpen((open) => !open)}
            title="Setup API keys and model routing"
          >
            <SlidersHorizontal size={18} />
            <span>{simpleMode ? "Setup" : selectedRoute.label}</span>
          </button>
          <button
            className={`icon-button memory-button ${memoryPanelOpen ? "selected" : ""}`}
            onClick={() => setMemoryPanelOpen((open) => !open)}
            title="Project memory and storage"
          >
            <Database size={18} />
            <span>Memory</span>
          </button>
          <button
            className={`icon-button agent-brief-button ${agentBriefOpen ? "selected" : ""}`}
            onClick={() => void openAgentBrief()}
            title="Agent-readable project brief"
          >
            <FileJson size={18} />
            <span>Agent Brief</span>
          </button>
          {!simpleMode ? (
            <button
              className={`icon-button prompt-button ${promptPanelOpen ? "selected" : ""}`}
              onClick={() => setPromptPanelOpen((open) => !open)}
              title="Prompt studio"
            >
              <NotebookPen size={18} />
              <span>Prompts</span>
            </button>
          ) : null}
          {!simpleMode ? (
            <button
              className={`icon-button clip-button ${clipPanelOpen ? "selected" : ""}`}
              onClick={() => setClipPanelOpen((open) => !open)}
              title="Clip Studio"
            >
              <Scissors size={18} />
              <span>Clips</span>
            </button>
          ) : null}
          {!simpleMode ? (
            <button
              className={`icon-button glass-mode-button ${glassFlowMode ? "selected" : ""}`}
              onClick={() => setGlassFlowMode((current) => !current)}
              title={glassFlowMode ? "Turn off glass flow mode" : "Turn on glass flow mode"}
            >
              <GlassWater size={18} />
              <span>{glassFlowMode ? "Glass" : "Flow"}</span>
            </button>
          ) : null}
          <button
            className={`icon-button mode-button ${simpleMode ? "selected" : ""}`}
            onClick={() => setSimpleMode((current) => !current)}
            title={simpleMode ? "Show advanced controls" : "Return to simple mode"}
          >
            <Sparkles size={18} />
            <span>{simpleMode ? "Simple" : "Advanced"}</span>
          </button>
          <button
            className="icon-button theme-toggle"
            onClick={() =>
              setThemeMode((current) => (current === "light" ? "dark" : "light"))
            }
            title={themeMode === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {themeMode === "light" ? <Moon size={18} /> : <Sun size={18} />}
            <span>{themeMode === "light" ? "Dark" : "Light"}</span>
          </button>
          {!simpleMode ? (
            <button className="icon-button clear-button" onClick={clearTranscript} title="Clear transcript">
              <Eraser size={18} />
              <span>Clear</span>
            </button>
          ) : null}
        </div>
      </header>

      <section className="control-strip">
        <div className="segmented-control" aria-label="Capture source">
          <button
            className={captureMode === "tab" ? "active" : ""}
            onClick={() => setCaptureMode("tab")}
            title="Capture tab or system audio"
          >
            <MonitorUp size={17} />
            <span>Tab</span>
          </button>
          <button
            className={captureMode === "mic" ? "active" : ""}
            onClick={() => setCaptureMode("mic")}
            title="Capture microphone audio"
          >
            <Mic size={17} />
            <span>Mic</span>
          </button>
          <button
            className={captureMode === "both" ? "active" : ""}
            onClick={() => setCaptureMode("both")}
            title="Capture show tab audio and microphone together"
          >
            <Waves size={17} />
            <span>Both</span>
          </button>
        </div>

        <div className={`status-pill ${status}`}>
          <Activity size={17} />
          <span>{STATUS_COPY[status]}</span>
        </div>

        <div className={`signal-meter ${speechActive ? "hot" : ""}`} title="Input level">
          <Gauge size={17} />
          <div className="meter-track">
            <span style={{ width: `${Math.max(6, audioLevel)}%` }} />
          </div>
        </div>

        <button className="ghost-button" onClick={addSampleTranscript} title={`Run sample from ${SAMPLE_SHOW.episode}`}>
          <Sparkles size={17} />
          <span>Sample</span>
        </button>

        <div className={`recording-controls ${isRecording ? "recording" : ""}`}>
          {isRecording ? (
            <button
              className="mini-button record-stop"
              onClick={stopRecording}
              title={`Stop ${recordingLabel} stream recording and download the WebM file`}
              type="button"
            >
              <CircleStop size={15} />
              <span>Stop {recordingLabel}</span>
            </button>
          ) : (
            <>
              <button
                className="mini-button"
                disabled={!isRunning || !streamRef.current}
                onClick={() => startShowRecording(streamRef.current)}
                title="Record the captured regular show stream"
                type="button"
              >
                <Clapperboard size={15} />
                <span>Record Show</span>
              </button>
              <button
                className="mini-button"
                onClick={() => void startEnhancedRecording()}
                title="Record the enhanced sidebar view through browser screen capture"
                type="button"
              >
                <PanelRightOpen size={15} />
                <span>Record Enhanced</span>
              </button>
            </>
          )}
        </div>
      </section>

      {recordingError ? (
        <div className="recording-banner">
          <Info size={18} />
          <div>
            <strong>Recording needs attention</strong>
            <span>{recordingError}</span>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className={`error-banner ${captureErrorKind ? "capture-error" : ""}`}>
          <Info size={18} />
          <div>
            <strong>
              {captureErrorKind === "permission"
                ? "Browser permission needs one more step"
                : captureErrorKind === "no-audio"
                  ? "Audio was not shared"
                  : captureErrorKind === "unsupported"
                    ? "Capture device unavailable"
                    : "Needs attention"}
            </strong>
            <span>{errorMessage}</span>
            {captureErrorKind ? (
              <small>
                {captureMode === "mic"
                  ? "Try Retry Mic after reloading, or open this localhost URL in Chrome/Safari and allow the site microphone prompt. For podcast demos, Tab audio is usually smoother."
                  : captureMode === "both"
                    ? "Both needs a full browser tab picker. In Codex/in-app browsers, switch to Mic or Sample; for the bounty demo, open this URL in Chrome/Brave/Safari and share the show tab with audio."
                  : "Choose Chrome/Brave/Safari tab capture, then check Share tab audio in the browser picker."}
              </small>
            ) : null}
          </div>
          {captureErrorKind ? (
            <div className="error-actions">
              <button
                className="mini-button"
                onClick={() => void startCapture()}
                type="button"
              >
                <RotateCcw size={15} />
                <span>
                  {captureMode === "mic" ? "Retry Mic" : captureMode === "both" ? "Retry Both" : "Retry Tab"}
                </span>
              </button>
              <button
                className="mini-button"
                onClick={() => {
                  setCaptureMode(captureMode === "mic" ? "tab" : "mic");
                  setErrorMessage("");
                  setCaptureErrorKind(null);
                }}
                type="button"
              >
                {captureMode === "mic" ? <MonitorUp size={15} /> : <Mic size={15} />}
                <span>{captureMode === "mic" ? "Use Tab" : "Use Mic"}</span>
              </button>
              <button className="mini-button" onClick={addSampleTranscript} type="button">
                <Sparkles size={15} />
                <span>Sample</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!simpleMode ? (
      <section className="persona-rail" aria-label="Persona toggles">
        {PERSONAS.map((persona) => {
          const active = activePersonaIds.includes(persona.id);
          const speaking = speakingPersonaIds.has(persona.id);
          return (
            <button
              key={persona.id}
              className={`persona-toggle ${active ? "active" : ""} ${
                speaking ? "speaking" : ""
              }`}
              onClick={() => togglePersona(persona.id)}
              style={
                {
                  "--persona-color": persona.color,
                  "--persona-accent": persona.accent
                } as React.CSSProperties
              }
              title={`${active ? "Disable" : "Enable"} ${persona.role}`}
            >
              <PersonaAvatar personaId={persona.id} size="small" />
              <span>{persona.shortRole}</span>
            </button>
          );
        })}
      </section>
      ) : null}

      <section className="agent-console" aria-label="Agent command center">
        <div className="agent-console-main">
          <span className="agent-core">
            <Sparkles size={20} />
          </span>
          <div>
            <p>Agent ops</p>
            <h2>{activePersonaIds.length} workers routed through {selectedRoute.label}</h2>
          </div>
        </div>

        <div className="agent-chips">
          <span>{activeModel}</span>
          <span>{selectedRoute.mode === "responses" ? "Responses" : "Chat"}</span>
          <span>{selectedRoute.configured ? "Live model" : "Demo fallback"}</span>
          <span>{storageStatus.configured ? `${storageStatus.provider} storage` : "local memory"}</span>
          <span>{clipSuggestions.length ? `${clipSuggestions.length} clips queued` : "clip scout ready"}</span>
          <span>{isRecording ? `recording ${recordingLabel} stream` : "two-stream recorder"}</span>
          <span>{simpleMode ? "simple core" : glassFlowMode ? "glass flow" : "classic glass"}</span>
        </div>
      </section>

      {!simpleMode && glassFlowMode ? (
        <section className="agent-flow-panel" aria-label="Agent flow">
          <div className="flow-header">
            <div>
              <p>Agent flow</p>
              <h2>From live audio to saved intelligence</h2>
            </div>
            <div className="flow-live-badge">
              <Waves size={16} />
              <span>{analyzing ? "reasoning" : status === "listening" ? "streaming" : "standing by"}</span>
            </div>
          </div>
          <div className="flow-track">
            {AGENT_FLOW_STEPS.map((step, index) => {
              const active = agentFlowState[step.id];
              return (
                <article
                  className={`flow-step ${active ? "active" : ""}`}
                  key={step.id}
                  style={{ "--flow-index": index } as React.CSSProperties}
                >
                  <span className="flow-step-icon">
                    <FlowIcon id={step.id} />
                  </span>
                  <div>
                    <h3>{step.label}</h3>
                    <p>{step.detail}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {modelPanelOpen ? (
        <section className="model-panel" aria-label="Model router settings">
          <div className="model-grid">
            {modelRoutes.map((route) => (
              <button
                className={`model-route ${route.id === selectedProvider ? "active" : ""}`}
                key={route.id}
                onClick={() => {
                  setSelectedProvider(route.id);
                  setModelOverride(
                    window.localStorage.getItem(`twist-sidebar-model-${route.id}`) ||
                      route.model
                  );
                }}
                style={
                  {
                    "--route-accent": route.accent
                  } as React.CSSProperties
                }
                title={route.configured ? `${route.label} ready` : `${route.label} needs an API key`}
              >
                <div>
                  <h3>{route.label}</h3>
                  <p>{route.model}</p>
                </div>
                <strong>{route.configured ? "Ready" : "Needs key"}</strong>
                <span>{route.capabilities.join(" / ")}</span>
              </button>
            ))}
          </div>

          <label className="model-input">
            <span>Model</span>
            <input
              value={modelOverride}
              onChange={(event) => setModelOverride(event.target.value)}
              placeholder={selectedRoute.model}
              spellCheck={false}
            />
          </label>

          <form className="key-setup-form" onSubmit={saveRuntimeKeySetup}>
            <div className="key-setup-header">
              <div>
                <h3>Paste key, press Enter</h3>
                <p>
                  {selectedRuntimeProvider?.configured
                    ? `${selectedRuntimeProvider.source} key ready${
                        selectedRuntimeProvider.redacted
                          ? ` / ${selectedRuntimeProvider.redacted}`
                          : ""
                      }`
                    : "Stored only on this local server, never in browser localStorage."}
                </p>
              </div>
              <span>{runtimeConfigStatus?.filePath ?? ".data/runtime-secrets.json"}</span>
            </div>

            {selectedProvider === "custom" ? (
              <label className="key-setup-field">
                <span>Gateway URL</span>
                <input
                  onChange={(event) => setKeySetupBaseUrl(event.target.value)}
                  placeholder="https://your-gateway.example.com"
                  spellCheck={false}
                  type="url"
                  value={keySetupBaseUrl}
                />
              </label>
            ) : null}

            <label className="key-setup-field">
              <span>{selectedRoute.label} API key</span>
              <input
                autoComplete="off"
                onChange={(event) => setKeySetupApiKey(event.target.value)}
                placeholder={
                  selectedProvider === "openrouter"
                    ? "OpenRouter API key"
                    : selectedProvider === "custom"
                      ? "optional bearer key"
                      : "OpenAI project API key"
                }
                spellCheck={false}
                type="password"
                value={keySetupApiKey}
              />
            </label>

            {selectedProvider === "openai" ? (
              <div className="key-model-grid">
                <label className="key-setup-field">
                  <span>Realtime voice model</span>
                  <input
                    onChange={(event) => setKeySetupRealtimeModel(event.target.value)}
                    placeholder={OPENAI_REALTIME_DEFAULTS.realtimeModel}
                    spellCheck={false}
                    value={keySetupRealtimeModel}
                  />
                </label>
                <label className="key-setup-field">
                  <span>Realtime translate model</span>
                  <input
                    onChange={(event) => setKeySetupTranslationModel(event.target.value)}
                    placeholder={OPENAI_REALTIME_DEFAULTS.translationModel}
                    spellCheck={false}
                    value={keySetupTranslationModel}
                  />
                </label>
                <label className="key-setup-field">
                  <span>Transcription model</span>
                  <input
                    onChange={(event) => setKeySetupTranscribeModel(event.target.value)}
                    placeholder={OPENAI_REALTIME_DEFAULTS.transcribeModel}
                    spellCheck={false}
                    value={keySetupTranscribeModel}
                  />
                </label>
              </div>
            ) : null}

            <div className="key-setup-actions">
              <button className="mini-button" disabled={keySetupSaving} type="submit">
                <ShieldCheck size={15} />
                <span>{keySetupSaving ? "Saving" : "Save key"}</span>
              </button>
              <button
                className="mini-button"
                disabled={keySetupSaving || !selectedRuntimeProvider?.keyConfigured}
                onClick={() => void clearRuntimeKeySetup()}
                type="button"
              >
                <Eraser size={15} />
                <span>Forget</span>
              </button>
            </div>

            {keySetupMessage ? <p className="key-setup-message">{keySetupMessage}</p> : null}
          </form>
        </section>
      ) : null}

      {agentBriefOpen ? (
        <section className="agent-brief-panel" aria-label="Agent-readable project brief">
          <div className="prompt-panel-header">
            <div className="agent-console-main">
              <span className="agent-core brief-core">
                <FileJson size={20} />
              </span>
              <div>
                <p>Agent brief</p>
                <h2>One endpoint for outside agents to understand this project</h2>
              </div>
            </div>
            <div className="brief-actions">
              <button
                className="mini-button"
                disabled={agentBriefLoading}
                onClick={() => void openAgentBrief(true)}
                title="Refresh agent brief"
              >
                <RotateCcw size={15} />
                <span>{agentBriefLoading ? "Loading" : "Refresh"}</span>
              </button>
              <button
                className="mini-button"
                disabled={!agentBrief}
                onClick={() => void copyAgentBrief()}
                title="Copy agent brief JSON"
              >
                <FileJson size={15} />
                <span>Copy JSON</span>
              </button>
            </div>
          </div>

          <div className="brief-grid">
            <div className="storage-status">
              <Bot size={18} />
              <div>
                <strong>Agent read endpoint</strong>
                <span>/api/agent/brief?projectId={projectMemory.projectId || "default"}</span>
              </div>
            </div>
            <div className="storage-status">
              <Waves size={18} />
              <div>
                <strong>Realtime ready</strong>
                <span>transcription + voice-session routes</span>
              </div>
            </div>
          </div>

          {agentBriefMessage ? <p className="storage-message">{agentBriefMessage}</p> : null}

          <textarea
            className="brief-code"
            readOnly
            rows={10}
            value={
              agentBrief
                ? JSON.stringify(agentBrief, null, 2)
                : "Open this panel to generate the agent-readable project brief."
            }
          />
        </section>
      ) : null}

      {promptPanelOpen ? (
        <section className="prompt-panel" aria-label="Prompt studio">
          <div className="prompt-panel-header">
            <div className="agent-console-main">
              <span className="agent-core prompt-core">
                <WandSparkles size={20} />
              </span>
              <div>
                <p>Prompt studio</p>
                <h2>Tune how the AI writers think, joke, verify, and react</h2>
              </div>
            </div>

            <button
              className="mini-button"
              onClick={() => setPromptStudio(createDefaultPromptStudio())}
              title="Reset prompt studio"
            >
              <RotateCcw size={15} />
              <span>Reset</span>
            </button>
          </div>

          <div className="prompt-presets">
            {PROMPT_PRESETS.map((preset) => (
              <button key={preset.id} onClick={() => applyPromptPreset(preset)}>
                <Sparkles size={15} />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          <div className="prompt-grid">
            <label className="prompt-field wide">
              <span>Show context</span>
              <textarea
                value={promptStudio.showContext}
                onChange={(event) => updatePromptStudio("showContext", event.target.value)}
                rows={3}
              />
            </label>
            <label className="prompt-field wide">
              <span>Writer direction</span>
              <textarea
                value={promptStudio.directive}
                onChange={(event) => updatePromptStudio("directive", event.target.value)}
                rows={4}
              />
            </label>
            <label className="prompt-field">
              <span>Tone</span>
              <textarea
                value={promptStudio.tone}
                onChange={(event) => updatePromptStudio("tone", event.target.value)}
                rows={3}
              />
            </label>
            <label className="prompt-field">
              <span>Guardrails</span>
              <textarea
                value={promptStudio.guardrails}
                onChange={(event) => updatePromptStudio("guardrails", event.target.value)}
                rows={3}
              />
            </label>
          </div>

          <div className="persona-prompt-grid">
            {PERSONAS.map((persona) => (
              <label
                className="persona-prompt-field"
                key={persona.id}
                style={
                  {
                    "--persona-color": persona.color,
                    "--persona-accent": persona.accent
                  } as React.CSSProperties
                }
              >
                <span>
                  <strong>{persona.shortRole}</strong>
                  {persona.role}
                </span>
                <textarea
                  value={promptStudio.personaPrompts[persona.id]}
                  onChange={(event) => updatePersonaPrompt(persona.id, event.target.value)}
                  rows={3}
                />
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {memoryPanelOpen ? (
        <section className="memory-panel" aria-label="Project memory and secure storage">
          <div className="prompt-panel-header">
            <div className="agent-console-main">
              <span className="agent-core memory-core">
                <ShieldCheck size={20} />
              </span>
              <div>
                <p>Project memory</p>
                <h2>Teach this downloaded instance what it is, then connect storage server-side</h2>
              </div>
            </div>

            <button
              className="mini-button"
              onClick={() =>
                void saveStorageEvent("project_memory", {
                  projectMemory: buildPublicProjectMemory(projectMemory, memoryAttachments),
                  autosaveCards: projectMemory.autosaveCards,
                  autosaveTranscript: projectMemory.autosaveTranscript
                })
              }
              title="Save project memory to configured storage"
            >
              <Cloud size={15} />
              <span>Save</span>
            </button>
          </div>

          <div className="storage-strip">
            <div className="storage-status">
              <HardDrive size={18} />
              <div>
                <strong>{storageStatus.configured ? "Storage connected" : "Secure local mode"}</strong>
                <span>{storageStatus.destination}</span>
              </div>
            </div>
            <div className="storage-status">
              <ShieldCheck size={18} />
              <div>
                <strong>Secrets stay server-side</strong>
                <span>{storageStatus.provider} / {storageStatus.capabilities.join(" / ")}</span>
              </div>
            </div>
          </div>

          {storageMessage ? <p className="storage-message">{storageMessage}</p> : null}

          <div className="memory-stash-panel">
            <div className="memory-stash-header">
              <div className="agent-console-main">
                <span className="agent-core memory-file-core">
                  <FolderOpen size={20} />
                </span>
                <div>
                  <p>Memory stash</p>
                  <h2>
                    {memoryAttachments.length
                      ? `${memoryAttachments.length} files attached`
                      : "Attach files or folders for the agents"}
                  </h2>
                </div>
              </div>
              <div className="memory-stash-actions">
                <button
                  className="mini-button"
                  disabled={memoryStashLoading}
                  onClick={() => fileStashInputRef.current?.click()}
                  type="button"
                  title="Attach memory files"
                >
                  <Upload size={15} />
                  <span>Files</span>
                </button>
                <button
                  className="mini-button"
                  disabled={memoryStashLoading}
                  onClick={() => folderStashInputRef.current?.click()}
                  type="button"
                  title="Attach a memory folder"
                >
                  <FolderOpen size={15} />
                  <span>Folder</span>
                </button>
                <button
                  className="mini-button"
                  disabled={memoryStashLoading || memoryAttachments.length === 0}
                  onClick={() => void clearMemoryStash()}
                  type="button"
                  title="Clear stashed memory"
                >
                  <Trash2 size={15} />
                  <span>Clear stash</span>
                </button>
              </div>
            </div>

            <input
              hidden
              multiple
              onChange={(event) => void handleMemoryFilesPicked(event)}
              ref={fileStashInputRef}
              type="file"
            />
            <input
              hidden
              multiple
              onChange={(event) => void handleMemoryFilesPicked(event)}
              ref={folderStashInputRef}
              type="file"
              {...({
                webkitdirectory: "",
                directory: ""
              } as FolderInputProps)}
            />

            <div className="memory-stash-stats">
              <span>{formatBytes(memoryAttachments.reduce((sum, item) => sum + item.size, 0))}</span>
              <span>{formatBytes(memoryAttachments.reduce((sum, item) => sum + item.preview.length, 0))} readable preview</span>
              <span>.data/project-memory/{projectMemory.projectId || "default"}</span>
            </div>

            {memoryStashMessage ? (
              <p className="storage-message">{memoryStashMessage}</p>
            ) : null}

            {memoryAttachments.length > 0 ? (
              <div className="memory-file-list">
                {memoryAttachments.slice(0, 8).map((attachment) => (
                  <article className="memory-file-row" key={attachment.id}>
                    <FileText size={16} />
                    <div>
                      <strong>{attachment.name}</strong>
                      <span>{attachment.relativePath} / {formatBytes(attachment.size)}</span>
                    </div>
                    <em>{attachment.preview ? "text" : "meta"}</em>
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <div className="memory-grid">
            <label className="prompt-field">
              <span>Project ID</span>
              <input
                value={projectMemory.projectId}
                onChange={(event) => updateProjectMemory("projectId", event.target.value)}
                spellCheck={false}
              />
            </label>
            <label className="prompt-field">
              <span>Project name</span>
              <input
                value={projectMemory.projectName}
                onChange={(event) => updateProjectMemory("projectName", event.target.value)}
              />
            </label>
            <label className="prompt-field wide">
              <span>Owner / workflow context</span>
              <textarea
                value={projectMemory.ownerContext}
                onChange={(event) => updateProjectMemory("ownerContext", event.target.value)}
                rows={3}
              />
            </label>
            <label className="prompt-field">
              <span>Audience</span>
              <textarea
                value={projectMemory.audience}
                onChange={(event) => updateProjectMemory("audience", event.target.value)}
                rows={3}
              />
            </label>
            <label className="prompt-field">
              <span>Preferred tools / cloud</span>
              <textarea
                value={projectMemory.preferredTools}
                onChange={(event) => updateProjectMemory("preferredTools", event.target.value)}
                rows={3}
              />
            </label>
            <label className="prompt-field">
              <span>Data policy</span>
              <textarea
                value={projectMemory.dataPolicy}
                onChange={(event) => updateProjectMemory("dataPolicy", event.target.value)}
                rows={3}
              />
            </label>
            <label className="prompt-field">
              <span>Storage notes</span>
              <textarea
                value={projectMemory.storageNotes}
                onChange={(event) => updateProjectMemory("storageNotes", event.target.value)}
                rows={3}
              />
            </label>
          </div>

          <div className="save-toggles">
            <label>
              <input
                checked={projectMemory.autosaveCards}
                onChange={(event) =>
                  setProjectMemory((current) => ({
                    ...current,
                    autosaveCards: event.target.checked
                  }))
                }
                type="checkbox"
              />
              <span>Save persona cards</span>
            </label>
            <label>
              <input
                checked={projectMemory.autosaveTranscript}
                onChange={(event) =>
                  setProjectMemory((current) => ({
                    ...current,
                    autosaveTranscript: event.target.checked
                  }))
                }
                type="checkbox"
              />
              <span>Save transcript turns</span>
            </label>
          </div>
        </section>
      ) : null}

      {clipPanelOpen ? (
        <section className="clip-panel" aria-label="Clip Studio and agent handoff">
          <div className="prompt-panel-header">
            <div className="agent-console-main">
              <span className="agent-core clip-core">
                <Clapperboard size={20} />
              </span>
              <div>
                <p>Clip Studio</p>
                <h2>Find useful moments and hand render-ready props to agent bots</h2>
              </div>
            </div>

            <div className="clip-panel-actions">
              <button
                className="mini-button"
                disabled={clipLoading}
                onClick={() => void suggestClips()}
                title="Suggest clips from the transcript and sidebar cards"
              >
                <Scissors size={15} />
                <span>{clipLoading ? "Working" : "Suggest"}</span>
              </button>
              <button
                className="mini-button"
                disabled={clipLoading || clipSuggestions.length === 0}
                onClick={() => void createBotHandoff()}
                title="Create bot-readable clip handoff manifest"
              >
                <Bot size={15} />
                <span>Handoff</span>
              </button>
            </div>
          </div>

          <div className="clip-handoff-strip">
            <div className="storage-status">
              <FileJson size={18} />
              <div>
                <strong>Agent endpoint</strong>
                <span>/api/agent/clip-handoff</span>
              </div>
            </div>
            <div className="storage-status">
              <Send size={18} />
              <div>
                <strong>{handoffManifest ? "Manifest ready" : "Action contract"}</strong>
                <span>
                  {handoffManifest
                    ? `${handoffManifest.actions.length} Remotion render actions`
                    : "render_remotion_clip / ClipSuggestion"}
                </span>
              </div>
            </div>
          </div>

          {clipMessage ? <p className="storage-message">{clipMessage}</p> : null}

          <div className="clip-grid">
            {clipSuggestions.length === 0 ? (
              <article className="clip-empty">
                <span className="agent-core clip-core">
                  <Scissors size={20} />
                </span>
                <div>
                  <h3>Clip scout is standing by</h3>
                  <p>Use the current transcript window or the sample transcript to generate render-ready clip moments.</p>
                </div>
              </article>
            ) : (
              clipSuggestions.map((clip) => (
                <article className="clip-card" key={clip.id}>
                  <div className="clip-card-header">
                    <span className={`clip-priority ${clip.priority}`}>{clip.priority}</span>
                    <div>
                      <h3>{clip.title}</h3>
                      <p>{clip.durationSec}s / {clip.format} / {clip.remotion.compositionId}</p>
                    </div>
                  </div>

                  <p className="clip-hook">{clip.hook}</p>
                  <p className="clip-reason">{clip.reason}</p>

                  <div className="clip-tags">
                    {clip.tags.map((tag) => (
                      <span key={`${clip.id}-${tag}`}>{tag}</span>
                    ))}
                  </div>

                  <div className="clip-beats">
                    {clip.captionBeats.slice(0, 3).map((beat) => (
                      <span key={`${clip.id}-${beat}`}>{beat}</span>
                    ))}
                  </div>

                  <code className="clip-command">{clip.remotion.renderCommand}</code>

                  {clip.sources.length > 0 ? (
                    <div className="source-row">
                      {clip.sources.map((source) => (
                        <a
                          href={source.url}
                          key={`${clip.id}-${source.url}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {source.title}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      <div className="workspace">
        <section className="show-pane" aria-label="Regular show stream">
          <div className="pane-heading">
            <div>
              <p>On air</p>
              <h2>
                {captureMode === "tab"
                  ? "Captured show tab"
                  : captureMode === "both"
                    ? "Show tab + microphone"
                    : "Microphone capture"}
              </h2>
            </div>
            <div className="inline-stat">
              <Captions size={17} />
              <span>{transcriptTurns.filter((turn) => turn.final).length} turns</span>
            </div>
          </div>

          <div className={`stage ${hasVideo ? "has-video" : ""}`}>
            <img
              alt=""
              aria-hidden="true"
              className="stage-imagegen-art"
              src="/imagegen/glass-writers-room.png"
            />
            {hasVideo ? <video ref={videoRef} autoPlay muted playsInline /> : null}
            {!hasVideo ? (
              <div className="audio-visual">
                <div className={`pulse-disc ${speechActive ? "active" : ""}`}>
                  <Radio size={44} />
                </div>
                <div className="bar-stack" aria-hidden="true">
                  {Array.from({ length: 22 }).map((_, index) => (
                    <span
                      key={index}
                      style={{
                        height: `${18 + ((index * 7 + audioLevel) % 42)}px`,
                        opacity: 0.35 + Math.min(0.55, audioLevel / 130)
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {viewMode === "enhanced" ? (
              <div className="notification-dock" aria-label="Live AI notifications">
                <div className="dock-topline">
                  <Bell size={16} />
                  <span>Live cards</span>
                  <strong>{analyzing ? "Updating" : `${personaCards.length} ready`}</strong>
                </div>
                <div className="notification-list">
                  {latestNotificationCards.length > 0 ? (
                    latestNotificationCards.map((card) => (
                      <GlassNotification key={card.id} card={card} />
                    ))
                  ) : (
                    <article className="glass-notification empty-notification">
                      <div className="notification-icon">
                        <Sparkles size={17} />
                      </div>
                      <div>
                        <h3>Sidebar is standing by</h3>
                        <p>Waiting for the first live transcript window.</p>
                      </div>
                    </article>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="transcript-panel">
            <div className="panel-title">
              <div>
                <p>Live transcript</p>
                <h3>{hasFinalTranscript ? "Rolling show memory" : "Waiting for speech"}</h3>
              </div>
              <button
                className="mini-button"
                onClick={() => setTranscriptTurns((turns) => turns.slice(-4))}
                title="Keep recent turns"
              >
                <RotateCcw size={15} />
                <span>Recent</span>
              </button>
            </div>

            <div className="transcript-list">
              {transcriptTurns.length === 0 ? (
                <p className="empty-copy">No transcript yet.</p>
              ) : (
                transcriptTurns.slice(-9).map((turn) => (
                  <article
                    className={`transcript-turn ${turn.final ? "final" : "draft"}`}
                    key={turn.id}
                  >
                    <time>{formatTime(turn.createdAt)}</time>
                    <p>{turn.text || turn.draft}</p>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        {viewMode === "enhanced" ? (
          <aside className="sidebar-pane" aria-label="Enhanced AI sidebar">
            <div className="pane-heading sidebar-heading">
              <div>
                <p>Notification center</p>
                <h2>{analyzing ? "Personas are reading" : "AI writer's room"}</h2>
              </div>
              <div className="inline-stat">
                <SlidersHorizontal size={17} />
                <span>{activePersonaIds.length} active</span>
              </div>
            </div>

            <div className="persona-stack">
              {PERSONAS.map((persona) => {
                const card = latestCardsByPersona.get(persona.id);
                const active = activePersonaIds.includes(persona.id);
                const speaking = speakingPersonaIds.has(persona.id);

                return (
                  <article
                    className={`persona-card ${active ? "enabled" : "disabled"} ${
                      speaking ? "speaking" : ""
                    }`}
                    key={persona.id}
                    style={
                      {
                        "--persona-color": persona.color,
                        "--persona-accent": persona.accent
                      } as React.CSSProperties
                    }
                  >
                    <div className="persona-card-header">
                      <PersonaAvatar personaId={persona.id} />
                      <div>
                        <h3>{persona.role}</h3>
                        <p>{persona.name}</p>
                      </div>
                      <PersonaIcon personaId={persona.id} />
                    </div>

                    <p className="persona-copy">
                      {card?.text ??
                        (active
                          ? "Waiting for a useful moment."
                          : "Persona disabled.")}
                    </p>

                    <div className="persona-meta">
                      <span>{card ? `${Math.round(card.confidence * 100)}%` : "Idle"}</span>
                      <span>{card ? formatTime(card.createdAt) : "No card yet"}</span>
                    </div>

                    {card?.sources?.length ? (
                      <div className="source-row">
                        {card.sources.map((source) => (
                          <a
                            href={source.url}
                            key={`${card.id}-${source.url}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {source.title}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );

  async function connectRealtime(stream: MediaStream) {
    const tokenResponse = await fetch("/api/realtime/session", {
      method: "POST"
    });
    const tokenPayload = await tokenResponse.json().catch(() => null);

    if (!tokenResponse.ok) {
      throw new Error(
        tokenPayload?.error ??
          "Unable to create a Realtime session. Check OPENAI_API_KEY."
      );
    }

    const ephemeralKey = extractClientSecret(tokenPayload);
    if (!ephemeralKey) {
      throw new Error("Realtime session did not return a client secret.");
    }

    const peer = new RTCPeerConnection();
    peerRef.current = peer;

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setStatus("listening");
      } else if (
        peer.connectionState === "disconnected" ||
        peer.connectionState === "failed"
      ) {
        setStatus("reconnecting");
      } else if (peer.connectionState === "closed") {
        setStatus("stopped");
      }
    };

    for (const track of stream.getAudioTracks()) {
      peer.addTrack(track, stream);
    }

    const channel = peer.createDataChannel("oai-events");
    channelRef.current = channel;
    channel.addEventListener("message", (message) => {
      try {
        handleRealtimeEvent(JSON.parse(message.data));
      } catch {
        setErrorMessage("Received an unreadable realtime event.");
      }
    });

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGathering(peer);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: peer.localDescription?.sdp ?? offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp"
      }
    });

    if (!sdpResponse.ok) {
      throw new Error(await sdpResponse.text());
    }

    await peer.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text()
    });
  }

  function upsertTranscript(nextTurn: Omit<TranscriptTurn, "createdAt">) {
    if (nextTurn.final && nextTurn.text.trim() && projectMemory.autosaveTranscript) {
      void saveStorageEvent("transcript_turn", {
        turn: nextTurn,
        projectMemory: buildPublicProjectMemory(projectMemory, memoryAttachments)
      });
    }

    setTranscriptTurns((current) => {
      const createdAt = new Date().toISOString();
      const existingIndex = current.findIndex((turn) => turn.id === nextTurn.id);
      const next = [...current];

      if (existingIndex >= 0) {
        next[existingIndex] = {
          ...next[existingIndex],
          ...nextTurn,
          createdAt: next[existingIndex].createdAt
        };
      } else {
        next.push({
          ...nextTurn,
          createdAt
        });
      }

      return orderTranscript(next).slice(-24);
    });
  }

  function appendTranscriptDraft(itemId: string, delta: string) {
    setTranscriptTurns((current) => {
      const existing = current.find((turn) => turn.id === itemId);
      if (!existing) {
        return [
          ...current,
          {
            id: itemId,
            previousId: null,
            text: "",
            draft: delta,
            createdAt: new Date().toISOString(),
            final: false
          }
        ];
      }

      return current.map((turn) =>
        turn.id === itemId ? { ...turn, draft: `${turn.draft}${delta}` } : turn
      );
    });
  }

  function startMeter(stream: MediaStream) {
    stopMeter();

    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      return;
    }

    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    audioContextRef.current = context;
    mediaSourceRef.current = source;

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = sample - 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      setAudioLevel(Math.min(100, Math.round((rms / 64) * 100)));
      meterFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }

  function stopEverything(nextStatus: RuntimeStatus) {
    if (analyzeTimerRef.current) {
      window.clearTimeout(analyzeTimerRef.current);
    }

    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    stopCaptureMix();
    stopMeter();

    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    setSpeechActive(false);
    setAudioLevel(0);
    setStatus(nextStatus);
  }

  function stopCaptureMix() {
    const mix = captureMixRef.current;
    if (!mix) {
      return;
    }

    mix.inputStreams.forEach((inputStream) => {
      inputStream.getTracks().forEach((track) => track.stop());
    });
    void mix.context.close();
    captureMixRef.current = null;
  }

  function stopMeter() {
    if (meterFrameRef.current) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }

    mediaSourceRef.current?.disconnect();
    mediaSourceRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }
}
