import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Copy,
  Check,
  Users,
  Printer,
  Download,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Share2,
  Home,
} from "lucide-react";

/*
  Two Voices
  A couples tool that maps where two partners stand on prenuptial-agreement
  questions and produces a lawyer-ready term sheet.

  This is a values map to bring to your attorney, not legal advice or a
  binding agreement.
*/

const COLORS = {
  p1: "#356C73", // partner 1 teal
  p2: "#B96A34", // partner 2 clay
  paper: "#ECEAE3", // warm stone
  card: "#FBFAF6",
  ink: "#232B27",
  aligned: "#4A7A52",
  alignedBg: "#E8F0E7",
  differ: "#A87B27",
  differBg: "#F5ECD6",
  explore: "#4C6585",
  exploreBg: "#E5EAF1",
  line: "#D9D5C8",
  soft: "#6A7169",
};

const SERIF = "'Iowan Old Style', Georgia, serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const MAX_DEPTH = 3;

const THEME_LABELS = {
  property: "Property and earnings",
  separate: "Separate property",
  debt: "Debt",
  divorce: "If it ends",
  money: "Money during marriage",
  children: "Children",
  process: "Process and terms",
};

const SEED_QUESTIONS = [
  {
    id: "earnings",
    theme: "property",
    text: "Should money or assets each of you earns during the marriage stay individually owned, instead of automatically becoming shared 50/50?",
    context: "This decides whether income becomes a shared pot or stays with whoever earned it.",
  },
  {
    id: "premarital",
    theme: "separate",
    text: "Should anything each of you owned before the marriage stay entirely that person's separate property?",
    context: "Covers savings, property, or accounts you each bring into the marriage.",
  },
  {
    id: "home",
    theme: "property",
    text: "If you buy a home together, should it be split 50/50 if you divorce, even if one of you paid more toward it?",
    context: "A shared home is often the largest asset, so unequal contributions matter here.",
  },
  {
    id: "equalsplit",
    theme: "divorce",
    text: "If you divorce, should shared marital assets be divided equally (50/50), regardless of who earned more?",
    context: "Sets the default rule for dividing whatever counts as shared.",
  },
  {
    id: "support",
    theme: "divorce",
    text: "If you divorce, should you both waive spousal support, so neither of you pays the other ongoing support?",
    context: "Spousal support is money one person pays the other after a divorce.",
  },
  {
    id: "debt",
    theme: "debt",
    text: "Should debts each of you brings in or takes on individually stay that person's sole responsibility?",
    context: "Includes student loans, credit cards, and debts taken on alone during the marriage.",
  },
  {
    id: "business",
    theme: "separate",
    text: "If one of you owns or starts a business, should it stay that person's separate property, with no claim by the other?",
    context: "A business can grow in value, which raises the question of who shares in it.",
  },
  {
    id: "inheritance",
    theme: "separate",
    text: "Should inheritances or gifts received by one of you stay that person's separate property?",
    context: "Money or property received from family is often treated differently than earnings.",
  },
  {
    id: "retirement",
    theme: "separate",
    text: "Should retirement accounts each of you builds during the marriage stay individually owned, instead of split on divorce?",
    context: "Retirement savings built during a marriage are commonly divided unless you decide otherwise.",
  },
  {
    id: "separatefinances",
    theme: "money",
    text: "During the marriage, should you keep your finances mostly separate rather than fully combined?",
    context: "This is about how you run money day to day, not just what happens at the end.",
  },
  {
    id: "transparency",
    theme: "money",
    text: "Should you both commit to fully and regularly disclosing your finances to each other?",
    context: "Full disclosure means sharing income, accounts, and debts openly and on a regular basis.",
  },
  {
    id: "custody",
    theme: "children",
    text: "If you have children and later separate, do you both want to aim for equal (50/50) custody?",
    context: "A shared intention only. A court decides custody by the child's best interest, so this is not a binding term.",
  },
  {
    id: "disputes",
    theme: "process",
    text: "If a dispute about this agreement comes up, should you resolve it through mediation or arbitration instead of going to court?",
    context: "Mediation and arbitration are ways to settle disagreements outside a courtroom.",
  },
  {
    id: "sunset",
    theme: "process",
    text: "Should the agreement automatically expire or be renegotiated after a set number of years?",
    context: "A sunset clause lets the agreement end or be revisited after a chosen period.",
  },
  {
    id: "conduct",
    theme: "process",
    text: "Should the agreement include financial consequences for specific behavior, like infidelity?",
    context: "Sometimes called a conduct or lifestyle clause, tying money to certain behavior.",
  },
];

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function makeCode() {
  let s = "";
  for (let i = 0; i < 5; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function buildSeedNodes() {
  return SEED_QUESTIONS.map((q) => ({
    id: q.id,
    parentId: null,
    rootTopicId: q.id,
    theme: q.theme,
    text: q.text,
    context: q.context,
    depth: 0,
    answers: { p1: null, p2: null },
    pending: null,
  }));
}

function childrenOf(nodes, id) {
  return nodes.filter((n) => n.parentId === id);
}

// A node owned by "who" needs follow-ups if they answered "depends",
// it is below max depth, and it has no children yet.
function nodeNeedsFollowups(nodes, node, who) {
  const ans = node.answers[who];
  if (!ans || ans.choice !== "depends") return false;
  if (node.depth >= MAX_DEPTH) return false;
  return childrenOf(nodes, node.id).length === 0;
}

function isPartnerComplete(nodes, who) {
  for (const n of nodes) {
    if (!n.answers[who]) return false;
    if (nodeNeedsFollowups(nodes, n, who)) return false;
  }
  return true;
}

function anyPending(nodes) {
  const now = Date.now();
  return nodes.some((n) => n.pending && now - n.pending.ts < 30000);
}

// Merge two node lists by id. My answers win for "me"; the other side
// comes from remote when present. Union of nodes so freshly added
// follow-ups from either device are never dropped.
function mergeNodes(localNodes, remoteNodes, me) {
  const other = me === "p1" ? "p2" : "p1";
  const byId = new Map();
  for (const n of remoteNodes || []) byId.set(n.id, { ...n });
  for (const n of localNodes || []) {
    const existing = byId.get(n.id);
    if (!existing) {
      byId.set(n.id, { ...n });
    } else {
      existing.answers = {
        [me]: n.answers[me] || existing.answers[me] || null,
        [other]: existing.answers[other] || n.answers[other] || null,
      };
      // keep a pending claim if either side has a live one
      const now = Date.now();
      const lp = n.pending && now - n.pending.ts < 30000 ? n.pending : null;
      const rp =
        existing.pending && now - existing.pending.ts < 30000
          ? existing.pending
          : null;
      existing.pending = rp || lp || null;
    }
  }
  return Array.from(byId.values());
}

const STATUS = {
  aligned: { label: "aligned", color: COLORS.aligned, bg: COLORS.alignedBg },
  differ: { label: "differ", color: COLORS.differ, bg: COLORS.differBg },
  explore: {
    label: "worth a closer look",
    color: COLORS.explore,
    bg: COLORS.exploreBg,
  },
};

function pairStatus(a, b) {
  if (!a || !b) return "explore";
  if (a.choice === "depends" || b.choice === "depends") return "explore";
  if (a.choice === b.choice) return "aligned";
  return "differ";
}

function choiceLabel(choice) {
  if (choice === "yes") return "Yes";
  if (choice === "no") return "No";
  if (choice === "depends") return "It depends";
  return "Not answered";
}

export default function App() {
  const [screen, setScreen] = useState("home"); // home, create, invite, join, answer, waiting, result
  const [mode, setMode] = useState(null); // "remote" | "local"
  const [me, setMe] = useState(null); // "p1" | "p2"
  const [session, setSession] = useState(null);
  const [resume, setResume] = useState(null);
  const [overview, setOverview] = useState("");

  const sessionRef = useRef(null);
  const meRef = useRef(null);
  const flushTimer = useRef(null);
  const pollTimer = useRef(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  // Look for a resume pointer on load.
  useEffect(() => {
    (async () => {
      try {
        const raw = await window.storage.get("tv_last");
        if (raw) setResume(JSON.parse(raw));
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const keyFor = (code) => "tv_s_" + code;

  const saveSession = useCallback(async (next) => {
    sessionRef.current = next;
    setSession(next);
    try {
      await window.storage.set(keyFor(next.code), JSON.stringify(next), true);
    } catch (e) {
      // ignore transient write failures, poll/flush will retry
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(async () => {
      const cur = sessionRef.current;
      if (!cur) return;
      try {
        await window.storage.set(keyFor(cur.code), JSON.stringify(cur), true);
      } catch (e) {
        // ignore
      }
    }, 600);
  }, []);

  // Apply a local mutation to the session, bump rev, persist.
  const mutate = useCallback(
    (fn) => {
      const cur = sessionRef.current;
      if (!cur) return;
      const draft = JSON.parse(JSON.stringify(cur));
      fn(draft);
      draft.rev = (cur.rev || 0) + 1;
      sessionRef.current = draft;
      setSession(draft);
      scheduleFlush();
    },
    [scheduleFlush]
  );

  // Polling loop for remote mode.
  useEffect(() => {
    if (mode !== "remote" || !session) return;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      const cur = sessionRef.current;
      const who = meRef.current;
      if (!cur) return;
      try {
        const raw = await window.storage.get(keyFor(cur.code), true);
        if (!raw) return;
        const remote = JSON.parse(raw);
        // Only accept strictly newer revisions to avoid rollback.
        const merged = mergeNodes(cur.nodes, remote.nodes, who);
        const newer = (remote.rev || 0) > (cur.rev || 0);

        // self-heal: detect if my answers were clobbered remotely
        let clobbered = false;
        for (const ln of cur.nodes) {
          if (ln.answers[who]) {
            const rn = (remote.nodes || []).find((x) => x.id === ln.id);
            if (rn && !rn.answers[who]) clobbered = true;
          }
        }

        const next = {
          ...cur,
          names: remote.names || cur.names,
          presence: { ...cur.presence, ...remote.presence },
          p1Done: remote.p1Done || cur.p1Done,
          p2Done: remote.p2Done || cur.p2Done,
          overview: remote.overview || cur.overview,
          nodes: merged,
          rev: Math.max(cur.rev || 0, remote.rev || 0) + (clobbered ? 1 : 0),
        };

        if (remote.overview && remote.overview !== overview) {
          setOverview(remote.overview);
        }

        // Did anything actually change?
        const changed =
          newer ||
          clobbered ||
          JSON.stringify(next.nodes) !== JSON.stringify(cur.nodes) ||
          next.p1Done !== cur.p1Done ||
          next.p2Done !== cur.p2Done;

        if (changed) {
          sessionRef.current = next;
          setSession(next);
          if (clobbered) {
            // re-flush my authoritative copy
            try {
              await window.storage.set(
                keyFor(next.code),
                JSON.stringify(next),
                true
              );
            } catch (e) {
              // ignore
            }
          }
        }
      } catch (e) {
        // ignore poll errors
      }
    }, 4000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [mode, session, overview]);

  // ----- Anthropic follow-up generation -----
  async function generateFollowups(node) {
    const system =
      "You help an engaged couple sharpen a prenuptial values question into more specific sub-questions. " +
      "Return only a JSON array of 2 to 3 short objects, each with keys \"text\" and \"context\". " +
      "Each \"text\" must be a clear yes or no question that makes the original more concrete. " +
      "Each \"context\" is one short plain-language sentence. " +
      "Use plain warm language. Never use em dashes.";
    const content =
      "Topic theme: " +
      THEME_LABELS[node.theme] +
      "\nThe partner answered \"it depends\" to this question:\n\"" +
      node.text +
      "\"\nWrite 2 to 3 sharper follow-up questions that would help them decide. Return JSON only.";

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system,
          messages: [{ role: "user", content }],
        }),
      });
      const data = await res.json();
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("no json");
      const arr = JSON.parse(match[0]);
      const clean = arr
        .filter((x) => x && x.text)
        .slice(0, 3)
        .map((x) => ({
          text: String(x.text),
          context: String(x.context || ""),
        }));
      if (clean.length < 2) throw new Error("too few");
      return clean;
    } catch (e) {
      return [
        {
          text: "Would your answer change depending on how much money or time was involved?",
          context: "Think about whether a dollar amount or duration would tip your decision.",
        },
        {
          text: "Would you want this handled differently in the first few years versus later?",
          context: "Some couples treat the early years of a marriage differently.",
        },
      ];
    }
  }

  // Append follow-ups for a node, guarded by a pending claim.
  const spawnFollowups = useCallback(
    async (nodeId) => {
      const who = meRef.current;
      const cur = sessionRef.current;
      if (!cur) return;
      const node = cur.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (childrenOf(cur.nodes, nodeId).length > 0) return;
      // pending claim guard so two devices do not both generate
      if (node.pending && Date.now() - node.pending.ts < 30000) return;

      mutate((d) => {
        const t = d.nodes.find((n) => n.id === nodeId);
        if (t) t.pending = { by: who, ts: Date.now() };
      });

      const followups = await generateFollowups(node);

      mutate((d) => {
        const t = d.nodes.find((n) => n.id === nodeId);
        if (!t) return;
        // someone may have added children while we waited
        const already = d.nodes.filter((n) => n.parentId === nodeId);
        if (already.length === 0) {
          for (const f of followups) {
            d.nodes.push({
              id: uid(),
              parentId: nodeId,
              rootTopicId: t.rootTopicId,
              theme: t.theme,
              text: f.text,
              context: f.context,
              depth: t.depth + 1,
              answers: { p1: null, p2: null },
              pending: null,
            });
          }
        }
        t.pending = null;
      });
    },
    [mutate]
  );

  // Record an answer for the current partner; spawn follow-ups on depends.
  const answerNode = useCallback(
    (nodeId, choice, note) => {
      const who = meRef.current;
      mutate((d) => {
        const t = d.nodes.find((n) => n.id === nodeId);
        if (!t) return;
        t.answers[who] = { choice, note: note || "" };
      });
      const cur = sessionRef.current;
      const node = cur ? cur.nodes.find((n) => n.id === nodeId) : null;
      if (
        node &&
        choice === "depends" &&
        node.depth < MAX_DEPTH &&
        childrenOf(cur.nodes, nodeId).length === 0
      ) {
        spawnFollowups(nodeId);
      }
    },
    [mutate, spawnFollowups]
  );

  // Mark this partner done if complete.
  const finishPartner = useCallback(() => {
    const who = meRef.current;
    mutate((d) => {
      if (who === "p1") d.p1Done = true;
      else d.p2Done = true;
    });
    setScreen("waiting");
  }, [mutate]);

  // ----- Navigation / lifecycle helpers -----
  async function createSession(name1, name2) {
    const code = makeCode();
    const s = {
      code,
      names: { p1: name1, p2: name2 },
      nodes: buildSeedNodes(),
      presence: { p1: true, p2: false },
      p1Done: false,
      p2Done: false,
      overview: "",
      rev: 1,
      createdAt: Date.now(),
    };
    setMode("remote");
    setMe("p1");
    meRef.current = "p1";
    await saveSession(s);
    try {
      await window.storage.set(
        "tv_last",
        JSON.stringify({ code, role: "p1", names: s.names, mode: "remote" })
      );
    } catch (e) {
      // ignore
    }
    setScreen("invite");
  }

  async function joinSession(code) {
    const clean = code.trim().toUpperCase();
    const raw = await window.storage.get(keyFor(clean), true);
    if (!raw) {
      return { error: "No session found for that code." };
    }
    const remote = JSON.parse(raw);
    remote.presence = { ...remote.presence, p2: true };
    remote.rev = (remote.rev || 0) + 1;
    setMode("remote");
    setMe("p2");
    meRef.current = "p2";
    await saveSession(remote);
    try {
      await window.storage.set(
        "tv_last",
        JSON.stringify({
          code: clean,
          role: "p2",
          names: remote.names,
          mode: "remote",
        })
      );
    } catch (e) {
      // ignore
    }
    return { ok: true };
  }

  async function startLocal(name1, name2) {
    const code = makeCode();
    const s = {
      code,
      names: { p1: name1, p2: name2 },
      nodes: buildSeedNodes(),
      presence: { p1: true, p2: true },
      p1Done: false,
      p2Done: false,
      overview: "",
      rev: 1,
      createdAt: Date.now(),
    };
    setMode("local");
    setMe("p1");
    meRef.current = "p1";
    await saveSession(s);
    setScreen("answer");
  }

  async function resumeSession() {
    if (!resume) return;
    const raw = await window.storage.get(keyFor(resume.code), true);
    if (!raw) {
      setResume(null);
      return;
    }
    const remote = JSON.parse(raw);
    setMode(resume.mode || "remote");
    setMe(resume.role);
    meRef.current = resume.role;
    await saveSession(remote);
    setOverview(remote.overview || "");
    setScreen("answer");
  }

  // Detect completion -> result screen
  useEffect(() => {
    if (!session) return;
    const bothDone =
      session.p1Done &&
      session.p2Done &&
      isPartnerComplete(session.nodes, "p1") &&
      isPartnerComplete(session.nodes, "p2") &&
      !anyPending(session.nodes);
    if (bothDone && screen !== "result") {
      setScreen("result");
    }
  }, [session, screen]);

  // ----- Render -----
  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.paper,
        color: COLORS.ink,
        fontFamily: SANS,
      }}
    >
      <PrintStyles />
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 20px 80px" }}>
        <Header onHome={() => setScreen("home")} screen={screen} />
        {screen === "home" && (
          <HomeScreen
            resume={resume}
            onCreate={() => setScreen("create")}
            onJoin={() => setScreen("join")}
            onLocal={() => setScreen("createLocal")}
            onResume={resumeSession}
          />
        )}
        {screen === "create" && (
          <CreateScreen onCreate={createSession} mode="remote" />
        )}
        {screen === "createLocal" && (
          <CreateScreen onCreate={startLocal} mode="local" />
        )}
        {screen === "invite" && session && (
          <InviteScreen
            session={session}
            onContinue={() => setScreen("answer")}
          />
        )}
        {screen === "join" && (
          <JoinScreen
            onJoin={joinSession}
            onConfirm={() => setScreen("answer")}
          />
        )}
        {screen === "answer" && session && (
          <AnswerScreen
            session={session}
            me={me}
            mode={mode}
            onAnswer={answerNode}
            onSpawn={spawnFollowups}
            onFinish={finishPartner}
            setSession={saveSession}
            setMe={setMe}
            mutate={mutate}
          />
        )}
        {screen === "waiting" && session && (
          <WaitingScreen session={session} me={me} />
        )}
        {screen === "result" && session && (
          <ResultScreen
            session={session}
            mutate={mutate}
            me={me}
            overview={overview}
            setOverview={setOverview}
          />
        )}
      </div>
    </div>
  );
}

function Header({ onHome, screen }) {
  return (
    <div
      className="tv-noprint"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "26px 0 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Seam />
        <div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
          >
            Two Voices
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.soft }}>
            Where you both stand, side by side
          </div>
        </div>
      </div>
      {screen !== "home" && (
        <button onClick={onHome} style={ghostBtn}>
          <Home size={15} /> Home
        </button>
      )}
    </div>
  );
}

