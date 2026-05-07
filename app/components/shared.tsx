"use client";

import { useId } from "react";
import type { PersonaId } from "@/lib/personas";
import { getPersona } from "@/lib/personas";
import {
  BadgeCheck,
  Laugh,
  MessageCircle,
  Music2,
  Newspaper,
} from "lucide-react";

/* ── Persona Icon (type icon for header) ── */
export function PersonaIcon({ personaId }: { personaId: PersonaId }) {
  const iconProps = { size: 19, strokeWidth: 2.2 };
  switch (personaId) {
    case "fact-checker":
      return <BadgeCheck {...iconProps} />;
    case "comedy-writer":
      return <Laugh {...iconProps} />;
    case "news-update":
      return <Newspaper {...iconProps} />;
    case "cynical-commentary":
      return <MessageCircle {...iconProps} />;
  }
}

/* ── Persona Avatar (CAD-style robot face) ── */
export function PersonaAvatar({
  personaId,
  size = "large",
}: {
  personaId: PersonaId;
  size?: "tiny" | "small" | "large";
}) {
  const persona = getPersona(personaId);
  const gradientId = useId().replace(/:/g, "");

  return (
    <span
      className={`cad-avatar ${size}`}
      style={
        {
          "--persona-color": persona.color,
          "--persona-accent": persona.accent,
        } as React.CSSProperties
      }
      title={`${persona.role} avatar`}
    >
      <svg
        aria-hidden="true"
        className="cad-avatar-svg"
        focusable="false"
        viewBox="0 0 96 96"
      >
        <defs>
          <linearGradient id={gradientId} x1="18" x2="78" y1="12" y2="84">
            <stop offset="0" stopColor="white" stopOpacity="0.88" />
            <stop
              offset="0.55"
              stopColor="var(--persona-accent)"
              stopOpacity="0.95"
            />
            <stop
              offset="1"
              stopColor="var(--persona-color)"
              stopOpacity="0.88"
            />
          </linearGradient>
        </defs>
        <path
          className="cad-grid"
          d="M18 18h60M18 34h60M18 50h60M18 66h60M18 82h60M18 18v64M34 18v64M50 18v64M66 18v64M82 18v64"
        />
        <path
          className="cad-outline"
          d="M31 21h34l13 13v28L64 78H32L18 62V35z"
        />
        <path
          className="cad-face"
          d="M30 24h35l10 11v27L63 75H33L21 62V36z"
          fill={`url(#${gradientId})`}
        />
        <path
          className="cad-panel"
          d="M33 39h30l5 6v16l-6 7H34l-6-7V45z"
        />
        <circle className="cad-eye" cx="39" cy="53" r="3.6" />
        <circle className="cad-eye" cx="57" cy="53" r="3.6" />
        <path className="cad-mouth" d="M40 63c4 4 12 4 16 0" />
        <path className="cad-antenna" d="M48 24V13M41 13h14" />
        <PersonaAvatarDetail personaId={personaId} />
        <path
          className="cad-scanner"
          d="M-12,31 C-7,23 -2,23 3,31 C8,39 13,39 18,31 C23,23 28,23 33,31 C38,39 43,39 48,31 C53,23 58,23 63,31 C68,39 73,39 78,31 C83,23 88,23 93,31 C98,39 103,39 108,31"
        />
      </svg>
      <span className="cad-avatar-label">{persona.initials}</span>
    </span>
  );
}

/* ── Persona Avatar Detail (per-persona SVG decorations) ── */
function PersonaAvatarDetail({ personaId }: { personaId: PersonaId }) {
  switch (personaId) {
    case "fact-checker":
      return (
        <g className="cad-detail">
          <circle cx="70" cy="29" r="8" />
          <path d="m76 35 7 7" />
          <path d="m66 28 3 3 6-7" />
          <path d="M25 31h12M25 35h8" />
        </g>
      );
    case "comedy-writer":
      return (
        <g className="cad-detail">
          <path d="M25 31c5-6 13-6 18 0" />
          <path d="M53 31c5-6 13-6 18 0" />
          <path d="M34 69c8 8 20 8 28 0" />
          <path d="m73 44 3-6 3 6 6 3-6 3-3 6-3-6-6-3z" />
        </g>
      );
    case "news-update":
      return (
        <g className="cad-detail">
          <rect height="20" rx="3" width="25" x="59" y="25" />
          <path d="M64 31h15M64 37h10M25 29c10-6 24-6 34 0M27 75c9 5 23 5 32 0" />
          <path d="M48 24c-7 12-7 39 0 52M48 24c7 12 7 39 0 52" />
        </g>
      );
    case "cynical-commentary":
      return (
        <g className="cad-detail">
          <path d="M31 45h15M51 45h15" />
          <path d="m33 41 11 5M63 41l-11 5" />
          <path d="M38 68c5-5 15-5 20 0" />
          <path d="m71 26 7 7-7 7-7-7z" />
          <path d="M68 33h6" />
        </g>
      );
  }
}

/* ── Flow Icon ── */
export type FlowStepId =
  | "listen"
  | "transcribe"
  | "route"
  | "reason"
  | "publish"
  | "clip"
  | "store";

import {
  Radio,
  ScanLine,
  Waypoints,
  Workflow,
  Sparkles,
  Scissors,
  Database,
} from "lucide-react";

export function FlowIcon({ id }: { id: FlowStepId }) {
  const iconProps = { size: 18, strokeWidth: 2.3 };
  switch (id) {
    case "listen":
      return <Radio {...iconProps} />;
    case "transcribe":
      return <ScanLine {...iconProps} />;
    case "route":
      return <Waypoints {...iconProps} />;
    case "reason":
      return <Workflow {...iconProps} />;
    case "publish":
      return <Sparkles {...iconProps} />;
    case "clip":
      return <Scissors {...iconProps} />;
    case "store":
      return <Database {...iconProps} />;
  }
}

/* ── Glass Notification ── */
import type { PersonaCard } from "@/lib/personas";
import { formatTime } from "@/app/utils/format";

export function GlassNotification({ card }: { card: PersonaCard }) {
  const persona = getPersona(card.persona);

  return (
    <article
      className="glass-notification"
      style={
        {
          "--persona-color": persona.color,
          "--persona-accent": persona.accent,
        } as React.CSSProperties
      }
    >
      <PersonaAvatar personaId={card.persona} size="tiny" />
      <div className="notification-body">
        <div className="notification-titleline">
          <h3>{persona.shortRole}</h3>
          <time>{formatTime(card.createdAt)}</time>
        </div>
        <p>{card.text}</p>
      </div>
    </article>
  );
}
