const mins = s => {
  const [h, m] = String(s || "00:00").split(":").map(Number);
  return h * 60 + m;
};

const clock = n =>
  `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

const dateKey = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const dayDiff = (a, b) =>
  Math.round(
    (new Date(`${a}T12:00`) - new Date(`${b}T12:00`)) / 86400000
  );

const priorityScore = {
  high: 3,
  medium: 2,
  low: 1
};

export function horizon(workspace, now = new Date()) {
  const span = workspace.tasks
    .filter(t => t.status === "open" && t.deadline)
    .reduce(
      (max, t) => Math.max(max, dayDiff(t.deadline, dateKey(now))),
      0
    );

  if (span > 14 && span <= 60) return 21;
  if (span > 7 && span <= 30) return 14;

  return 7;
}

function normalizeCommitment(c) {
  const start = mins(c.start);
  let end = mins(c.end);

  /*
   * Repair old malformed commitments already stored in localStorage.
   * Example: 20:40–19:00 becomes 20:40–21:40.
   */
  if (!Number.isFinite(start)) return null;

  if (!Number.isFinite(end) || end <= start) {
    end = start + 60;
  }

  return {
    ...c,
    start: clock(start),
    end: clock(end)
  };
}

function subtract(ranges, blocked) {
  for (const [a, b] of blocked
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && y > x)
    .sort((x, y) => x[0] - y[0])) {

    const next = [];

    for (const [x, y] of ranges) {
      if (b <= x || a >= y) {
        next.push([x, y]);
      } else {
        if (x < a) next.push([x, a]);
        if (b < y) next.push([b, y]);
      }
    }

    ranges = next;
  }

  return ranges;
}

export function availability(workspace, date) {
  const p = {
    lectureStart: "10:30",
    lectureEnd: "17:30",
    lecturesEnabled: true,
    saturdayFreeAfter: "16:00",
    sundayRecovery: true,
    ...workspace.preferences
  };

  const dow = new Date(`${date}T12:00`).getDay();

  const start = mins(p.wake);
  const end =
    mins(p.sleep) + (mins(p.sleep) < start ? 1440 : 0);

  const commitments = workspace.commitments
    .filter(c => c.date === date)
    .map(normalizeCommitment)
    .filter(Boolean);

  workspace.commitments = workspace.commitments.map(c =>
    c.date === date ? normalizeCommitment(c) || c : c
  );

  let blocked = commitments.map(c => [
    mins(c.start),
    mins(c.end)
  ]);

  blocked.push([
    mins(p.lunchStart),
    mins(p.lunchEnd)
  ]);

  if (p.lecturesEnabled && dow >= 1 && dow <= 5) {
    blocked.push([
      mins(p.lectureStart),
      mins(p.lectureEnd)
    ]);
  }

  /*
   * Dinner is intentionally NOT blocked here.
   * It is placed separately by dinnerBlock() at the best available
   * point inside the dinner window.
   */

  if (dow === 6) {
    blocked.push([0, mins(p.saturdayFreeAfter)]);
  }

  if (dow === 0 && p.sundayRecovery) {
    blocked.push([start, end]);
  }

  blocked.push([
    Math.max(start, end - Number(p.protectedFreeMinutes || 120)),
    end
  ]);

  return subtract([[start, end]], blocked)
    .filter(([a, b]) => b - a >= 25);
}

function taskRank(task, today) {
  const days = task.deadline
    ? dayDiff(task.deadline, today)
    : 21;

  let score =
    (priorityScore[task.priority] || 1) * 1000 +
    Math.max(-200, 500 - days * 45);

  if (task.category === "SCOP") score += 180;
  if (task.category === "Synergy" || task.category === "InsightX") score -= 240;
  if (task.sameDayRevision) score -= 320;
  if (task.category === "Study" && days > 7) score -= 300;

  return score;
}

function isTooEarly(task, offset, today) {
  if (!task.deadline) return false;

  const until = dayDiff(task.deadline, today);

  return (
    until > 7 &&
    offset < Math.min(4, Math.floor(until / 3)) &&
    (task.category === "Study" || task.category === "Academic")
  );
}

function slotsFor(workspace, date, task) {
  const slots = availability(workspace, date);

  if (
    new Date(`${date}T12:00`).getDay() === 3 &&
    (task.category === "Study" || task.category === "Academic")
  ) {
    slots.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  }

  return slots;
}

/*
 * Find the best dinner slot inside the user's configured dinner window.
 *
 * Priority:
 * 1. Stay inside dinnerStart–dinnerEnd.
 * 2. Avoid hard commitments.
 * 3. Avoid lectures/lunch/protected sleep.
 * 4. Prefer the normal dinner start.
 */
function dinnerBlock(workspace, date) {
  const p = workspace.preferences;

  const windowStart = mins(p.dinnerStart || "20:00");
  const windowEnd = mins(p.dinnerEnd || "22:00");
  const duration = Number(p.dinnerMinutes || 45);

  if (windowEnd - windowStart < duration) {
    return null;
  }

  const dow = new Date(`${date}T12:00`).getDay();

  if (dow === 0) {
    return null;
  }

  const commitments = workspace.commitments
    .filter(c => c.date === date)
    .map(normalizeCommitment)
    .filter(Boolean);

  const blocked = [
    ...commitments.map(c => [mins(c.start), mins(c.end)])
  ];

  if (p.lecturesEnabled && dow >= 1 && dow <= 5) {
    blocked.push([
      mins(p.lectureStart),
      mins(p.lectureEnd)
    ]);
  }

  blocked.push([
    mins(p.lunchStart),
    mins(p.lunchEnd)
  ]);

  /*
   * Generate candidate dinner starts.
   * Start with the normal dinner time, then move forward around conflicts.
   */
  const candidates = [];

  for (
    let start = windowStart;
    start + duration <= windowEnd;
    start += 5
  ) {
    candidates.push(start);
  }

  for (const start of candidates) {
    const end = start + duration;

    const conflict = blocked.some(
      ([a, b]) => start < b && end > a
    );

    if (!conflict) {
      return {
        id: `dinner-${date}`,
        title: "Dinner",
        category: "Personal",
        date,
        start: clock(start),
        end: clock(end),
        minutes: duration,
        kind: "dinner"
      };
    }
  }

  /*
   * If there is genuinely no 45-minute slot in the window,
   * choose the largest available portion and tell the user.
   */
  const available = subtract(
    [[windowStart, windowEnd]],
    blocked
  );

  const best = available
    .filter(([a, b]) => b - a >= 20)
    .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];

  if (!best) {
    return null;
  }

  const actualDuration = Math.min(duration, best[1] - best[0]);

  return {
    id: `dinner-${date}`,
    title: "Dinner",
    category: "Personal",
    date,
    start: clock(best[0]),
    end: clock(best[0] + actualDuration),
    minutes: actualDuration,
    kind: "dinner"
  };
}

export function plan(workspace, now = new Date()) {
  const today = dateKey(now);
  const days = horizon(workspace, now);

  const blocks = [];
  const prompts = [];

  /*
   * Repair old malformed commitments every time planning runs.
   * This means pressing Replan can fix existing bad data too.
   */
  workspace.commitments = workspace.commitments
    .map(normalizeCommitment)
    .filter(Boolean);

  const tasks = workspace.tasks
    .filter(t => t.status === "open" && t.remainingMinutes > 0)
    .map(t => ({ ...t }));

  const remaining = new Map(
    tasks.map(t => [t.id, t.remainingMinutes])
  );

  const recoveryHigh =
    workspace.recovery?.load === "high" ||
    (
      (workspace.recovery?.hecticDates || [])
        .filter(d => {
          const diff = dayDiff(d, today);
          return diff >= 0 && diff <= 3;
        }).length >= 2
    );

  for (let offset = 0; offset < days; offset++) {
    const date = dateKey(addDays(now, offset));
    const scheduledToday = { minutes: 0 };

    const sorted = [...tasks]
      .filter(t => remaining.get(t.id) > 0)
      .sort(
        (a, b) =>
          taskRank(b, today) - taskRank(a, today)
      );

    /*
     * Place the dinner block first so academic/work blocks
     * can never consume its space.
     */
    const dinner = dinnerBlock(workspace, date);

    if (dinner) {
      blocks.push(dinner);
    }

    for (const task of sorted) {
      if (
        remaining.get(task.id) <= 0 ||
        isTooEarly(task, offset, today)
      ) {
        continue;
      }

      if (
        task.deadline &&
        dayDiff(task.deadline, date) < 0
      ) {
        continue;
      }

      for (const [a, b] of slotsFor(workspace, date, task)) {
        /*
         * Prevent task blocks from overlapping dinner.
         */
        const usableRanges = dinner
          ? subtract(
              [[a, b]],
              [[mins(dinner.start), mins(dinner.end)]]
            )
          : [[a, b]];

        for (const [slotStart, slotEnd] of usableRanges) {
          const left = remaining.get(task.id);
          const cap = slotEnd - slotStart;

          const dailyLimit =
            recoveryHigh && offset < 2
              ? 90
              : 240;

          const allowed = Math.max(
            0,
            dailyLimit - scheduledToday.minutes
          );

          const target = task.splitable
            ? Math.min(
                left,
                cap,
                task.category === "Study" ? 120 : 90,
                allowed
              )
            : Math.min(
                left,
                cap,
                allowed
              );

          if (target < 25) continue;

          blocks.push({
            id: `plan-${task.id}-${date}-${slotStart}`,
            taskId: task.id,
            title: task.title,
            category: task.category,
            date,
            start: clock(slotStart),
            end: clock(slotStart + target),
            minutes: target,
            kind:
              task.category === "Study"
                ? "study"
                : "work"
          });

          remaining.set(
            task.id,
            left - target
          );

          scheduledToday.minutes += target;
          break;
        }

        if (remaining.get(task.id) <= 0) break;
      }
    }
  }

  for (const task of tasks) {
    if (remaining.get(task.id) > 0) {
      prompts.push({
        id: `risk-${task.id}`,
        level: "ask",
        text:
          `${task.title} still has ${remaining.get(task.id)} minutes unscheduled` +
          `${task.deadline ? ` by ${task.deadline}` : ""}. ` +
          `I kept protected free time and sleep intact. ` +
          `Please reduce/split work or explicitly approve using protected time.`
      });
    }
  }

  const todayWork = blocks
    .filter(b => b.date === today && b.taskId)
    .reduce((n, b) => n + b.minutes, 0);

  if (todayWork > 180) {
    workspace.recovery.hecticDates = [
      ...(workspace.recovery?.hecticDates || []),
      today
    ].slice(-7);
  }

  if (recoveryHigh || todayWork > 180) {
    prompts.push({
      id: "recovery",
      level: "inform",
      text:
        "Recovery-aware plan: workload is lighter where possible; " +
        "sleep, dinner, and deliberate free time remain protected."
    });
  }

  if (
    new Date(now).getDay() === 1 &&
    workspace.preferences.weeklyBriefingSeen !== today
  ) {
    const risk = prompts.filter(
      p => p.level === "ask"
    ).length;

    prompts.unshift({
      id: "monday",
      level: risk ? "prompt" : "inform",
      text: risk
        ? `Weekly outlook: ${risk} deadline risk${risk > 1 ? "s" : ""}. Wednesday is reserved as the best deep-work opportunity.`
        : "Weekly outlook is manageable. Wednesday is your major deep-study opportunity and Sunday stays mostly free."
    });

    workspace.preferences.weeklyBriefingSeen = today;
  }

  workspace.plan = blocks;
  workspace.prompts = prompts;

  workspace.recovery = {
    ...workspace.recovery,
    load: recoveryHigh ? "moderate" : "normal",
    lastUpdated: new Date().toISOString()
  };

  return workspace;
}

export function markBlockDone(workspace, blockId) {
  const block = workspace.plan.find(
    b => b.id === blockId
  );

  const task =
    block &&
    workspace.tasks.find(
      t => t.id === block.taskId
    );

  if (task) {
    task.remainingMinutes = Math.max(
      0,
      task.remainingMinutes - block.minutes
    );

    if (task.remainingMinutes === 0) {
      task.status = "done";
      task.completedAt =
        new Date().toISOString();

      const old =
        workspace.estimates[task.category];

      workspace.estimates[task.category] =
        old
          ? Math.round(
              (old * 4 + task.estimateMinutes) / 5
            )
          : task.estimateMinutes;
    }
  }

  return workspace;
}

export function applyProgress(
  workspace,
  query,
  amount
) {
  const task = workspace.tasks
    .filter(t => t.status === "open")
    .find(
      t =>
        !query ||
        t.title.toLowerCase().includes(query) ||
        query.includes(t.title.toLowerCase())
    );

  if (!task) return false;

  let done = 0;

  if (amount === "half") {
    done = Math.ceil(
      task.remainingMinutes / 2
    );
  } else if (/%$/.test(amount)) {
    done = Math.round(
      task.remainingMinutes *
      Number.parseInt(amount) /
      100
    );
  } else {
    const n = Number.parseFloat(amount);

    done = Math.round(
      n * (/h/i.test(amount) ? 60 : 1)
    );
  }

  task.remainingMinutes = Math.max(
    0,
    task.remainingMinutes - done
  );

  if (task.remainingMinutes === 0) {
    task.status = "done";
    task.completedAt =
      new Date().toISOString();
  }

  return true;
}

export function cleanup(workspace) {
  const cutoff =
    Date.now() - 30 * 86400000;

  workspace.tasks =
    workspace.tasks.filter(
      t =>
        t.status !== "done" ||
        new Date(
          t.completedAt || 0
        ).getTime() > cutoff
    );

  workspace.commitments =
    workspace.commitments.filter(
      c =>
        new Date(
          `${c.date}T23:59`
        ).getTime() > cutoff
    );

  return workspace;
}