// The signature: two answers meeting across a center seam.
function Seam({ size = 34 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        overflow: "hidden",
        display: "flex",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ flex: 1, background: COLORS.p1 }} />
      <div style={{ width: 2, background: COLORS.card }} />
      <div style={{ flex: 1, background: COLORS.p2 }} />
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: "1px solid " + COLORS.line,
        borderRadius: 14,
        padding: 22,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function HomeScreen({ resume, onCreate, onJoin, onLocal, onResume }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: 30,
            margin: "2px 0 8px",
            lineHeight: 1.2,
          }}
        >
          Map where you both stand
        </h1>
        <p style={{ margin: 0, color: COLORS.soft, lineHeight: 1.6 }}>
          Answer the same set of questions, each on your own device. Neither of
          you sees the other's answers until you have both finished. Then a clear
          side by side document shows where you align, where you differ, and what
          is worth a closer look.
        </p>
        <p
          style={{
            margin: "14px 0 0",
            fontSize: 13,
            color: COLORS.soft,
            fontStyle: "italic",
            borderLeft: "3px solid " + COLORS.line,
            paddingLeft: 12,
          }}
        >
          This is a values map to bring to your attorney, not legal advice or a
          binding agreement.
        </p>
      </Card>

      {resume && (
        <Card style={{ borderColor: COLORS.p1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>Resume your session</div>
              <div style={{ fontSize: 13, color: COLORS.soft }}>
                Code {resume.code}
                {resume.names
                  ? " for " + resume.names.p1 + " and " + resume.names.p2
                  : ""}
              </div>
            </div>
            <button onClick={onResume} style={primaryBtn}>
              <RefreshCw size={15} /> Resume
            </button>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Start a session
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13.5, color: COLORS.soft }}>
            Create a session and get a code to share with your partner.
          </p>
          <button onClick={onCreate} style={primaryBtn}>
            Create <ArrowRight size={15} />
          </button>
        </Card>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Join a session</div>
          <p style={{ margin: "0 0 14px", fontSize: 13.5, color: COLORS.soft }}>
            Your partner already started? Enter the 5 character code.
          </p>
          <button onClick={onJoin} style={secondaryBtn}>
            Join with a code
          </button>
        </Card>
      </div>

      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>Both on this one device</div>
            <div style={{ fontSize: 13, color: COLORS.soft }}>
              No second device handy? Take turns and pass it back and forth.
            </div>
          </div>
          <button onClick={onLocal} style={secondaryBtn}>
            <Users size={15} /> Use one device
          </button>
        </div>
      </Card>
    </div>
  );
}

