"use client";

import { useCallback, useRef, useState } from "react";

import type { RuntimeStatus } from "./use-audio-capture";

export type TranscriptTurn = {
  id: string;
  previousId: string | null;
  text: string;
  draft: string;
  createdAt: string;
  final: boolean;
};

export function useRealtimeTranscription(deps: {
  setStatus: (status: RuntimeStatus) => void;
  setSpeechActive: (active: boolean) => void;
  setErrorMessage: (msg: string) => void;
  onFinalTurn?: (turn: TranscriptTurn) => void;
}) {
  const { setStatus, setSpeechActive, setErrorMessage, onFinalTurn } = deps;

  const [transcriptTurns, setTranscriptTurns] = useState<TranscriptTurn[]>([]);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);

  const hasFinalTranscript = transcriptTurns.some(
    (turn) => turn.final && turn.text.trim().length > 0
  );

  const transcriptWindow = transcriptTurns
    .filter((turn) => turn.final && turn.text.trim())
    .slice(-6)
    .map((turn) => turn.text.trim())
    .join("\n");

  /* ── upsert a transcript turn ── */
  const upsertTranscript = useCallback(
    (nextTurn: Omit<TranscriptTurn, "createdAt">) => {
      setTranscriptTurns((current) => {
        const createdAt = new Date().toISOString();
        const existingIndex = current.findIndex(
          (turn) => turn.id === nextTurn.id
        );
        const next = [...current];

        if (existingIndex >= 0) {
          next[existingIndex] = {
            ...next[existingIndex],
            ...nextTurn,
            createdAt: next[existingIndex].createdAt,
          };
        } else {
          next.push({ ...nextTurn, createdAt });
        }

        const ordered = orderTranscript(next).slice(-24);

        // Notify about final turns
        if (nextTurn.final && nextTurn.text.trim()) {
          const fullTurn = ordered.find((t) => t.id === nextTurn.id);
          if (fullTurn) onFinalTurn?.(fullTurn);
        }

        return ordered;
      });
    },
    [onFinalTurn]
  );

  /* ── append a draft delta ── */
  const appendTranscriptDraft = useCallback(
    (itemId: string, delta: string) => {
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
              final: false,
            },
          ];
        }
        return current.map((turn) =>
          turn.id === itemId
            ? { ...turn, draft: `${turn.draft}${delta}` }
            : turn
        );
      });
    },
    []
  );

  /* ── handle incoming realtime events ── */
  const handleRealtimeEvent = useCallback(
    (event: Record<string, unknown>) => {
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
          final: false,
        });
        return;
      }

      if (type.includes("input_audio_transcription.delta") && itemId) {
        const delta = String(event.delta ?? "");
        if (delta) appendTranscriptDraft(itemId, delta);
        return;
      }

      if (type.includes("input_audio_transcription.completed") && itemId) {
        const transcript = String(
          event.transcript ?? event.text ?? ""
        ).trim();
        if (transcript) {
          upsertTranscript({
            id: itemId,
            previousId: getPreviousItemId(event),
            text: transcript,
            draft: "",
            final: true,
          });
        }
        setSpeechActive(false);
        return;
      }

      if (type.includes("input_audio_transcription.failed")) {
        setErrorMessage(
          "Realtime transcription failed for one speech turn."
        );
      }
    },
    [appendTranscriptDraft, setErrorMessage, setSpeechActive, upsertTranscript]
  );

  /* ── connect WebRTC ── */
  const connectRealtime = useCallback(
    async (stream: MediaStream) => {
      const tokenResponse = await fetch("/api/realtime/session", {
        method: "POST",
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
        throw new Error(
          "Realtime session did not return a client secret."
        );
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

      const sdpResponse = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          body: peer.localDescription?.sdp ?? offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            "Content-Type": "application/sdp",
          },
        }
      );

      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text());
      }

      await peer.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    },
    [handleRealtimeEvent, setErrorMessage, setStatus]
  );

  /* ── cleanup ── */
  const disconnectRealtime = useCallback(() => {
    channelRef.current?.close();
    peerRef.current?.close();
    channelRef.current = null;
    peerRef.current = null;
  }, []);

  /* ── clear ── */
  const clearTranscript = useCallback(() => {
    setTranscriptTurns([]);
  }, []);

  return {
    transcriptTurns,
    transcriptWindow,
    hasFinalTranscript,
    upsertTranscript,
    connectRealtime,
    disconnectRealtime,
    handleRealtimeEvent,
    clearTranscript,
    peerRef,
    channelRef,
  } as const;
}

/* ── Helpers ── */

export function extractClientSecret(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const topLevel = (payload as { value?: unknown }).value;
  if (typeof topLevel === "string") return topLevel;

  const sessionSecret = (
    payload as { session?: { client_secret?: { value?: unknown } } }
  ).session?.client_secret?.value;
  if (typeof sessionSecret === "string") return sessionSecret;

  const nestedSecret = (
    payload as { client_secret?: { value?: unknown } }
  ).client_secret?.value;
  return typeof nestedSecret === "string" ? nestedSecret : "";
}

export function getEventItemId(event: Record<string, unknown>) {
  const itemId = event.item_id;
  if (typeof itemId === "string") return itemId;

  const item = event.item;
  if (
    item &&
    typeof item === "object" &&
    typeof (item as { id?: unknown }).id === "string"
  ) {
    return (item as { id: string }).id;
  }
  return "";
}

export function getPreviousItemId(event: Record<string, unknown>) {
  const previousItemId = event.previous_item_id;
  return typeof previousItemId === "string" ? previousItemId : null;
}

export function orderTranscript(turns: TranscriptTurn[]) {
  const children = new Map<string, TranscriptTurn[]>();
  const root = "__root__";

  for (const turn of turns) {
    const key = turn.previousId ?? root;
    const group = children.get(key) ?? [];
    group.push(turn);
    children.set(key, group);
  }

  for (const group of children.values()) {
    group.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const ordered: TranscriptTurn[] = [];
  const seen = new Set<string>();

  const visit = (previousId: string) => {
    const group = children.get(previousId) ?? [];
    for (const turn of group) {
      if (seen.has(turn.id)) continue;
      seen.add(turn.id);
      ordered.push(turn);
      visit(turn.id);
    }
  };

  visit(root);

  for (const turn of turns) {
    if (!seen.has(turn.id)) ordered.push(turn);
  }

  return ordered;
}

export function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, 1800);

    function done() {
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      resolve();
    }

    function onStateChange() {
      if (peer.iceGatheringState === "complete") done();
    }

    peer.addEventListener("icegatheringstatechange", onStateChange);
  });
}
