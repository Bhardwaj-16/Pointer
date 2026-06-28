import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useConvexAuth } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { Login } from "./Login";
import "./App.css";

function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const token = useAuthToken();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);

  // Auto-resize textarea
  const handleInputResize = () => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  // Auto-scroll response box to bottom as tokens arrive
  useEffect(() => {
    if (responseRef.current && aiResponse) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [aiResponse]);

  // Listen for Rust activation event + window focus
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("pointer-activated", () => {
      setTimeout(() => inputRef.current?.focus(), 100);
    }).then(fn => { unlisten = fn; });

    const onFocus = () => inputRef.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      unlisten?.();
    };
  }, []);

  const handleClose = async () => {
    try { await invoke("hide_window"); }
    catch (e) { console.error("Failed to hide:", e); }
  };

  const handleSend = async () => {
    const val = inputRef.current?.value?.trim() ?? "";
    if (!val || isThinking) return;

    // Clear input immediately for fast, responsive feel
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }
    setIsThinking(true);
    setAiResponse("");

    try {
      if (!token) {
        setAiResponse("Error: Not authenticated. Please sign in again.");
        return;
      }

      const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string;
      console.log("[Pointer] Prompt dispatched → awaiting stream...");

      const response = await fetch(`${siteUrl}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: val }),
      });

      if (!response.ok || !response.body) {
        setAiResponse(`Error ${response.status}: Failed to connect to ORIGIN AI.`);
        return;
      }

      // First token received — swap thinking indicator for response box
      setIsThinking(false);
      console.log("[Pointer] Stream open — receiving tokens...");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Line-buffer to handle SSE chunks that split across reads
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") { console.log("[Pointer] Stream complete."); break; }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              accumulated += delta;
              setAiResponse(accumulated);
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } catch (err: any) {
      console.error("[Pointer] Streaming error:", err);
      setIsThinking(false);
      setAiResponse("Error: " + (err.message || "Failed to reach ORIGIN AI."));
    } finally {
      setIsThinking(false);
      // Re-focus for the next prompt
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  };

  // Show nothing during initial auth check (avoid flash)
  if (isLoading) return null;

  // Show login screen if not authenticated
  if (!isAuthenticated) return <Login />;

  return (
    <div className="container" data-tauri-drag-region>

      {/* ── Prompt input ── */}
      <div className="input-row" data-tauri-drag-region>
        <div className="icon-spark">
          <Sparkles size={22} strokeWidth={2.5} />
        </div>
        <textarea
          ref={inputRef}
          className="input-field"
          placeholder="Ask ORIGIN AI anything..."
          rows={1}
          onChange={handleInputResize}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            if (e.key === "Escape") handleClose();
          }}
        />
      </div>

      {/* ── "ORIGIN is thinking" — compact pulsing glass pill ── */}
      {isThinking && (
        <div className="thinking-box">
          <div className="thinking-dots">
            <span className="dot-pulse" style={{ animationDelay: "0ms" }} />
            <span className="dot-pulse" style={{ animationDelay: "160ms" }} />
            <span className="dot-pulse" style={{ animationDelay: "320ms" }} />
          </div>
          <span className="thinking-label">ORIGIN AI is thinking</span>
        </div>
      )}

      {/* ── Streaming response — appears as tokens arrive ── */}
      {aiResponse && (
        <div className="response-box" ref={responseRef}>
          <p className="response-text">{aiResponse}</p>
        </div>
      )}

      <div className="divider" />

      {/* ── Bottom bar ── */}
      <div className="bottom-row" data-tauri-drag-region>
        <div className="tags">
          <div className="tag">
            <Sparkles size={16} className="tag-icon" />
            <span>ORIGIN AI</span>
            <div className="dot-small"></div>
          </div>
        </div>

        <div className="actions">
          <button
            className="btn-send"
            onClick={handleSend}
            title="Send"
            disabled={isThinking}
          >
            {isThinking
              ? <Loader2 size={20} className="spin-icon" />
              : <Send size={20} style={{ marginLeft: "-2px", marginTop: "2px" }} />
            }
          </button>
          <button className="btn-close" onClick={handleClose} title="Close">
            <X size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