function CreateScreen({ onCreate, mode }) {
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const valid = n1.trim() && n2.trim();
  return (
    <Card>
      <h2 style={{ fontFamily: SERIF, marginTop: 0 }}>
        {mode === "local" ? "Both on one device" : "Create a session"}
      </h2>
      <p style={{ color: COLORS.soft, marginTop: 0 }}>
        Enter both names. The first name will be teal, the second clay.
      </p>
      <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
        <Field
          label="Partner 1"
          color={COLORS.p1}
          value={n1}
          onChange={setN1}
          placeholder="First partner's name"
        />
        <Field
          label="Partner 2"
          color={COLORS.p2}
          value={n2}
          onChange={setN2}
          placeholder="Second partner's name"
        />
      </div>
      <button
        disabled={!valid}
        onClick={() => onCreate(n1.trim(), n2.trim())}
        style={{ ...primaryBtn, marginTop: 18, opacity: valid ? 1 : 0.5 }}
      >
        {mode === "local" ? "Begin" : "Create session"} <ArrowRight size={15} />
      </button>
    </Card>
  );
}

function Field({ label, color, value, onChange, placeholder }) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color,
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "11px 13px",
          borderRadius: 10,
          border: "1px solid " + COLORS.line,
          background: "#fff",
          fontSize: 15,
          fontFamily: SANS,
          outline: "none",
        }}
      />
    </label>
  );
}

