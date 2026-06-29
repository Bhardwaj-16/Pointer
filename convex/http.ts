import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// Handle CORS preflight
http.route({
  path: "/chat/stream",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
    });
  }),
});

http.route({
  path: "/chat/stream",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // 1. Auth — derive identity from session token, never trust client-supplied ID
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.warn("[Pointer Backend] Unauthenticated streaming request rejected.");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 2. Validate input
    let message: string;
    try {
      const body = await request.json();
      message = (body.message ?? "").trim();
    } catch {
      return new Response("Invalid request body", { status: 400, headers: CORS_HEADERS });
    }
    if (!message) {
      return new Response("Empty message", { status: 400, headers: CORS_HEADERS });
    }

    // 3. Secure API key — only available server-side
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      console.error("[Pointer Backend] NVIDIA_API_KEY environment variable is missing!");
      return new Response("Server configuration error", { status: 500, headers: CORS_HEADERS });
    }

    console.log(`[Pointer Backend] ✅ User authenticated. Subject: ${identity.subject}`);
    console.log(`[Pointer Backend] 📨 Prompt received: "${message}"`);
    console.log(`[Pointer Backend] 🚀 Sending prompt to NVIDIA API carrier...`);

    // Create a stream to return IMMEDIATELY so WebKit doesn't time out (Load failed)
    // while waiting for NVIDIA's massive model to cold-start.
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Fire and forget the fetch logic
    (async () => {
      let pingInterval: any;
      try {
        // Send a ping every 5 seconds to keep the connection alive
        pingInterval = setInterval(async () => {
          try {
            await writer.write(encoder.encode(": keep-alive\n\n"));
          } catch {
            clearInterval(pingInterval);
          }
        }, 5000);

        // 4. Open streaming connection to NVIDIA
        const nvidiaResponse = await fetch(
          "https://integrate.api.nvidia.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              Accept: "text/event-stream",
            },
            body: JSON.stringify({
              model: "meta/llama-3.1-70b-instruct",
              messages: [
                { role: "system", content: "You are a helpful, concise AI assistant." },
                { role: "user", content: message },
              ],
              temperature: 0.6,
              top_p: 0.95,
              top_k: 20,
              presence_penalty: 0,
              repetition_penalty: 1,
              max_tokens: 4096,
              stream: true,
            }),
          }
        );

        clearInterval(pingInterval);

        if (!nvidiaResponse.ok) {
          const err = await nvidiaResponse.text();
          console.error("[Pointer Backend] ❌ NVIDIA API error:", err);
          await writer.write(encoder.encode(`data: {"error": "NVIDIA API Error"}\n\n`));
          await writer.close();
          return;
        }

        console.log("[Pointer Backend] 📡 NVIDIA connection established. Piping raw stream to client...");

        const reader = nvidiaResponse.body!.getReader();
        let isFirstChunk = true;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("[Pointer Backend] 🏁 NVIDIA stream completed normally.");
            await writer.close();
            break;
          }
          if (isFirstChunk) {
            console.log("[Pointer Backend] ⚡ First token received from NVIDIA!");
            isFirstChunk = false;
          }
          await writer.write(value);
        }
      } catch (err) {
        clearInterval(pingInterval);
        console.error("[Pointer Backend] ❌ Error while piping stream:", err);
        try {
          await writer.abort(err);
        } catch (e) {}
      }
    })();

    // 5. Return the readable side of the transform stream IMMEDIATELY
    return new Response(readable, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }),
});

export default http;
