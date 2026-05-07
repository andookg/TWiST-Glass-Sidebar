"use client";

import { Component, type ReactNode } from "react";
import { Info, RotateCcw } from "lucide-react";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "grid",
            gap: "12px",
            padding: "24px",
            border: "1px solid rgba(219, 98, 98, 0.42)",
            borderRadius: "8px",
            background: "rgba(255, 236, 236, 0.72)",
            backdropFilter: "blur(28px) saturate(170%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Info size={20} />
            <strong>
              {this.props.fallbackTitle ?? "Something went wrong"}
            </strong>
          </div>
          <p style={{ margin: 0, color: "#7f2228", fontSize: "0.88rem" }}>
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 14px",
              border: "1px solid rgba(219, 98, 98, 0.3)",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.6)",
              cursor: "pointer",
              fontSize: "0.86rem",
              fontWeight: 700,
            }}
          >
            <RotateCcw size={15} />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
