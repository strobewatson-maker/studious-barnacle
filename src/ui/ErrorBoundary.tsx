import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { clearPersisted } from "../engine/settings";
import { Logo } from "./chrome";

export class FahhErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Fahh MIDI unhandled error:", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-bg flex h-full items-center justify-center p-6">
        <div className="glass w-full max-w-[560px] rounded-3xl p-8">
          <div className="mb-5 flex items-center gap-4">
            <Logo size={44} />
            <div>
              <h1 className="serif text-[28px] font-bold leading-none text-bone-50">Fahh MIDI hit a snag</h1>
              <p className="mt-1.5 text-[12px] text-bone-500">Something unexpected happened — your files are untouched.</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-2xl border border-red-400/25 bg-red-500/[0.07] p-4">
            <AlertTriangle size={18} className="mt-0.5 flex-none text-red-300" />
            <pre className="scroll max-h-48 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] text-red-100/90">{this.state.error.message}</pre>
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <button className="btn btn-brass !h-10" onClick={() => (window.location.href = window.location.pathname)}>
              <RotateCcw size={15} /> Reload
            </button>
            <button
              className="btn !h-10"
              title="Clears your saved settings, in case a bad value caused the problem"
              onClick={() => {
                clearPersisted();
                window.location.href = window.location.pathname;
              }}
            >
              <Trash2 size={15} /> Reset saved settings &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
