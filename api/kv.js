/*
  Shared key value store for the Two Voices runtime shim.

  If an Upstash Redis REST endpoint is configured (KV_REST_API_URL and
  KV_REST_API_TOKEN, the variables Vercel KV provides), values persist there
  and sync across devices. Without it the function falls back to a per
  instance in memory map, which is enough for trying the app on one device.
*/

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const mem = globalThis.__tv_mem || (globalThis.__tv_mem = new Map());

async function redis(command) {
  const res = await fetch(REST_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + REST_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error("redis error " + res.status);
  const data = await res.json();
  return data.result;
}

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
  const useRedis = REST_URL && REST_TOKEN;
  try {
    if (req.method === "GET") {
      const key = (req.query && req.query.key) || "";
      if (!key) return res.status(400).json({ error: "missing key" });
      let value;
      if (useRedis) value = await redis(["GET", "tv:" + key]);
      else value = mem.has(key) ? mem.get(key) : null;
      return res.status(200).json({ value: value == null ? null : value });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body.key) return res.status(400).json({ error: "missing key" });
      if (useRedis) await redis(["SET", "tv:" + body.key, body.value]);
      else mem.set(body.key, body.value);
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const body = await readBody(req);
      if (!body.key) return res.status(400).json({ error: "missing key" });
      if (useRedis) await redis(["DEL", "tv:" + body.key]);
      else mem.delete(body.key);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message) });
  }
}
