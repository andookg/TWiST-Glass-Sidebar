import {
  AbsoluteFill, Audio, Sequence,
  useCurrentFrame, useVideoConfig,
  spring, interpolate, staticFile,
} from "remotion";
import React, { useMemo } from "react";

// ─── Design tokens from design.md ──────────────────────────────────────────
const T = {
  bg:        "#000000",
  surface:   "#111111",
  border:    "#222222",
  accent:    "#0070F3",
  white:     "#FFFFFF",
  muted:     "#888888",
  purple:    "#A855F7",
  amber:     "#F5A623",
  red:       "#E00000",
  green:     "#22C55E",
};

// ─── Easing helpers ────────────────────────────────────────────────────────
const easedIn  = (f: number, dur = 18) => interpolate(f, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
const easedOut = (f: number, dur = 18) => interpolate(f, [0, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

// ─── Root ──────────────────────────────────────────────────────────────────
export const PromoVideo: React.FC = () => (
  <AbsoluteFill style={{ background: T.bg, fontFamily: "'Inter', sans-serif" }}>
    <Audio src={staticFile("voiceover.wav")} />

    {/* Persistent particle grid */}
    <ParticleGrid />

    {/* S1: Cold open – hook (0-3.5s) */}
    <Sequence durationInFrames={105}><SceneColdOpen /></Sequence>
    {/* S2: Waveform – listening (3.5-8s) */}
    <Sequence from={105} durationInFrames={135}><SceneWaveform /></Sequence>
    {/* S3: Pipeline (8-14s) */}
    <Sequence from={240} durationInFrames={180}><ScenePipeline /></Sequence>
    {/* S4: Persona cards waterfall (14-22s) */}
    <Sequence from={420} durationInFrames={240}><ScenePersonas /></Sequence>
    {/* S5: Live UI mockup (22-28s) */}
    <Sequence from={660} durationInFrames={180}><SceneUI /></Sequence>
    {/* S6: Clip Studio (28-32s) */}
    <Sequence from={840} durationInFrames={120}><SceneClipStudio /></Sequence>
    {/* S7: Agent + Security (32-44s) */}
    <Sequence from={960} durationInFrames={360}><SceneAgentSecurity /></Sequence>
    {/* S8: Outro (44-65s) */}
    <Sequence from={1320} durationInFrames={633}><SceneOutro /></Sequence>
  </AbsoluteFill>
);

// ─── Particle Grid ─────────────────────────────────────────────────────────
const ParticleGrid: React.FC = () => {
  const frame = useCurrentFrame();
  const dots = useMemo(() => {
    const result = [];
    for (let x = 0; x < 24; x++) for (let y = 0; y < 14; y++) {
      result.push({ x: x * 80 + 40, y: y * 80 + 40, phase: (x * 7 + y * 13) % 60 });
    }
    return result;
  }, []);

  return (
    <AbsoluteFill>
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
        {dots.map((d, i) => {
          const pulse = Math.sin((frame + d.phase) * 0.05) * 0.5 + 0.5;
          return <circle key={i} cx={d.x} cy={d.y} r={1.5} fill={T.border} opacity={pulse * 0.6} />;
        })}
        {/* Animated scan line */}
        <line
          x1={0} y1={(frame * 4) % 1080}
          x2={1920} y2={(frame * 4) % 1080}
          stroke={T.accent} strokeWidth={1} opacity={0.08}
        />
      </svg>
    </AbsoluteFill>
  );
};

// ─── Scene 1: Cold Open ────────────────────────────────────────────────────
const SceneColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn  = easedIn(frame, 20);
  const fadeOut = easedOut(frame - 85, 20);
  const opacity = Math.min(fadeIn, fadeOut);
  const titleY  = spring({ fps, frame, config: { damping: 14, stiffness: 80 } });
  const yOffset = interpolate(titleY, [0, 1], [60, 0]);
  const glow    = interpolate(frame, [0, 50, 105], [0, 1, 0.4]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>
      {/* Glow beam */}
      <div style={{
        position: "absolute", top: "20%", left: "50%",
        transform: "translateX(-50%)",
        width: 600, height: 600,
        background: `radial-gradient(circle, ${T.accent}33 0%, transparent 70%)`,
        opacity: glow, pointerEvents: "none",
      }} />
      <div style={{ textAlign: "center", transform: `translateY(${yOffset}px)` }}>
        <div style={{ fontSize: 22, letterSpacing: "0.3em", color: T.accent, marginBottom: 28, fontWeight: 600, textTransform: "uppercase" }}>
          Introducing
        </div>
        <div style={{
          fontSize: 110, fontWeight: 800, lineHeight: 1,
          background: `linear-gradient(135deg, ${T.white} 30%, ${T.accent} 100%)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          letterSpacing: "-0.03em",
        }}>
          TWiST Glass
        </div>
        <div style={{ fontSize: 110, fontWeight: 800, lineHeight: 1, color: T.white, letterSpacing: "-0.03em" }}>
          Sidebar
        </div>
        <div style={{ fontSize: 32, color: T.muted, marginTop: 32, fontWeight: 400 }}>
          Real-time AI companion for live podcasts
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Waveform Listener ────────────────────────────────────────────
const SceneWaveform: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn  = easedIn(frame, 20);
  const fadeOut = easedOut(frame - 115, 20);
  const opacity = Math.min(fadeIn, fadeOut);

  const bars = useMemo(() => Array.from({ length: 64 }, (_, i) => ({ i, phase: i * 0.4 })), []);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 64, opacity }}>
      <div style={{ fontSize: 36, color: T.muted, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
        Listening to your show
      </div>
      {/* Waveform */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: 160 }}>
        {bars.map(({ i, phase }) => {
          const h = Math.abs(Math.sin((frame * 0.12 + phase))) * 120 + 16;
          const accent = i > 24 && i < 40;
          return (
            <div key={i} style={{
              width: 10, height: h, borderRadius: 5,
              background: accent ? T.accent : `${T.white}40`,
            }} />
          );
        })}
      </div>
      {/* Live indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: `${T.white}08`, border: `1px solid ${T.border}`, borderRadius: 40, padding: "16px 32px" }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: T.red, boxShadow: `0 0 12px ${T.red}` }} />
        <span style={{ fontSize: 24, color: T.white, fontWeight: 600 }}>LIVE — Browser Audio Capture</span>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 3: Pipeline ─────────────────────────────────────────────────────
const PIPELINE = [
  { label: "Browser Audio",   sub: "Tab + Mic",          color: T.green,  icon: "🎙️" },
  { label: "OpenAI Realtime", sub: "WebRTC streaming",   color: T.accent, icon: "⚡" },
  { label: "Model Router",    sub: "OpenAI · OpenRouter", color: T.purple, icon: "⚙️" },
  { label: "4 AI Personas",   sub: "Parallel workers",   color: T.amber,  icon: "🧠" },
  { label: "Glass Cards",     sub: "Live on screen",     color: T.white,  icon: "✨" },
];

const ScenePipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn  = easedIn(frame, 20);
  const fadeOut = easedOut(frame - 160, 20);
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 64, opacity }}>
      <div style={{ fontSize: 52, fontWeight: 700, color: T.white }}>How it works</div>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {PIPELINE.map((step, i) => {
          const stepFrame = frame - i * 22;
          const pop = spring({ fps, frame: Math.max(0, stepFrame), config: { damping: 12 } });
          const sc  = interpolate(pop, [0, 1], [0.6, 1]);
          return (
            <React.Fragment key={i}>
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
                transform: `scale(${sc})`, opacity: pop,
              }}>
                <div style={{
                  width: 100, height: 100, borderRadius: 24,
                  background: `${step.color}18`,
                  border: `1px solid ${step.color}60`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 44,
                  boxShadow: `0 0 30px ${step.color}30`,
                }}>
                  {step.icon}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.white }}>{step.label}</div>
                  <div style={{ fontSize: 16, color: T.muted, marginTop: 4 }}>{step.sub}</div>
                </div>
              </div>
              {i < PIPELINE.length - 1 && (
                <div style={{
                  width: 80, height: 2, margin: "0 8px",
                  background: `linear-gradient(to right, ${PIPELINE[i].color}80, ${PIPELINE[i+1].color}80)`,
                  opacity: interpolate(frame - i * 22 - 10, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                  position: "relative", top: -24,
                }}>
                  {/* Animated dot */}
                  <div style={{
                    position: "absolute",
                    left: `${((frame * 4) % 80)}px`,
                    top: -4, width: 10, height: 10,
                    borderRadius: "50%", background: T.accent,
                    boxShadow: `0 0 12px ${T.accent}`,
                  }} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 4: Persona Cards ────────────────────────────────────────────────
const PERSONAS = [
  { name: "Fact Checker",       role: "Catches errors before you make them",      color: T.green,  emoji: "✅", tag: "VERIFY" },
  { name: "Comedy Writer",      role: "Drops one-liners straight to the feed",     color: T.amber,  emoji: "😄", tag: "COMEDY" },
  { name: "News Update",        role: "Scans what's breaking right now",           color: T.accent, emoji: "📰", tag: "LIVE NEWS" },
  { name: "Cynical Commentary", role: "Keeps the conversation sharp & honest",     color: T.red,    emoji: "🧐", tag: "SHARP" },
];

const ScenePersonas: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn  = easedIn(frame, 20);
  const fadeOut = easedOut(frame - 220, 20);
  const opacity = Math.min(fadeIn, fadeOut);
  const titleY  = spring({ fps, frame, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 56, opacity }}>
      <div style={{ transform: `translateY(${interpolate(titleY, [0,1], [40,0])}px)`, textAlign: "center" }}>
        <div style={{ fontSize: 52, fontWeight: 700, color: T.white }}>4 AI Minds. One Sidebar.</div>
        <div style={{ fontSize: 24, color: T.muted, marginTop: 12 }}>Parallel workers. Zero latency. Pure signal.</div>
      </div>
      <div style={{ display: "flex", gap: 28 }}>
        {PERSONAS.map((p, i) => {
          const delay = i * 18 + 15;
          const f = Math.max(0, frame - delay);
          const pop = spring({ fps, frame: f, config: { damping: 10, stiffness: 100 } });
          const hover = Math.sin(frame * 0.04 + i * 1.2) * 6;
          return (
            <div key={i} style={{
              width: 280, display: "flex", flexDirection: "column", gap: 20,
              background: `linear-gradient(160deg, ${p.color}12, ${T.surface}90)`,
              border: `1px solid ${p.color}40`,
              borderRadius: 20, padding: 28,
              transform: `scale(${pop}) translateY(${hover}px)`,
              opacity: pop,
              boxShadow: `0 24px 60px ${p.color}20`,
            }}>
              {/* Tag */}
              <div style={{
                alignSelf: "flex-start",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.15em",
                color: p.color, background: `${p.color}20`,
                borderRadius: 40, padding: "6px 14px",
              }}>
                {p.tag}
              </div>
              <div style={{ fontSize: 52 }}>{p.emoji}</div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: T.white }}>{p.name}</div>
                <div style={{ fontSize: 16, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>{p.role}</div>
              </div>
              <div style={{ height: 2, background: `linear-gradient(to right, ${p.color}, transparent)`, borderRadius: 1 }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 5: Live UI Mockup ───────────────────────────────────────────────
const TRANSCRIPT_LINES = [
  "...so the question is whether AI can actually replace the research team—",
  "I mean, the data from Q1 alone shows a 40% reduction in prep time—",
  "And Elon just tweeted about this literally 12 minutes ago—",
  "okay but who's fact-checking that number in real time—",
];

const SceneUI: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn  = easedIn(frame, 20);
  const fadeOut = easedOut(frame - 160, 20);
  const opacity = Math.min(fadeIn, fadeOut);
  const slideIn = spring({ fps, frame, config: { damping: 18 } });
  const labelX  = interpolate(slideIn, [0, 1], [60, 0]);
  const visibleLine = Math.min(TRANSCRIPT_LINES.length - 1, Math.floor(frame / 40));

  const cards = [
    { color: T.green,  icon: "✅", text: "40% reduction figure is confirmed by McKinsey 2025 report. Cite it." },
    { color: T.amber,  icon: "😄", text: "\"The AI heard that. And it's laughing.\" — great moment to drop." },
    { color: T.accent, icon: "📰", text: "Elon's tweet: AI research team announcement, posted 11 min ago." },
  ];

  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", gap: 0 }}>
        {/* Left: Transcript */}
        <div style={{
          flex: 1, padding: "60px 48px",
          borderRight: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column", gap: 24,
        }}>
          <div style={{ fontSize: 18, color: T.accent, letterSpacing: "0.2em", fontWeight: 700, textTransform: "uppercase" }}>Live Transcript</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {TRANSCRIPT_LINES.map((line, i) => (
              <div key={i} style={{
                fontSize: 22, lineHeight: 1.6,
                color: i === visibleLine ? T.white : T.muted,
                opacity: i <= visibleLine ? 1 : 0.2,
                borderLeft: i === visibleLine ? `3px solid ${T.accent}` : "3px solid transparent",
                paddingLeft: 20,
              }}>
                {line}
                {i === visibleLine && <span style={{ animation: "none", marginLeft: 2, color: T.accent }}>▋</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Persona cards streaming in */}
        <div style={{
          width: 520, padding: "60px 36px",
          display: "flex", flexDirection: "column", gap: 20,
          transform: `translateX(${labelX}px)`,
        }}>
          <div style={{ fontSize: 18, color: T.muted, letterSpacing: "0.2em", fontWeight: 700, textTransform: "uppercase" }}>AI Sidebar</div>
          {cards.map((card, i) => {
            const f = Math.max(0, frame - i * 30 - 20);
            const pop = spring({ fps, frame: f, config: { damping: 14 } });
            return (
              <div key={i} style={{
                background: `linear-gradient(135deg, ${card.color}12, ${T.surface})`,
                border: `1px solid ${card.color}40`,
                borderRadius: 16, padding: "20px 24px",
                transform: `scale(${pop})`,
                opacity: pop,
                boxShadow: `0 8px 32px ${card.color}18`,
              }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 28 }}>{card.icon}</span>
                  <div style={{ fontSize: 18, color: T.white, lineHeight: 1.5 }}>{card.text}</div>
                </div>
              </div>
            );
          })}
          {/* Analyzing indicator */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
            background: `${T.accent}10`, borderRadius: 12, border: `1px solid ${T.accent}30`,
            opacity: Math.abs(Math.sin(frame * 0.08)) * 0.6 + 0.4,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.accent, boxShadow: `0 0 10px ${T.accent}` }} />
            <span style={{ fontSize: 16, color: T.accent, fontWeight: 600 }}>Analyzing transcript…</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 6: Clip Studio ──────────────────────────────────────────────────
const SceneClipStudio: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn  = easedIn(frame, 20);
  const fadeOut = easedOut(frame - 100, 20);
  const opacity = Math.min(fadeIn, fadeOut);
  const slide   = spring({ fps, frame, config: { damping: 16 } });
  const y       = interpolate(slide, [0, 1], [80, 0]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>
      {/* Glow */}
      <div style={{
        position: "absolute", width: 800, height: 500,
        background: `radial-gradient(ellipse, ${T.purple}25 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{ transform: `translateY(${y}px)`, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        <div style={{ fontSize: 18, color: T.purple, letterSpacing: "0.25em", fontWeight: 700, textTransform: "uppercase" }}>Clip Studio</div>
        <div style={{ fontSize: 80, fontWeight: 800, color: T.white, letterSpacing: "-0.03em" }}>
          One Click.<br />
          <span style={{ color: T.purple }}>MP4 Ready.</span>
        </div>
        <div style={{ fontSize: 26, color: T.muted, maxWidth: 600 }}>
          Best moments detected. Remotion renders your clips. Drop straight into social.
        </div>
        {/* Mock export bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 20, marginTop: 8,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 16, padding: "20px 32px",
        }}>
          <div style={{ fontSize: 22, color: T.muted }}>✂️ best-moment-clip.mp4</div>
          <div style={{
            background: T.white, color: T.bg,
            fontWeight: 700, fontSize: 18,
            borderRadius: 10, padding: "12px 28px",
          }}>
            Export ↓
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 7: Agent + Security ────────────────────────────────────────────
const FEATURES = [
  { icon: "🤖", label: "Home Base Agent", sub: "Plug in your own agent — it's API-ready", color: T.accent },
  { icon: "⚙️",  label: "Fully Customizable", sub: "Models, personas, prompts, storage & UI", color: T.purple },
  { icon: "🔒", label: "Security First",     sub: "Keys server-side. Zero data without consent", color: T.green },
  { icon: "📦", label: "100% Open Source",   sub: "Fork it. Own it. Change everything.",        color: T.amber },
];

const SceneAgentSecurity: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn  = easedIn(frame, 20);
  const fadeOut = easedOut(frame - 340, 20);
  const opacity = Math.min(fadeIn, fadeOut);
  const titleSlide = spring({ fps, frame, config: { damping: 16, stiffness: 70 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 64, opacity }}>
      {/* Dual glow */}
      <div style={{ position: "absolute", width: 500, height: 500, top: "10%", left: "20%",
        background: `radial-gradient(circle, ${T.accent}20 0%, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 400, height: 400, bottom: "10%", right: "15%",
        background: `radial-gradient(circle, ${T.green}18 0%, transparent 70%)`, pointerEvents: "none" }} />

      <div style={{ textAlign: "center", transform: `translateY(${interpolate(titleSlide, [0,1], [50,0])}px)` }}>
        <div style={{ fontSize: 18, color: T.accent, letterSpacing: "0.25em", fontWeight: 700, textTransform: "uppercase", marginBottom: 20 }}>
          Built to be yours
        </div>
        <div style={{ fontSize: 64, fontWeight: 800, color: T.white, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          Download. Customize.<br />
          <span style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Make it your own.
          </span>
        </div>
      </div>

      {/* Feature cards */}
      <div style={{ display: "flex", gap: 28 }}>
        {FEATURES.map((f, i) => {
          const delay = i * 20 + 25;
          const pop = spring({ fps, frame: Math.max(0, frame - delay), config: { damping: 12, stiffness: 90 } });
          const float = Math.sin(frame * 0.04 + i * 1.4) * 5;
          return (
            <div key={i} style={{
              width: 320, padding: "28px 28px",
              background: `linear-gradient(150deg, ${f.color}14, ${T.surface}cc)`,
              border: `1px solid ${f.color}50`,
              borderRadius: 20,
              transform: `scale(${pop}) translateY(${float}px)`,
              opacity: pop,
              boxShadow: `0 20px 50px ${f.color}18`,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.white, marginBottom: 8 }}>{f.label}</div>
              <div style={{ fontSize: 16, color: T.muted, lineHeight: 1.5 }}>{f.sub}</div>
              <div style={{ marginTop: 20, height: 2,
                background: `linear-gradient(to right, ${f.color}, transparent)`, borderRadius: 1 }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 8: Outro ────────────────────────────────────────────────────────
const SceneOutro: React.FC = () => {

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = easedIn(frame, 25);
  const scale  = spring({ fps, frame, config: { damping: 18, stiffness: 60 } });
  const sc     = interpolate(scale, [0, 1], [0.88, 1]);
  const glow   = interpolate(frame, [0, 80], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fadeIn }}>
      <div style={{
        position: "absolute", width: 900, height: 700,
        background: `radial-gradient(ellipse, ${T.accent}20 0%, transparent 70%)`,
        opacity: glow,
      }} />
      <div style={{ transform: `scale(${sc})`, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <div style={{ fontSize: 22, color: T.accent, letterSpacing: "0.3em", fontWeight: 700, textTransform: "uppercase" }}>Open Source</div>
        <div style={{
          fontSize: 96, fontWeight: 800, lineHeight: 1,
          background: `linear-gradient(135deg, ${T.white} 0%, ${T.accent} 100%)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          letterSpacing: "-0.03em",
        }}>
          Podcast production.<br />Elevated.
        </div>
        <div style={{ fontSize: 28, color: T.muted }}>Runs locally. Ships globally.</div>
        <div style={{
          marginTop: 16, fontSize: 24, color: T.white,
          background: `${T.white}08`, border: `1px solid ${T.border}`,
          borderRadius: 12, padding: "18px 40px", fontWeight: 500, letterSpacing: "0.01em",
        }}>
          github.com/andookg/TWiST-Glass-Sidebar
        </div>
      </div>
    </AbsoluteFill>
  );
};
