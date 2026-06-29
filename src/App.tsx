import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useConvexAuth } from "convex/react";
import { useAuthToken, useAuthActions } from "@convex-dev/auth/react";
import { Sparkles, X, Send, Loader2, LogOut } from "lucide-react";
import { Login } from "./Login";
import "./App.css";

function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const token = useAuthToken();
  const { signOut } = useAuthActions();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [aiResponse, setAiResponse] = useState<string>("");
  // "idle" | "thinking" | "streaming"
  const [status, setStatus] = useState<"idle" | "thinking" | "streaming">("idle");

  // Auto-resize textarea (capped at 120px)
  const handleInputResize = () => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  // Auto-scroll to bottom of scroll area whenever response grows
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [aiResponse, status]);

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

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e) {
      console.error("Sign-out failed:", e);
    }
  };

  const handleSend = async () => {
    const val = inputRef.current?.value?.trim() ?? "";
    if (!val || status !== "idle") return;

    // ── /sign-out command ────────────────────────────────────────────
    if (val.toLowerCase() === "/sign-out") {
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.style.height = "auto";
      }
      await handleSignOut();
      return;
    }

    // Clear input immediately for snappy feel
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }
    setStatus("thinking");
    setAiResponse("");

    try {
      if (!token) {
        setAiResponse("Error: Not authenticated. Please sign in again.");
        setStatus("idle");
        return;
      }

      const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string;
      console.log("[Pointer] 📤 Prompt dispatched → awaiting NVIDIA stream...");

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
        setStatus("idle");
        return;
      }

      console.log("[Pointer] 📡 Stream open — receiving tokens...");
      // Switch to streaming — keeps thinking pill visible alongside text
      setStatus("streaming");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          // Skip SSE keep-alive comments (": keep-alive")
          if (line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6).trim();
          if (data === "[DONE]") { console.log("[Pointer] ✅ Stream complete."); break; }
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
      console.error("[Pointer] ❌ Streaming error:", err);
      setAiResponse("Error: " + (err.message || "Failed to reach ORIGIN AI."));
    } finally {
      setStatus("idle");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  };

  if (isLoading) return null;
  if (!isAuthenticated) return <Login />;

  const isBusy = status !== "idle";

  return (
    <div className="container">

      {/* ── Scrollable middle area ── */}
      <div className="scroll-area" ref={scrollAreaRef}>

        {/* ── Prompt input ── */}
        <div className="input-row" data-tauri-drag-region>
          <div className="icon-spark">
            <Sparkles size={22} strokeWidth={2.5} />
          </div>
          <textarea
            ref={inputRef}
            className="input-field"
            placeholder="Ask ORIGIN AI anything…"
            rows={1}
            onChange={handleInputResize}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              if (e.key === "Escape") handleClose();
            }}
          />
        </div>

        {/* ── "ORIGIN is thinking" — shown during both thinking AND streaming ── */}
        {(status === "thinking" || status === "streaming") && (
          <div className="thinking-box">
            <div className="thinking-dots">
              <span className="dot-pulse" style={{ animationDelay: "0ms" }} />
              <span className="dot-pulse" style={{ animationDelay: "160ms" }} />
              <span className="dot-pulse" style={{ animationDelay: "320ms" }} />
            </div>
            <span className="thinking-label">
              {status === "thinking" ? "ORIGIN AI is thinking…" : "ORIGIN AI is responding…"}
            </span>
          </div>
        )}

        {/* ── Streaming response ── */}
        {aiResponse && (
          <div className="response-box" ref={responseRef}>
            <p className="response-text">{aiResponse}</p>
          </div>
        )}
      </div>

      <div className="divider" />

      {/* ── Bottom bar — always visible, never scrolls away ── */}
      <div className="bottom-row" data-tauri-drag-region>
        <div className="tags">
          <div className="tag">
            <Sparkles size={16} className="tag-icon" />
            <span>ORIGIN AI</span>
            <div className="dot-small" />
          </div>
        </div>

        <div className="actions">
          {/* Sign-out button */}
          <button
            className="btn-sign-out"
            onClick={handleSignOut}
            title="Sign out (/sign-out)"
          >
            <LogOut size={16} />
          </button>

          <button
            className="btn-send"
            onClick={handleSend}
            title="Send"
            disabled={isBusy}
          >
            {isBusy
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
