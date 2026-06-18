/*
  Proxy for the Anthropic messages endpoint.

  The App calls api.anthropic.com with no key, as Claude artifacts do. On a
  normal host that call cannot succeed, so the runtime shim redirects it here
  and this function adds the API key from the ANTHROPIC_API_KEY environment
  variable. If the key is not set the function returns a clear error and the
  App falls back to its built in questions and skips the optional overview.
*/

async function readBody(req) {
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch (e) {
        return {};
      }
    }
    return req.body;
  }
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (e) {
        resolve({});
      }
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res
      .status(503)
      .json({ error: "ANTHROPIC_API_KEY is not configured" });
  }
  try {
    const body = await readBody(req);
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model || "claude-sonnet-4-6",
        max_tokens: body.max_tokens || 1000,
        system: body.system,
        messages: body.messages || [],
      }),
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message) });
  }
}
