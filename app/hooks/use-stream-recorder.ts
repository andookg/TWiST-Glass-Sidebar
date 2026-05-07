"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecordingKind = "show" | "enhanced" | null;

const RECORDER_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

export function useStreamRecorder() {
  const [recordingKind, setRecordingKind] = useState<RecordingKind>(null);
  const [error, setError] = useState<string>("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ownedStreamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    ownedStreamRef.current?.getTracks().forEach((track) => track.stop());
    ownedStreamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanup();
      setRecordingKind(null);
      return;
    }
    recorder.stop();
  }, [cleanup]);

  const beginRecording = useCallback(
    (stream: MediaStream, kind: Exclude<RecordingKind, null>, ownsStream: boolean) => {
      const mimeType = pickMimeType();
      if (!mimeType) {
        setError("This browser does not support MediaRecorder webm output.");
        if (ownsStream) stream.getTracks().forEach((track) => track.stop());
        return;
      }

      chunksRef.current = [];
      ownedStreamRef.current = ownsStream ? stream : null;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${kind}-stream-${stamp}.webm`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        cleanup();
        setRecordingKind(null);
      });

      // Stop recording if user closes the captured tab/window
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => stop(), { once: true });
      });

      recorderRef.current = recorder;
      recorder.start(1000);
      setError("");
      setRecordingKind(kind);
    },
    [cleanup, stop]
  );

  const startShow = useCallback(
    (stream: MediaStream | null) => {
      if (!stream || stream.getTracks().length === 0) {
        setError("Press Start to capture a show stream first, then record.");
        return;
      }
      beginRecording(stream, "show", false);
    },
    [beginRecording]
  );

  const startEnhanced = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      beginRecording(stream, "enhanced", true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to capture enhanced view.";
      setError(message);
    }
  }, [beginRecording]);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
      cleanup();
    };
  }, [cleanup]);

  return {
    recordingKind,
    error,
    startShow,
    startEnhanced,
    stop,
    isRecording: recordingKind !== null,
  } as const;
}
