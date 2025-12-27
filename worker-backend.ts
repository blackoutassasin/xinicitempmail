**
 * CLOUDFLARE WORKER BACKEND (Custom API)
 * Deploy this to Cloudflare Workers to use your own domain.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a KV Namespace named "EMAILS_KV".
 * 2. Set up Cloudflare Email Routing for your domain.
 * 3. Add a "Catch-all" address that forwards to this worker.
 */

// Added local type definitions for Cloudflare Worker environment to fix "Cannot find name" errors
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

interface Env {
  EMAILS_KV: KVNamespace;
}

export default {
  async email(message: any, env: Env, ctx: ExecutionContext) {
    const id = crypto.randomUUID();
    const login = message.to.split('@')[0];
    const domain = message.to.split('@')[1];
    
    // Read the email body (simplified for demonstration)
    const reader = message.raw.getReader();
    const decoder = new TextDecoder();
    let rawEmail = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rawEmail += decoder.decode(value);
    }

    const emailData = {
      id,
      from: message.from,
      subject: message.headers.get("subject") || "(No Subject)",
      date: new Date().toISOString(),
      body: rawEmail, // In a real app, you'd parse MIME here
      login,
      domain
    };

    // Store in KV with a 24-hour expiration (86400 seconds)
    // Key format: email:{domain}:{login}:{id}
    await env.EMAILS_KV.put(`email:${domain}:${login}:${id}`, JSON.stringify(emailData), {
      expirationTtl: 86400 
    });
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const params = url.searchParams;
    const path = url.pathname;

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // API: Get messages
    if (path === "/api/messages") {
      const login = params.get("login");
      const domain = params.get("domain");
      if (!login || !domain) return new Response("Missing params", { status: 400, headers: corsHeaders });

      const list = await env.EMAILS_KV.list({ prefix: `email:${domain}:${login}:` });
      const messages = await Promise.all(
        list.keys.map(async (key) => {
          const val = await env.EMAILS_KV.get(key.name);
          const parsed = JSON.parse(val || "{}");
          return {
            id: parsed.id,
            from: parsed.from,
            subject: parsed.subject,
            date: parsed.date
          };
        })
      );

      return new Response(JSON.stringify(messages), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // API: Read single message
    if (path === "/api/read") {
      const id = params.get("id");
      const login = params.get("login");
      const domain = params.get("domain");
      
      const val = await env.EMAILS_KV.get(`email:${domain}:${login}:${id}`);
      if (!val) return new Response("Not found", { status: 404, headers: corsHeaders });

      return new Response(val, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response("Xinici Mail Custom Node Active", { headers: corsHeaders });
  }
};
