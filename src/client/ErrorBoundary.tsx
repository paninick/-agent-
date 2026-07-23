/**
 * client/ErrorBoundary.tsx - React Error Boundary
 *
 * Catches uncaught rendering errors in the component tree, displays a
 * fallback UI instead of a blank screen, and allows the user to retry.
 * Logs the error to console for debugging (no external telemetry).
 */
import React from "react";
import { AlertCircle } from "lucide-react/dist/esm/lucide-react.mjs";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || "未知错误" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to console for debugging — no external telemetry/reporting.
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" role="alert">
          <AlertCircle size={32} aria-hidden="true" />
          <h2>页面渲染出错</h2>
          <p className="error-boundary-message">{this.state.message}</p>
          <button
            className="primary"
            type="button"
            onClick={this.handleReset}
            aria-label="重试渲染"
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}