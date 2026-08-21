import { uid } from "./store.js";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function parseDate(text, now) {
  const lower = text.toLowerCase();
  if (/\btoday\b/.test(lower)) return iso(now);
  if (/\btomorrow\b/.test(lower)) return iso(addDays(now, 1));
  for (let i=0;i<DAYS.length;i++) if (new RegExp(`\\b${DAYS[i]}\\b`).test(lower)) { let n=(i-now.getDay()+7)%7; if(n===0 && /next\s+/.test(lower)) n=7; return iso(addDays(now,n)); }
  const m=lower.match(/(?:due\s+)?(?:on\s+)?(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
  if(!m) return null; const year=m[3]?Number(m[3].length===2?`20${m[3]}`:m[3]):now.getFullYear(); return `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
}
// Spec's own examples include word-number durations ("study statistics for two hours", "for an hour"),
// which the numeric-only pattern below silently misses and falls back to a category default estimate for.
const WORD_NUMBERS={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,half:0.5};
function duration(text, fallback) {
  const m=text.match(/(?:about |around |for )?(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i);
  if(m) return Math.round(Number(m[1])*(/h/i.test(m[2])?60:1));
  const wm=text.match(/\b(half(?:\s+an)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i);
  if(wm){ const key=wm[1].toLowerCase().replace(/\s+an$/,""); const n=WORD_NUMBERS[key]; if(n!=null) return Math.round(n*(/h/i.test(wm[2])?60:1)); }
  return fallback;
}
function parseTime(text) { const m=text.match(/(?:\bat\s*|\bfrom\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*(?:-|to|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i); if(!m)return null; const cv=(h,min,amp)=>{h=Number(h);if(amp?.toLowerCase()==="pm"&&h<12)h+=12;if(amp?.toLowerCase()==="am"&&h===12)h=0;return `${pad(h)}:${pad(min||0)}`;};return {start:cv(m[1],m[2],m[3]),end:m[4]?cv(m[4],m[5],m[6]||m[3]):null}; }
const toMinutes = hm => { const [h,m] = hm.split(":").map(Number); return h*60+m; };
// Clamp (not wrap) so a bad/overflowing computation can never silently produce a next-day time; overnight events are not supported.
const toClock = n => { const c = Math.max(0, Math.min(23*60+59, n)); return `${pad(Math.floor(c/60))}:${pad(c%60)}`; };
const taskTitle = text => text.replace(/\b(i have|i need to|need to|please|add)\b/ig, "").replace(/\b(due|by)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*$/i, "").trim();
const normalize = text => text.toLowerCase().replace(/\b(the|my|a|an)\b/g," ").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();

export function interpret(text, now=new Date(), patterns={}) {
  const lower=text.toLowerCase(), date=parseDate(text,now);
  if(/\b(exhausted|tired|burnt out|burned out)\b/.test(lower)) return {type:"recovery",value:{load:"high"},notes:["I’ll make the next plan lighter and protect your sleep and free time."]};
  const progress=lower.match(/(?:only\s+)?(?:completed|finished|did)\s+(half|\d+%|\d+\s*(?:minutes?|mins?|hours?|hrs?))\b(?:\s+(?:of|on))?\s*(.*)/);
  if(progress) return {type:"progress",value:{amount:progress[1],query:normalize(progress[2])},notes:[]};
  const completed=lower.match(/(?:finished|completed|done with)\s+(.+)/);
  if(completed) return {type:"completeByText",value:normalize(completed[1]),notes:[]};
  // "meet"/"meetup" must be recognized alongside "meeting" or e.g. "SCOP meet at 20:30" silently
  // falls through to the task branch below and gets scheduled as flexible work instead of a hard commitment.
  const commitmentWords=/\b(meeting|meetup|meet|lecture|class|appointment|event|busy|call|interview)\b/.test(lower);
  const taskWords=/\b(need|finish|study|work on|assignment|project|presentation|report|revision)\b/.test(lower);
  const category=/scop/.test(lower)?"SCOP":/synergy/.test(lower)?"Synergy":/insightx/.test(lower)?"InsightX":/exam|study|revision|revise/.test(lower)?"Study":/assignment|project|presentation|report/.test(lower)?"Academic":"Personal";
  if(commitmentWords&&!taskWords){
    const t=parseTime(text);
    const startStr=t?.start||"18:00", startMin=toMinutes(startStr);
    const explicitDur=duration(text,null);
    // Default meeting duration is 60 minutes when only a start time is given. If an explicit end time was
    // parsed but is nonsensical (<= start, e.g. from a bad match), fall back to start+60 rather than ever
    // emitting an end <= start block.
    let endMin = t?.end ? toMinutes(t.end) : null;
    if(endMin===null || endMin<=startMin) endMin = startMin + (explicitDur||60);
    const lowerPriority=/synergy|insightx/.test(lower);
    return {type:"commitment",value:{id:uid(),title:taskTitle(text)||"Commitment",date:date||iso(now),start:startStr,end:toClock(endMin),hard:true,priority:lowerPriority?"low":category==="SCOP"?"high":"normal",source:"user"},notes:[]};
  }
  const explicit=duration(text,null), estimate=explicit||patterns[category]||(category==="Study"?90:category==="SCOP"?60:category==="Academic"?120:45);
  // Tier alignment with the stated priority hierarchy: urgent language and Academic deadlines are Tier 3
  // (high); SCOP, Synergy, and Study/revision work are Tier 4 (medium, "important but flexible");
  // InsightX and everything else default to Tier 5 (low).
  const priority=/urgent|asap|tomorrow|today/.test(lower)?"high":category==="Academic"?"high":(category==="Study"||category==="SCOP"||category==="Synergy")?"medium":"low";
  return {type:"task",value:{id:uid(),title:taskTitle(text)||text,category,deadline:date,priority,estimateMinutes:estimate,remainingMinutes:estimate,splitable:!/presentation|exam/.test(lower),sameDayRevision:/revision|revise/.test(lower),flexibility:priority==="high"?"normal":"flexible",createdAt:now.toISOString(),status:"open"},notes:explicit?[]:[`Estimated ${estimate} minutes. You can mark a block done or tell me partial progress later.`]};
}
