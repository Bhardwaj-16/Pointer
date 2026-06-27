import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Sparkles, X, Send } from "lucide-react";
import "./App.css";

function App() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Listen for Rust telling us to activate — just focus the input
    let unlisten: (() => void) | undefined;
    listen("pointer-activated", () => {
      console.log("[Pointer Frontend] pointer-activated received, focusing input");
      setTimeout(() => inputRef.current?.focus(), 100);
    }).then(fn => {
      unlisten = fn;
    });

    // Also focus when window itself gets focus
    const handleFocus = () => {
      inputRef.current?.focus();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      if (unlisten) unlisten();
    };
  }, []);

  const handleClose = async () => {
    try {
      await invoke("hide_window");
    } catch (error) {
      console.error("Failed to hide window:", error);
    }
  };

  const handleSend = () => {
    const val = inputRef.current?.value ?? "";
    console.log("Sending prompt:", val);
    // AI integration goes here
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="container" data-tauri-drag-region>
      <div className="input-row" data-tauri-drag-region>
        <div className="icon-spark">
          <Sparkles size={22} strokeWidth={2.5} />
        </div>
        <input
          ref={inputRef}
          type="text"
          className="input-field"
          placeholder="Ask AI anything..."
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
            if (e.key === "Escape") handleClose();
          }}
        />
      </div>

      <div className="divider" />

      <div className="bottom-row" data-tauri-drag-region>
        <div className="tags">
          <div className="tag">
            <Sparkles size={16} className="tag-icon" />
            <span>ORIGIN AI</span>
            <div className="dot-small"></div>
          </div>
        </div>

        <div className="actions">
          <button className="btn-send" onClick={handleSend} title="Send">
            <Send size={20} style={{ marginLeft: "-2px", marginTop: "2px" }} />
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
