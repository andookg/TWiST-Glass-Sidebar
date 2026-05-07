import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

export type ClipPriority = "high" | "medium" | "low";

export type ClipCompositionProps = {
  clipId: string;
  title: string;
  hook: string;
  transcriptQuote: string;
  reason: string;
  tags: string[];
  brollIdeas: string[];
  captionBeats: string[];
  priority: ClipPriority;
  sourceLabel: string;
  accent: string;
};

export const defaultClipProps: ClipCompositionProps = {
  clipId: "clip-demo-1",
  title: "Claim Check: AI Can Fact-Check A Podcast Live",
  hook: "The question everyone will want answered: can the sidebar catch facts as the hosts talk?",
  transcriptQuote:
    "One guest claims a new AI audio model can fact-check a podcast in real time while the producer asks for a quick joke about startup demo days.",
  reason:
    "High-signal clip: clear AI demo claim, social-friendly hook, and a visible sidebar action.",
  tags: ["fact", "ai", "podcast", "clip"],
  brollIdeas: [
    "live waveform with glass captions",
    "claim-check lower third",
    "AI sidebar card overlay"
  ],
  captionBeats: [
    "A guest makes a live AI claim.",
    "The sidebar spots the moment.",
    "A render bot turns it into a social clip."
  ],
  priority: "high",
  sourceLabel: "TWiST Glass Sidebar",
  accent: "#7fb8d8"
};

export const ClipComposition = (props: Partial<ClipCompositionProps>) => {
  const data = normalizeProps(props);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({
    fps,
    frame,
    config: {
      damping: 18,
      stiffness: 90
    }
  });
  const glow = interpolate(frame, [0, durationInFrames], [0.18, 0.46], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const activeBeat = Math.min(
    data.captionBeats.length - 1,
    Math.floor((frame / Math.max(1, durationInFrames)) * data.captionBeats.length)
  );

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(160deg, #f9faf4 0%, #e8edf0 42%, #f6eddd 100%)",
        color: "#17191f",
        fontFamily:
          "SF Pro Display, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        overflow: "hidden"
      }}
    >
      <AbsoluteFill
        style={{
          opacity: glow,
          background: `radial-gradient(circle at 24% 18%, ${data.accent} 0%, transparent 30%), radial-gradient(circle at 78% 72%, #9fc6aa 0%, transparent 30%)`
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 54,
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          gap: 34,
          transform: `translateY(${interpolate(enter, [0, 1], [28, 0])}px)`,
          opacity: 0.24 + enter * 0.76
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 18px",
              border: "1px solid rgba(255,255,255,0.72)",
              borderRadius: 24,
              background: "rgba(255,255,255,0.58)",
              boxShadow: "0 18px 48px rgba(82,87,103,0.18)",
              backdropFilter: "blur(24px) saturate(180%)"
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 18,
                background: data.accent,
                boxShadow: `0 0 0 9px ${data.accent}22`
              }}
            />
            <span style={{ fontSize: 30, fontWeight: 860, letterSpacing: 0 }}>
              {data.sourceLabel}
            </span>
          </div>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 20,
              color: "#10131a",
              background:
                data.priority === "high"
                  ? "linear-gradient(135deg, #fff8ea, #edbd76)"
                  : "rgba(255,255,255,0.62)",
              fontSize: 24,
              fontWeight: 900,
              textTransform: "uppercase"
            }}
          >
            {data.priority}
          </div>
        </header>

        <main
          style={{
            display: "grid",
            alignContent: "center",
            gap: 32
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 22,
              padding: 34,
              border: "1px solid rgba(255,255,255,0.74)",
              borderRadius: 34,
              background: "rgba(255,255,255,0.58)",
              boxShadow: "0 28px 78px rgba(82,87,103,0.2)",
              backdropFilter: "blur(30px) saturate(190%)"
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 76,
                fontWeight: 920,
                letterSpacing: 0,
                lineHeight: 0.96
              }}
            >
              {data.title}
            </h1>
            <p
              style={{
                margin: 0,
                color: "#3d4149",
                fontSize: 38,
                fontWeight: 740,
                lineHeight: 1.12
              }}
            >
              {data.hook}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 20,
              padding: 28,
              border: "1px solid rgba(255,255,255,0.68)",
              borderRadius: 28,
              background: "rgba(255,255,255,0.48)",
              backdropFilter: "blur(24px) saturate(170%)"
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#17191f",
                fontSize: 40,
                fontWeight: 820,
                lineHeight: 1.18
              }}
            >
              "{data.captionBeats[activeBeat]}"
            </p>
            <p
              style={{
                margin: 0,
                color: "#555962",
                fontSize: 28,
                lineHeight: 1.28
              }}
            >
              {data.transcriptQuote}
            </p>
          </div>
        </main>

        <footer
          style={{
            display: "grid",
            gap: 18
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {data.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "10px 14px",
                  border: "1px solid rgba(255,255,255,0.66)",
                  borderRadius: 18,
                  background: "rgba(255,255,255,0.52)",
                  color: "#343840",
                  fontSize: 24,
                  fontWeight: 820
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14
            }}
          >
            <FooterPanel title="Why it clips" value={data.reason} />
            <FooterPanel title="B-roll" value={data.brollIdeas.slice(0, 3).join(" / ")} />
          </div>
        </footer>
      </div>
    </AbsoluteFill>
  );
};

function FooterPanel({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        minHeight: 138,
        padding: 20,
        border: "1px solid rgba(255,255,255,0.66)",
        borderRadius: 24,
        background: "rgba(255,255,255,0.46)",
        backdropFilter: "blur(22px) saturate(170%)"
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          color: "#6b6f77",
          fontSize: 22,
          fontWeight: 900,
          textTransform: "uppercase"
        }}
      >
        {title}
      </p>
      <p
        style={{
          margin: 0,
          color: "#252933",
          fontSize: 26,
          fontWeight: 680,
          lineHeight: 1.22
        }}
      >
        {value}
      </p>
    </div>
  );
}

function normalizeProps(props: Partial<ClipCompositionProps>): ClipCompositionProps {
  return {
    ...defaultClipProps,
    ...props,
    tags: normalizeList(props.tags, defaultClipProps.tags).slice(0, 5),
    brollIdeas: normalizeList(props.brollIdeas, defaultClipProps.brollIdeas).slice(0, 4),
    captionBeats: normalizeList(props.captionBeats, defaultClipProps.captionBeats).slice(0, 4),
    accent: typeof props.accent === "string" && props.accent ? props.accent : defaultClipProps.accent,
    priority:
      props.priority === "medium" || props.priority === "low" || props.priority === "high"
        ? props.priority
        : defaultClipProps.priority
  };
}

function normalizeList(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback;
}
