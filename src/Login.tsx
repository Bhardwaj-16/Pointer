import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Sparkles, Mail, Lock } from "lucide-react";
import "./Login.css";

export function Login() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow });
    } catch (err: any) {
      const msg: string = err.message ?? "";
      // Convex Auth throws "Could not find account" or similar when email is unknown
      const isUnknownAccount =
        flow === "signIn" &&
        (msg.toLowerCase().includes("could not find") ||
         msg.toLowerCase().includes("no account") ||
         msg.toLowerCase().includes("invalid") ||
         msg.toLowerCase().includes("not found") ||
         msg.toLowerCase().includes("user not found"));

      if (isUnknownAccount) {
        setError("__unrecognized_email__");
      } else {
        setError(msg || "An error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" data-tauri-drag-region>
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Sparkles size={32} strokeWidth={2.5} />
          </div>
          <h2>Welcome to Pointer</h2>
          <p>Sign in to connect to ORIGIN AI</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <Mail size={18} className="input-icon" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <Lock size={18} className="input-icon" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="error-message">
              {error === "__unrecognized_email__" ? (
                <>
                  Email not recognized.{" "}
                  <button
                    type="button"
                    className="error-link"
                    onClick={() => { setFlow("signUp"); setError(null); }}
                  >
                    Please sign up →
                  </button>
                </>
              ) : (
                error
              )}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Please wait..." : flow === "signIn" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <div className="login-footer">
          <button 
            type="button" 
            className="btn-link"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
