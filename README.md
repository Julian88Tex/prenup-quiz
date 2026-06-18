# Two Voices

A couples tool that maps where two partners stand on prenuptial-agreement
questions and produces a lawyer-ready term sheet. Each partner answers the same
growing set of questions on their own device, neither sees the other's answers
until both finish, and then a side by side document shows where you align,
where you differ, and what is worth a closer look.

This is a values map to bring to your attorney, not legal advice or a binding
agreement.

## How it works

- 15 seed questions across themes like property, separate property, debt, and
  process. Each is answered Yes, No, or It depends.
- An "it depends" answer opens a few sharper follow-up questions, generated on
  the fly, that both partners then answer. The question tree deepens up to three
  levels.
- When both partners are done, the term sheet appears with per topic status
  pills, an aligned / to negotiate / open tally, and a list of unresolved
  topics to bring to an attorney.

## The artifact

`src/App.jsx` is the original single file Claude artifact. It uses two runtime
capabilities that exist inside the Claude artifact runtime:

- `window.storage`, an async key value API with shared and per user keys.
- A keyless call to the Anthropic messages endpoint.

To run the exact same component on a normal web host, `src/main.jsx` installs
small shims that back `window.storage` with a serverless key value route and
redirect the Anthropic call to a serverless proxy.

## Running locally

```
npm install
npm run dev
```

## Deploying to Vercel

The project is a standard Vite app with serverless functions in `api/`. Import
the repo into Vercel and deploy. Two optional environment variables unlock the
full experience:

- `ANTHROPIC_API_KEY` enables generated follow-up questions and the plain
  English overview. Without it the app uses built in fallback questions.
- `KV_REST_API_URL` and `KV_REST_API_TOKEN` (provided by Vercel KV / Upstash)
  enable cross device sync. Without them the single device flow still works.
