import { action } from "./_generated/server";
import { v } from "convex/values";

export const sendMessage = action({
  args: { message: v.string() },
  handler: async (ctx, args) => {
    // 1. Verify authentication
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) {
      throw new Error("Unauthenticated. Please sign in first.");
    }

    // 2. Fetch API Key securely
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error("Missing NVIDIA_API_KEY environment variable. Please configure it in the Convex dashboard.");
    }

    // 3. Call NVIDIA API
    console.log("[Pointer Backend] Preparing payload to send to NVIDIA API carrier...");
    console.log(`[Pointer Backend] Prompt: "${args.message}"`);
    
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "qwen/qwen3.5-397b-a17b",
        messages: [
          { role: "system", content: "You are a helpful AI assistant." },
          { role: "user", content: args.message }
        ],
        temperature: 0.6,
        max_tokens: 16384,
      })
    });

    console.log("[Pointer Backend] Request sent to NVIDIA API carrier. Waiting for response...");

    if (!response.ok) {
      const err = await response.text();
      console.error("[Pointer Backend] NVIDIA API Error:", err);
      throw new Error("Failed to fetch response from NVIDIA AI");
    }

    const data = await response.json();
    console.log("[Pointer Backend] Response received from NVIDIA API!");
    return data.choices[0].message.content as string;
  },
});
