import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/*
  Runtime shims.

  The App component is written as a Claude artifact: it expects a global
  window.storage key value API and it calls the Anthropic messages endpoint
  with no API key. Those capabilities exist inside the Claude artifact
  runtime. To run the exact same component on a normal web host we install
  lightweight shims here.

  - window.storage is backed by a serverless key value route (/api/kv).
    Shared keys are visible to every visitor of the deployment; personal
    keys are scoped to this browser by a stable client id. If the route is
    unavailable the shim falls back to in browser storage so the single
    device flow still works.

  - fetch to api.anthropic.com is redirected to /api/anthropic, a serverless
    proxy that adds the API key from the ANTHROPIC_API_KEY environment
    variable. Without that variable the app still works using its built in
    fallback questions.
*/

const CLIENT_ID_KEY = "tv_client_id";
function clientId() {
  let id = null;
  try {
    id = window.localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem(CLIENT_ID_KEY, id);
    }
  } catch (e) {
    id = "anon";
  }
  return id;
}

function scopedKey(key, shared) {
  return shared ? "shared:" + key : "u:" + clientId() + ":" + key;
}

// In browser fallback so the app degrades gracefully if the API is down.
const memFallback = {
  get(k) {
    try {
      return window.localStorage.getItem("tvfb:" + k);
    } catch (e) {
      return null;
    }
  },
  set(k, v) {
    try {
      window.localStorage.setItem("tvfb:" + k, v);
    } catch (e) {
      // ignore
    }
  },
  delete(k) {
    try {
      window.localStorage.removeItem("tvfb:" + k);
    } catch (e) {
      // ignore
    }
  },
};

window.storage = {
  async get(key, shared) {
    const sk = scopedKey(key, shared);
    try {
      const res = await fetch("/api/kv?key=" + encodeURIComponent(sk));
      if (!res.ok) throw new Error("kv get failed");
      const data = await res.json();
      return data.value == null ? null : data.value;
    } catch (e) {
      return memFallback.get(sk);
    }
  },
  async set(key, value, shared) {
    const sk = scopedKey(key, shared);
    memFallback.set(sk, value);
    try {
      const res = await fetch("/api/kv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: sk, value }),
      });
      if (!res.ok) throw new Error("kv set failed");
    } catch (e) {
      // value already kept in fallback
    }
  },
  async delete(key, shared) {
    const sk = scopedKey(key, shared);
    memFallback.delete(sk);
    try {
      await fetch("/api/kv", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: sk }),
      });
    } catch (e) {
      // ignore
    }
  },
};

// Redirect the keyless Anthropic call to our proxy.
const realFetch = window.fetch.bind(window);
window.fetch = function (input, init) {
  const url = typeof input === "string" ? input : input && input.url;
  if (url && url.indexOf("api.anthropic.com") !== -1) {
    return realFetch("/api/anthropic", init);
  }
  return realFetch(input, init);
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