function InviteScreen({ session, onContinue }) {
  const [copied, setCopied] = useState("");
  const inviteText =
    "Let's map where we both stand before talking to a lawyer. Open this same page, choose Join with a code, and enter " +
    session.code +
    ".";
  function copy(what, value) {
    try {
      navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(""), 1600);
    } catch (e) {
      // ignore
    }
  }
  const joined = session.presence && session.presence.p2;
  return (
    <Card>
      <h2 style={{ fontFamily: SERIF, marginTop: 0 }}>Invite your partner</h2>
      <p style={{ color: COLORS.soft, marginTop: 0 }}>
        Share this code. Your partner opens the same published page and chooses
        Join with a code.
      </p>
      <div
        style={{
          textAlign: "center",
          padding: "22px 0",
          background: COLORS.paper,
          borderRadius: 12,
          margin: "14px 0",
        }}
      >
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 46,
            letterSpacing: 8,
            fontWeight: 700,
          }}
        >
          {session.code}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => copy("code", session.code)} style={secondaryBtn}>
          {copied === "code" ? <Check size={15} /> : <Copy size={15} />} Copy
          code
        </button>
        <button onClick={() => copy("text", inviteText)} style={secondaryBtn}>
          {copied === "text" ? <Check size={15} /> : <Share2 size={15} />} Copy
          invite text
        </button>
      </div>
      <div
        style={{
          marginTop: 16,
          fontSize: 13,
          color: joined ? COLORS.aligned : COLORS.soft,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 9,
            background: joined ? COLORS.aligned : COLORS.line,
            display: "inline-block",
          }}
        />
        {joined
          ? session.names.p2 + " has joined."
          : "Waiting for " + session.names.p2 + " to join. You can start now."}
      </div>
      <button onClick={onContinue} style={{ ...primaryBtn, marginTop: 18 }}>
        Start answering <ArrowRight size={15} />
      </button>
    </Card>
  );
}

