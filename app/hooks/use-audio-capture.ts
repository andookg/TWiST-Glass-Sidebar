"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CaptureMode = "tab" | "mic" | "both";
export type RuntimeStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "reconnecting"
  | "stopped"
  | "error";

export const STATUS_COPY: Record<RuntimeStatus, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  reconnecting: "Reconnecting",
  stopped: "Stopped",
  error: "Needs attention",
};

export function useAudioCapture() {
  const [captureMode, setCaptureMode] = useState<CaptureMode>("tab");
  const [status, setStatus] = useState<RuntimeStatus>("idle");
  const [speechActive, setSpeechActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const isRunning =
    status === "connecting" ||
    status === "listening" ||
    status === "reconnecting";

  const hasVideo = Boolean(streamRef.current?.getVideoTracks().length);

  /* ── audio level meter ── */
  const stopMeter = useCallback(() => {
    if (meterFrameRef.current) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    mediaSourceRef.current?.disconnect();
    mediaSourceRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  const startMeter = useCallback(
    (stream: MediaStream) => {
      stopMeter();

      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextCtor) return;

      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(
        new MediaStream(stream.getAudioTracks())
      );
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
    },
    [stopMeter]
  );

  /* ── stop everything ── */
  const stopEverything = useCallback(
    (nextStatus: RuntimeStatus) => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopMeter();
      streamRef.current = null;
      setSpeechActive(false);
      setAudioLevel(0);
      setStatus(nextStatus);
    },
    [stopMeter]
  );

  /* ── get capture stream ── */
  const getCaptureStream = useCallback((mode: CaptureMode) => {
    if (mode === "mic") {
      return navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    }

    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  }, []);

  /* ── start capture ── */
  const startCapture = useCallback(async () => {
    setStatus("connecting");

    const stream = await getCaptureStream(captureMode);
    const audioTrack = stream.getAudioTracks()[0];

    if (!audioTrack) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        "No audio track was shared. Choose a browser tab and enable tab audio."
      );
    }

    stream.getTracks().forEach((track) => {
      track.addEventListener(
        "ended",
        () => stopEverything("stopped"),
        { once: true }
      );
    });

    streamRef.current = stream;
    startMeter(stream);
    return stream;
  }, [captureMode, getCaptureStream, startMeter, stopEverything]);

  /* ── stop capture ── */
  const stopCapture = useCallback(() => {
    stopEverything("stopped");
  }, [stopEverything]);

  /* ── sync video element ── */
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || stream.getVideoTracks().length === 0) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [status]);

  /* ── cleanup on unmount ── */
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopMeter();
    };
  }, [stopMeter]);

  return {
    captureMode,
    setCaptureMode,
    status,
    setStatus,
    speechActive,
    setSpeechActive,
    audioLevel,
    isRunning,
    hasVideo,
    videoRef,
    streamRef,
    startCapture,
    stopCapture,
    stopEverything,
  } as const;
}
