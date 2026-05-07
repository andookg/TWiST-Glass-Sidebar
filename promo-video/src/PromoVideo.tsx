import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate, Img, staticFile } from "remotion";
import React from "react";

export const PromoVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Audio src={staticFile("voiceover.wav")} />

      {/* Intro (0 - 4.5s) */}
      <Sequence from={0} durationInFrames={135}>
        <IntroScene />
      </Sequence>

      {/* Architecture (4.5s - 10s) */}
      <Sequence from={135} durationInFrames={165}>
        <ArchitectureScene />
      </Sequence>

      {/* UI & Personas (10s - 16s) */}
      <Sequence from={300} durationInFrames={180}>
        <PersonasScene />
      </Sequence>

      {/* Clip Studio (16s - 20s) */}
      <Sequence from={480} durationInFrames={120}>
        <ClipStudioScene />
      </Sequence>

      {/* Outro (20s - 25s) */}
      <Sequence from={600} durationInFrames={200}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};

const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const scale = spring({
    fps,
    frame,
    config: { damping: 12 },
  });
  
  const opacity = interpolate(frame, [0, 15, 120, 135], [0, 1, 1, 0]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>
      <div style={{ transform: `scale(${scale})`, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
        <h1 className="heading-1" style={{ color: "var(--primary-accent)" }}>TWiST Glass Sidebar</h1>
        <h2 className="heading-2">Real-time AI Podcast Companion</h2>
      </div>
    </AbsoluteFill>
  );
};

const ArchitectureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 150, 165], [0, 1, 1, 0]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>
      <div className="glass-panel" style={{ display: "flex", flexDirection: "row", gap: "64px", alignItems: "center" }}>
        <FlowStep icon="🎙️" title="Browser Audio" frame={frame} delay={10} />
        <FlowArrow frame={frame} delay={20} />
        <FlowStep icon="⚡" title="OpenAI Realtime" frame={frame} delay={30} />
        <FlowArrow frame={frame} delay={40} />
        <FlowStep icon="🤖" title="5 AI Personas" frame={frame} delay={50} />
      </div>
    </AbsoluteFill>
  );
};

const PersonasScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 165, 180], [0, 1, 1, 0]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "48px", width: "80%" }}>
        <h2 className="heading-2" style={{ textAlign: "center" }}>Glass-morphism UI</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", justifyContent: "center" }}>
          <PersonaCard name="Fact Checker" emoji="✅" color="var(--success)" frame={frame} delay={10} />
          <PersonaCard name="Comedy Writer" emoji="😂" color="var(--warning)" frame={frame} delay={25} />
          <PersonaCard name="News Update" emoji="📰" color="var(--primary-accent)" frame={frame} delay={40} />
          <PersonaCard name="Sound Context" emoji="🎵" color="#A855F7" frame={frame} delay={55} />
          <PersonaCard name="Cynical Commentary" emoji="🧐" color="var(--error)" frame={frame} delay={70} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ClipStudioScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 15, 105, 120], [0, 1, 1, 0]);
  
  const yOffset = spring({
    fps,
    frame,
    config: { damping: 14 },
    from: 100,
    to: 0,
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>
      <div className="card" style={{ transform: `translateY(${yOffset}px)`, textAlign: "center", display: "flex", flexDirection: "column", gap: "32px", padding: "64px" }}>
        <h1 className="heading-1">✂️ Clip Studio</h1>
        <p className="body-text">Seamless Remotion Handoff</p>
        <div className="primary-button" style={{ alignSelf: "center", marginTop: "24px" }}>
          Export MP4
        </div>
      </div>
    </AbsoluteFill>
  );
};

const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const scale = spring({
    fps,
    frame,
    config: { damping: 12 },
  });
  
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>
      <div style={{ transform: `scale(${scale})`, textAlign: "center", display: "flex", flexDirection: "column", gap: "32px" }}>
        <h1 className="heading-1">Podcast Production.</h1>
        <h1 className="heading-1" style={{ color: "var(--primary-accent)" }}>Elevated.</h1>
      </div>
    </AbsoluteFill>
  );
};

// --- Helper Components ---

const FlowStep: React.FC<{ icon: string; title: string; frame: number; delay: number }> = ({ icon, title, frame, delay }) => {
  const opacity = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const y = interpolate(frame - delay, [0, 15], [20, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", opacity, transform: `translateY(${y}px)` }}>
      <div style={{ fontSize: "64px", background: "var(--background)", padding: "24px", borderRadius: "24px", border: "1px solid var(--border)" }}>
        {icon}
      </div>
      <span className="body-text" style={{ fontWeight: 600 }}>{title}</span>
    </div>
  );
};

const FlowArrow: React.FC<{ frame: number; delay: number }> = ({ frame, delay }) => {
  const opacity = interpolate(frame - delay, [0, 10], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  return <div style={{ fontSize: "48px", opacity, color: "var(--text-secondary)" }}>→</div>;
};

const PersonaCard: React.FC<{ name: string; emoji: string; color: string; frame: number; delay: number }> = ({ name, emoji, color, frame, delay }) => {
  const opacity = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const scale = interpolate(frame - delay, [0, 15], [0.8, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  return (
    <div className="glass-panel" style={{ width: "250px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "16px", opacity, transform: `scale(${scale})`, borderLeft: `4px solid ${color}` }}>
      <span style={{ fontSize: "48px" }}>{emoji}</span>
      <h3 className="heading-2" style={{ fontSize: "24px" }}>{name}</h3>
      <div style={{ height: "4px", width: "40px", backgroundColor: color, borderRadius: "2px" }} />
    </div>
  );
};