function JoinScreen({ onJoin, onConfirm }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);

  async function attempt() {
    setBusy(true);
    setError("");
    const res = await onJoin(code);
    setBusy(false);
    if (res.error) setError(res.error);
    else setFound(true);
  }

  if (found) {
    return (
      <Card>
        <h2 style={{ fontFamily: SERIF, marginTop: 0 }}>You are in</h2>
        <p style={{ color: COLORS.soft }}>
          You have joined as the second partner. You will answer on your own
          device. Neither of you sees the other's answers until you both finish.
        </p>
        <button onClick={onConfirm} style={primaryBtn}>
          Start answering <ArrowRight size={15} />
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <h2 style={{ fontFamily: SERIF, marginTop: 0 }}>Join with a code</h2>
      <p style={{ color: COLORS.soft, marginTop: 0 }}>
        Enter the 5 character code your partner shared.
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCDE"
        maxLength={5}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "14px 16px",
          borderRadius: 10,
          border: "1px solid " + COLORS.line,
          background: "#fff",
          fontSize: 28,
          letterSpacing: 8,
          textAlign: "center",
          fontFamily: SERIF,
          outline: "none",
        }}
      />
      {error && (
        <div style={{ color: COLORS.p2, fontSize: 13, marginTop: 10 }}>
          {error}
        </div>
      )}
      <button
        disabled={code.length < 5 || busy}
        onClick={attempt}
        style={{
          ...primaryBtn,
          marginTop: 16,
          opacity: code.length < 5 || busy ? 0.5 : 1,
        }}
      >
        {busy ? "Checking..." : "Join"} <ArrowRight size={15} />
      </button>
    </Card>
  );
}

function ProgressBar({ done, total, color }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div
        style={{
          height: 8,
          background: COLORS.paper,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid " + COLORS.line,
        }}
      >
        <div
          style={{
            width: pct + "%",
            height: "100%",
            background: color,
            transition: "width 0.3s",
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: COLORS.soft, marginTop: 6 }}>
        {done} of {total} answered
      </div>
    </div>
  );
}

function AnswerScreen({
  session,
  me,
  mode,
  onAnswer,
  onSpawn,
  onFinish,
  setMe,
}) {
  // In local mode we present a handoff gate between partners.
  const [localGate, setLocalGate] = useState(mode === "local");
  const who = me;
  const color = who === "p1" ? COLORS.p1 : COLORS.p2;
  const name = session.names[who];

  const roots = session.nodes.filter((n) => n.depth === 0);
  const myAnswered = session.nodes.filter((n) => n.answers[who]).length;
  const myTotal = session.nodes.length;
  const complete = isPartnerComplete(session.nodes, who);
  const pending = anyPending(session.nodes);

  if (mode === "local" && localGate) {
    const other = who === "p1" ? "p2" : "p1";
    const p1Done = isPartnerComplete(session.nodes, "p1") && session.p1Done;
    const p2Done = isPartnerComplete(session.nodes, "p2") && session.p2Done;
    return (
      <HandoffGate
        session={session}
        currentWho={who}
        onPick={(pick) => {
          setMe(pick);
          setLocalGate(false);
        }}
        p1Done={p1Done}
        p2Done={p2Done}
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderColor: color }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 12,
                background: color,
              }}
            />
            <div>
              <div style={{ fontWeight: 600 }}>
                {name}, these are your answers
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.soft }}>
                Only you can see them until you both finish.
              </div>
            </div>
          </div>
          <div style={{ minWidth: 160 }}>
            <ProgressBar done={myAnswered} total={myTotal} color={color} />
          </div>
        </div>
      </Card>

      {roots.map((root, i) => (
        <QuestionBlock
          key={root.id}
          index={i + 1}
          node={root}
          nodes={session.nodes}
          who={who}
          color={color}
          onAnswer={onAnswer}
          onSpawn={onSpawn}
        />
      ))}

      <Card>
        {!complete && (
          <div style={{ fontSize: 13.5, color: COLORS.soft, marginBottom: 12 }}>
            {pending
              ? "Generating follow-up questions..."
              : "Answer every question. Any \"it depends\" may open a few sharper questions to answer right here."}
          </div>
        )}
        <button
          disabled={!complete || pending}
          onClick={onFinish}
          style={{
            ...primaryBtn,
            background: color,
            opacity: complete && !pending ? 1 : 0.5,
          }}
        >
          {complete ? "I am finished" : "Finish the remaining questions"}{" "}
          <Check size={15} />
        </button>
      </Card>
    </div>
  );
}

