import { uid } from "./store.js";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

function parseDate(text, now) {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) return iso(now);
  if (/\btomorrow\b/.test(lower)) return iso(addDays(now, 1));

  for (let i = 0; i < DAYS.length; i++) {
    if (new RegExp(`\\b${DAYS[i]}\\b`).test(lower)) {
      let n = (i - now.getDay() + 7) % 7;
      if (n === 0 && /next\s+/.test(lower)) n = 7;
      return iso(addDays(now, n));
    }
  }

  const m = lower.match(/(?:due\s+)?(?:on\s+)?(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
  if (!m) return null;

  const year = m[3]
    ? Number(m[3].length === 2 ? `20${m[3]}` : m[3])
    : now.getFullYear();

  return `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
}

function duration(text, fallback) {
  const m = text.match(
    /(?:about |around |for )?(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i
  );

  return m
    ? Math.round(Number(m[1]) * (/h/i.test(m[2]) ? 60 : 1))
    : fallback;
}

function parseTime(text) {
  const m = text.match(
    /(?:\bat\s*|\bfrom\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*(?:-|to|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i
  );

  if (!m) return null;

  const cv = (h, min, amp) => {
    h = Number(h);

    if (amp?.toLowerCase() === "pm" && h < 12) h += 12;
    if (amp?.toLowerCase() === "am" && h === 12) h = 0;

    return `${pad(h)}:${pad(min || 0)}`;
  };

  const start = cv(m[1], m[2], m[3]);

  let end = null;

  if (m[4]) {
    end = cv(m[4], m[5], m[6] || m[3]);
  }

  /*
   * If the user gives only a start time, assume a normal
   * 60-minute commitment instead of inventing 19:00.
   */
  if (!end) {
    const [h, min] = start.split(":").map(Number);
    const total = h * 60 + min + 60;
    end = `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
  }

  /*
   * Never allow an end time earlier than the start time.
   * This also protects against malformed inputs such as 20:40–19:00.
   */
  const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
  const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));

  if (endMinutes <= startMinutes) {
    const total = startMinutes + 60;
    end = `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
  }

  return { start, end };
}

const taskTitle = text =>
  text
    .replace(/\b(i have|i need to|need to|please|add)\b/ig, "")
    .replace(
      /\b(due|by)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*$/i,
      ""
    )
    .trim();

const normalize = text =>
  text
    .toLowerCase()
    .replace(/\b(the|my|a|an)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function interpret(text, now = new Date(), patterns = {}) {
  const lower = text.toLowerCase();
  const date = parseDate(text, now);

  if (/\b(exhausted|tired|burnt out|burned out)\b/.test(lower)) {
    return {
      type: "recovery",
      value: { load: "high" },
      notes: ["I’ll make the next plan lighter and protect your sleep and free time."]
    };
  }

  const progress = lower.match(
    /(?:only\s+)?(?:completed|finished|did)\s+(half|\d+%|\d+\s*(?:minutes?|mins?|hours?|hrs?))\b(?:\s+(?:of|on))?\s*(.*)/
  );

  if (progress) {
    return {
      type: "progress",
      value: {
        amount: progress[1],
        query: normalize(progress[2])
      },
      notes: []
    };
  }

  const completed = lower.match(/(?:finished|completed|done with)\s+(.+)/);

  if (completed) {
    return {
      type: "completeByText",
      value: normalize(completed[1]),
      notes: []
    };
  }

  const commitmentWords =
    /\b(meeting|lecture|class|appointment|event|busy|call|interview)\b/.test(lower);

  const taskWords =
    /\b(need|finish|study|work on|assignment|project|presentation|report|revision)\b/.test(lower);

  const category =
    /scop/.test(lower)
      ? "SCOP"
      : /synergy/.test(lower)
      ? "Synergy"
      : /insightx/.test(lower)
      ? "InsightX"
      : /exam|study|revision|revise/.test(lower)
      ? "Study"
      : /assignment|project|presentation|report/.test(lower)
      ? "Academic"
      : "Personal";

  if (commitmentWords && !taskWords) {
    const t = parseTime(text);
    const lowerPriority = /synergy|insightx/.test(lower);

    return {
      type: "commitment",
      value: {
        id: uid(),
        title: taskTitle(text) || "Commitment",
        date: date || iso(now),
        start: t?.start || "18:00",
        end: t?.end || "19:00",
        hard: true,
        priority: lowerPriority
          ? "low"
          : category === "SCOP"
          ? "high"
          : "normal",
        source: "user"
      },
      notes: []
    };
  }

  const explicit = duration(text, null);
  const estimate =
    explicit ||
    patterns[category] ||
    (category === "Study"
      ? 90
      : category === "SCOP"
      ? 60
      : category === "Academic"
      ? 120
      : 45);

  const priority =
    /urgent|asap|tomorrow|today/.test(lower)
      ? "high"
      : category === "SCOP" || category === "Academic"
      ? "high"
      : category === "Study"
      ? "medium"
      : "low";

  return {
    type: "task",
    value: {
      id: uid(),
      title: taskTitle(text) || text,
      category,
      deadline: date,
      priority,
      estimateMinutes: estimate,
      remainingMinutes: estimate,
      splitable: !/presentation|exam/.test(lower),
      sameDayRevision: /revision|revise/.test(lower),
      flexibility: priority === "high" ? "normal" : "flexible",
      createdAt: now.toISOString(),
      status: "open"
    },
    notes: explicit
      ? []
      : [`Estimated ${estimate} minutes. You can mark a block done or tell me partial progress later.`]
  };
}
