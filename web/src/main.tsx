import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme.css";

/** Last line of defence: an unexpected error shows a message instead of a blank page. */
class ErrorBoundary extends Component<{ readonly children: ReactNode }, { readonly message: string | null }> {
  override state = { message: null as string | null };

  static getDerivedStateFromError(e: unknown): { message: string } {
    return { message: e instanceof Error ? e.message : String(e) };
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <main className="notice" role="alert">
        Something went wrong: {this.state.message}. Reload the page to start again.
      </main>
    );
  }
}

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