function HandoffGate({ session, currentWho, onPick, p1Done, p2Done }) {
  return (
    <Card>
      <h2 style={{ fontFamily: SERIF, marginTop: 0 }}>Whose turn is it?</h2>
      <p style={{ color: COLORS.soft, marginTop: 0 }}>
        Hand the device to the next person. Each of you answers everything you
        can, including any follow-ups the other created, until you are both done.
      </p>
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        <button
          onClick={() => onPick("p1")}
          style={{
            ...turnBtn,
            borderColor: COLORS.p1,
            color: COLORS.p1,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 12,
                background: COLORS.p1,
              }}
            />
            {session.names.p1}
          </span>
          <span style={{ fontSize: 13, color: COLORS.soft }}>
            {p1Done ? "done for now" : "continue"}
          </span>
        </button>
        <button
          onClick={() => onPick("p2")}
          style={{
            ...turnBtn,
            borderColor: COLORS.p2,
            color: COLORS.p2,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 12,
                background: COLORS.p2,
              }}
            />
            {session.names.p2}
          </span>
          <span style={{ fontSize: 13, color: COLORS.soft }}>
            {p2Done ? "done for now" : "continue"}
          </span>
        </button>
      </div>
    </Card>
  );
}

function QuestionBlock({ index, node, nodes, who, color, onAnswer, onSpawn }) {
  const kids = childrenOf(nodes, node.id);
  const ans = node.answers[who];
  const needsKids = nodeNeedsFollowups(nodes, node, who);
  const isPending = node.pending && Date.now() - node.pending.ts < 30000;

  return (
    <Card>
      {index != null && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 6,
          }}
        >
          {THEME_LABELS[node.theme]}
        </div>
      )}
      <div style={{ fontSize: 16.5, lineHeight: 1.5, fontWeight: 500 }}>
        {index != null ? index + ". " : ""}
        {node.text}
      </div>
      {node.context && (
        <div
          style={{
            fontSize: 13,
            color: COLORS.soft,
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          {node.context}
        </div>
      )}
      <ChoiceRow
        value={ans ? ans.choice : null}
        color={color}
        onChoose={(c) => onAnswer(node.id, c, ans ? ans.note : "")}
      />
      {ans && (
        <input
          value={ans.note || ""}
          onChange={(e) => onAnswer(node.id, ans.choice, e.target.value)}
          placeholder="Add a note (optional)"
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginTop: 10,
            padding: "9px 12px",
            borderRadius: 9,
            border: "1px solid " + COLORS.line,
            background: "#fff",
            fontSize: 13.5,
            fontFamily: SANS,
            outline: "none",
          }}
        />
      )}

      {(kids.length > 0 || isPending || needsKids) && (
        <div
          style={{
            marginTop: 14,
            marginLeft: 6,
            paddingLeft: 14,
            borderLeft: "2px solid " + COLORS.line,
            display: "grid",
            gap: 12,
          }}
        >
          {isPending && kids.length === 0 && (
            <div style={{ fontSize: 13, color: COLORS.soft }}>
              Opening a few sharper questions...
            </div>
          )}
          {needsKids && !isPending && kids.length === 0 && (
            <button
              onClick={() => onSpawn(node.id)}
              style={{ ...secondaryBtn, alignSelf: "start" }}
            >
              <Plus size={14} /> Open follow-up questions
            </button>
          )}
          {kids.map((kid) => (
            <QuestionBlock
              key={kid.id}
              index={null}
              node={kid}
              nodes={nodes}
              who={who}
              color={color}
              onAnswer={onAnswer}
              onSpawn={onSpawn}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function ChoiceRow({ value, color, onChoose }) {
  const opts = [
    { k: "yes", label: "Yes" },
    { k: "no", label: "No" },
    { k: "depends", label: "It depends" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
      {opts.map((o) => {
        const active = value === o.k;
        return (
          <button
            key={o.k}
            onClick={() => onChoose(o.k)}
            style={{
              flex: "1 1 90px",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1.5px solid " + (active ? color : COLORS.line),
              background: active ? color : "#fff",
              color: active ? "#fff" : COLORS.ink,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: SANS,
              transition: "all 0.15s",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function WaitingScreen({ session, me }) {
  const other = me === "p1" ? "p2" : "p1";
  const otherName = session.names[other];
  const otherDone =
    (other === "p1" ? session.p1Done : session.p2Done) &&
    isPartnerComplete(session.nodes, other);
  return (
    <Card style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Seam size={48} />
      </div>
      <h2 style={{ fontFamily: SERIF, margin: "0 0 8px" }}>
        Your answers are in
      </h2>
      <p style={{ color: COLORS.soft, maxWidth: 460, margin: "0 auto" }}>
        {otherDone
          ? "You are both finished. Preparing your side by side document."
          : "Waiting for " +
            otherName +
            " to finish. The document appears for both of you once you are both done. Their answers stay hidden until then."}
      </p>
      <div
        style={{
          marginTop: 22,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: COLORS.soft,
        }}
      >
        <RefreshCw size={14} /> Checking automatically
      </div>
    </Card>
  );
}

// ----- Result / term sheet -----
function ResultScreen({ session, mutate, me, overview, setOverview }) {
  const [collapsed, setCollapsed] = useState({});
  const [genBusy, setGenBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const themes = Array.from(new Set(SEED_QUESTIONS.map((q) => q.theme)));
  const roots = session.nodes.filter((n) => n.depth === 0);

  // Tally on root topics only.
  let aligned = 0,
    differ = 0,
    open = 0;
  const openTopics = [];
  for (const r of roots) {
    const st = pairStatus(r.answers.p1, r.answers.p2);
    if (st === "aligned") aligned++;
    else if (st === "differ") {
      differ++;
      openTopics.push(r);
    } else {
      open++;
      openTopics.push(r);
    }
  }

  async function genOverview() {
    setGenBusy(true);
    const lines = roots.map((r) => {
      return (
        "- " +
        THEME_LABELS[r.theme] +
        ": " +
        session.names.p1 +
        " " +
        choiceLabel(r.answers.p1 ? r.answers.p1.choice : null) +
        ", " +
        session.names.p2 +
        " " +
        choiceLabel(r.answers.p2 ? r.answers.p2.choice : null)
      );
    });
    const system =
      "You summarize where an engaged couple stands on prenup values. " +
      "Write one warm, direct paragraph, 3 to 5 sentences. Name where they align and where they differ. " +
      "Do not give legal advice. Never use em dashes.";
    const content =
      session.names.p1 +
      " and " +
      session.names.p2 +
      " answered these questions:\n" +
      lines.join("\n") +
      "\nWrite the one paragraph overview.";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system,
          messages: [{ role: "user", content }],
        }),
      });
      const data = await res.json();
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) {
        setOverview(text);
        mutate((d) => {
          d.overview = text;
        });
      }
    } catch (e) {
      // ignore
    }
    setGenBusy(false);
  }

  function buildMarkdown() {
    let md = "# Two Voices term sheet\n\n";
    md +=
      session.names.p1 + " and " + session.names.p2 + "\n\n";
    md +=
      "This is a values map to bring to your attorney, not legal advice or a binding agreement.\n\n";
    if (overview) md += overview + "\n\n";
    md +=
      "Aligned: " +
      aligned +
      "  |  To negotiate: " +
      differ +
      "  |  Open: " +
      open +
      "\n\n";
    for (const theme of themes) {
      const tr = roots.filter((r) => r.theme === theme);
      if (tr.length === 0) continue;
      md += "## " + THEME_LABELS[theme] + "\n\n";
      for (const r of tr) {
        const st = pairStatus(r.answers.p1, r.answers.p2);
        md += "### " + r.text + "\n";
        md += "- Status: " + STATUS[st].label + "\n";
        md +=
          "- " +
          session.names.p1 +
          ": " +
          choiceLabel(r.answers.p1 ? r.answers.p1.choice : null) +
          (r.answers.p1 && r.answers.p1.note
            ? " (" + r.answers.p1.note + ")"
            : "") +
          "\n";
        md +=
          "- " +
          session.names.p2 +
          ": " +
          choiceLabel(r.answers.p2 ? r.answers.p2.choice : null) +
          (r.answers.p2 && r.answers.p2.note
            ? " (" + r.answers.p2.note + ")"
            : "") +
          "\n";
        const kids = childrenOf(session.nodes, r.id);
        for (const k of kids) {
          md += "  - Follow-up: " + k.text + "\n";
          md +=
            "    - " +
            session.names.p1 +
            ": " +
            choiceLabel(k.answers.p1 ? k.answers.p1.choice : null) +
            "\n";
          md +=
            "    - " +
            session.names.p2 +
            ": " +
            choiceLabel(k.answers.p2 ? k.answers.p2.choice : null) +
            "\n";
        }
        md += "\n";
      }
    }
    md += "## Bring these to your attorney\n\n";
    if (openTopics.length === 0) {
      md += "You aligned on every topic.\n";
    } else {
      for (const t of openTopics) md += "- " + t.text + "\n";
    }
    return md;
  }

  function download() {
    const blob = new Blob([buildMarkdown()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "two-voices-term-sheet.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyAll() {
    try {
      navigator.clipboard.writeText(buildMarkdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      // ignore
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 6,
          }}
        >
          <Seam size={40} />
          <h1 style={{ fontFamily: SERIF, fontSize: 26, margin: 0 }}>
            Your term sheet
          </h1>
        </div>
        <p style={{ color: COLORS.soft, margin: "4px 0 14px" }}>
          {session.names.p1} and {session.names.p2}, here is where you both
          stand.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Tally n={aligned} label="aligned" color={COLORS.aligned} bg={COLORS.alignedBg} />
          <Tally n={differ} label="to negotiate" color={COLORS.differ} bg={COLORS.differBg} />
          <Tally n={open} label="open" color={COLORS.explore} bg={COLORS.exploreBg} />
        </div>

        <div
          className="tv-noprint"
          style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}
        >
          <button onClick={() => window.print()} style={secondaryBtn}>
            <Printer size={15} /> Print or save PDF
          </button>
          <button onClick={download} style={secondaryBtn}>
            <Download size={15} /> Download markdown
          </button>
          <button onClick={copyAll} style={secondaryBtn}>
            {copied ? <Check size={15} /> : <Copy size={15} />} Copy
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 12.5,
            color: COLORS.soft,
            fontStyle: "italic",
            borderLeft: "3px solid " + COLORS.line,
            paddingLeft: 12,
          }}
        >
          This is a values map to bring to your attorney, not legal advice or a
          binding agreement.
        </div>
      </Card>

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ fontFamily: SERIF, margin: 0 }}>In plain English</h3>
          {me === "p1" && (
            <button
              className="tv-noprint"
              onClick={genOverview}
              disabled={genBusy}
              style={{ ...secondaryBtn, opacity: genBusy ? 0.6 : 1 }}
            >
              {genBusy ? "Writing..." : overview ? "Rewrite" : "Generate overview"}
            </button>
          )}
        </div>
        {overview ? (
          <p style={{ lineHeight: 1.65, marginBottom: 0 }}>{overview}</p>
        ) : (
          <p style={{ color: COLORS.soft, marginBottom: 0 }}>
            {me === "p1"
              ? "Generate a one paragraph plain English summary you can both read."
              : "Your partner can generate a short plain English summary here."}
          </p>
        )}
      </Card>

      {themes.map((theme) => {
        const tr = roots.filter((r) => r.theme === theme);
        if (tr.length === 0) return null;
        return (
          <div key={theme} style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 19,
                fontWeight: 600,
                marginTop: 6,
              }}
            >
              {THEME_LABELS[theme]}
            </div>
            {tr.map((r) => (
              <TopicRow
                key={r.id}
                node={r}
                nodes={session.nodes}
                names={session.names}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
              />
            ))}
          </div>
        );
      })}

      <Card style={{ borderColor: COLORS.differ }}>
        <h3 style={{ fontFamily: SERIF, marginTop: 0 }}>
          Bring these to your attorney
        </h3>
        {openTopics.length === 0 ? (
          <p style={{ color: COLORS.soft, margin: 0 }}>
            You aligned on every topic. Still worth a professional review.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {openTopics.map((t) => (
              <li key={t.id}>{t.text}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Tally({ n, label, color, bg }) {
  return (
    <div
      style={{
        background: bg,
        border: "1px solid " + color,
        borderRadius: 12,
        padding: "10px 16px",
        minWidth: 92,
      }}
    >
      <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color }}>
        {n}
      </div>
      <div style={{ fontSize: 12.5, color }}>{label}</div>
    </div>
  );
}

function TopicRow({ node, nodes, names, collapsed, setCollapsed }) {
  const st = pairStatus(node.answers.p1, node.answers.p2);
  const status = STATUS[st];
  const kids = childrenOf(nodes, node.id);
  const isOpen = !collapsed[node.id];

  return (
    <Card>
      <div style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.5 }}>
        {node.text}
      </div>
      <div style={{ marginTop: 4, marginBottom: 12 }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 12,
            fontWeight: 700,
            color: status.color,
            background: status.bg,
            border: "1px solid " + status.color,
            borderRadius: 20,
            padding: "3px 11px",
          }}
        >
          {status.label}
        </span>
      </div>
      <SideBySide node={node} names={names} />

      {kids.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            className="tv-noprint"
            onClick={() =>
              setCollapsed((c) => ({ ...c, [node.id]: !c[node.id] }))
            }
            style={{
              ...ghostBtn,
              fontSize: 12.5,
            }}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {kids.length} follow-up {kids.length === 1 ? "question" : "questions"}
          </button>
          <div className={isOpen ? "" : "tv-collapsed"}>
            {isOpen && (
              <div
                style={{
                  marginTop: 10,
                  paddingLeft: 14,
                  borderLeft: "2px solid " + COLORS.line,
                  display: "grid",
                  gap: 12,
                }}
              >
                {kids.map((k) => (
                  <div key={k.id}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{k.text}</div>
                    <div style={{ marginTop: 8 }}>
                      <SideBySide node={k} names={names} small />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function SideBySide({ node, names, small }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 2px 1fr",
        alignItems: "stretch",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid " + COLORS.line,
      }}
    >
      <AnswerCell
        color={COLORS.p1}
        name={names.p1}
        ans={node.answers.p1}
        small={small}
      />
      <div style={{ background: COLORS.line }} />
      <AnswerCell
        color={COLORS.p2}
        name={names.p2}
        ans={node.answers.p2}
        small={small}
        right
      />
    </div>
  );
}

function AnswerCell({ color, name, ans, small, right }) {
  return (
    <div
      style={{
        padding: small ? "10px 12px" : "12px 14px",
        background: "#fff",
        textAlign: right ? "right" : "left",
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: small ? 15 : 17, fontWeight: 600, marginTop: 2 }}>
        {choiceLabel(ans ? ans.choice : null)}
      </div>
      {ans && ans.note && (
        <div
          style={{
            fontSize: 12.5,
            color: COLORS.soft,
            marginTop: 4,
            lineHeight: 1.45,
          }}
        >
          {ans.note}
        </div>
      )}
    </div>
  );
}

function PrintStyles() {
  return (
    <style>{`
      @media print {
        .tv-noprint { display: none !important; }
        .tv-collapsed { display: block !important; }
        body { background: #fff !important; }
      }
      * { box-sizing: border-box; }
      button { font-family: ${SANS}; }
      input::placeholder { color: #A8A89E; }
    `}</style>
  );
}

// ----- shared button styles -----
const primaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: COLORS.p1,
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "11px 18px",
  fontSize: 14.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: SANS,
};

const secondaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "#fff",
  color: COLORS.ink,
  border: "1px solid " + COLORS.line,
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: SANS,
};

const ghostBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  color: COLORS.soft,
  border: "none",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: SANS,
};

const turnBtn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "#fff",
  border: "1.5px solid",
  borderRadius: 12,
  padding: "16px 18px",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: SANS,
};
