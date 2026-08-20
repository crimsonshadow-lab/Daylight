const mins = s => { const [h,m]=s.split(":").map(Number); return h*60+m; };
const clock = n => `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const dayDiff=(a,b)=>Math.round((new Date(`${a}T12:00`)-new Date(`${b}T12:00`))/86400000);
const priorityScore={high:3,medium:2,low:1};

export function horizon(workspace, now=new Date()) {
  const span=workspace.tasks.filter(t=>t.status==="open"&&t.deadline).reduce((max,t)=>Math.max(max,dayDiff(t.deadline,dateKey(now))),0);
  if(span>14 && span<=60) return 21; if(span>7 && span<=30) return 14; return 7;
}
function subtract(ranges, blocked) { for(const [a,b] of blocked.sort((x,y)=>x[0]-y[0])) { const next=[]; for(const [x,y] of ranges){if(b<=x||a>=y)next.push([x,y]);else{if(x<a)next.push([x,a]);if(b<y)next.push([b,y]);}} ranges=next; } return ranges; }
export function availability(workspace, date) {
  const p={...{lectureStart:"10:30",lectureEnd:"17:30",lecturesEnabled:true,saturdayFreeAfter:"16:00",sundayRecovery:true},...workspace.preferences};
  const dow=new Date(`${date}T12:00`).getDay(), start=mins(p.wake), end=mins(p.sleep)+(mins(p.sleep)<start?1440:0);
  let blocked=workspace.commitments.filter(c=>c.date===date).map(c=>[mins(c.start),mins(c.end)]);
  blocked.push([mins(p.lunchStart),mins(p.lunchEnd)]);
  if(p.lecturesEnabled&&dow>=1&&dow<=5) blocked.push([mins(p.lectureStart),mins(p.lectureEnd)]);
  // Dinner remains a movable, protected meal window; planner creates the chosen block separately.
  blocked.push([mins(p.dinnerStart),mins(p.dinnerEnd)]);
  if(dow===6) blocked.push([0,mins(p.saturdayFreeAfter)]);
  if(dow===0&&p.sundayRecovery) blocked.push([start,end]);
  blocked.push([Math.max(start,end-Number(p.protectedFreeMinutes||120)),end]);
  return subtract([[start,end]],blocked).filter(([a,b])=>b-a>=25);
}
function taskRank(task,today) {
  const days=task.deadline?dayDiff(task.deadline,today):21; let score=(priorityScore[task.priority]||1)*1000+Math.max(-200,500-days*45);
  if(task.category==="SCOP") score+=180;
  if(task.category==="Synergy"||task.category==="InsightX") score-=240;
  if(task.sameDayRevision) score-=320;
  if(task.category==="Study"&&days>7) score-=300;
  return score;
}
function isTooEarly(task, offset, today) { if(!task.deadline)return false;const until=dayDiff(task.deadline,today); return until>7&&offset<Math.min(4,Math.floor(until/3))&&(task.category==="Study"||task.category==="Academic"); }
function slotsFor(workspace,date,task) { const slots=availability(workspace,date); if(new Date(`${date}T12:00`).getDay()===3&&(task.category==="Study"||task.category==="Academic")) slots.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0])); return slots; }
function dinnerBlock(workspace,date) { const p=workspace.preferences, start=mins(p.dinnerStart), duration=Number(p.dinnerMinutes||45); return {id:`dinner-${date}`,title:"Dinner",category:"Personal",date,start:clock(start),end:clock(start+duration),minutes:duration,kind:"dinner"}; }

export function plan(workspace, now=new Date()) {
  const today=dateKey(now), days=horizon(workspace,now), blocks=[], prompts=[];
  const tasks=workspace.tasks.filter(t=>t.status==="open"&&t.remainingMinutes>0).map(t=>({...t})); const remaining=new Map(tasks.map(t=>[t.id,t.remainingMinutes]));
  const recoveryHigh=workspace.recovery?.load==="high"||((workspace.recovery?.hecticDates||[]).filter(d=>dayDiff(today,d)>=0&&dayDiff(today,d)<=3).length>=2);
  for(let offset=0;offset<days;offset++) {
    const date=dateKey(addDays(now,offset)); const scheduledToday={minutes:0}; const sorted=[...tasks].filter(t=>remaining.get(t.id)>0).sort((a,b)=>taskRank(b,today)-taskRank(a,today));
    for(const task of sorted) {
      if(remaining.get(task.id)<=0||isTooEarly(task,offset,today)) continue;
      if(task.deadline&&dayDiff(task.deadline,date)<0)continue;
      for(const [a,b] of slotsFor(workspace,date,task)) { const left=remaining.get(task.id), cap=b-a; const dailyLimit=(recoveryHigh&&offset<2)?90:240; const allowed=Math.max(0,dailyLimit-scheduledToday.minutes); const target=task.splitable?Math.min(left,cap,task.category==="Study"?120:90,allowed):Math.min(left,cap,allowed); if(target<25)continue;
        blocks.push({id:`plan-${task.id}-${date}-${a}`,taskId:task.id,title:task.title,category:task.category,date,start:clock(a),end:clock(a+target),minutes:target,kind:task.category==="Study"?"study":"work"}); remaining.set(task.id,left-target); scheduledToday.minutes+=target; break;
      }
    }
    if(new Date(`${date}T12:00`).getDay()!==0) blocks.push(dinnerBlock(workspace,date));
  }
  for(const task of tasks) if(remaining.get(task.id)>0) prompts.push({id:`risk-${task.id}`,level:"ask",text:`${task.title} still has ${remaining.get(task.id)} minutes unscheduled${task.deadline?` by ${task.deadline}`:""}. I kept protected free time and sleep intact. Please reduce/split work or explicitly approve using protected time.`});
  const todayWork=blocks.filter(b=>b.date===today&&b.taskId).reduce((n,b)=>n+b.minutes,0); if(todayWork>180){workspace.recovery.hecticDates=[...(workspace.recovery?.hecticDates||[]),today].slice(-7);}
  if(recoveryHigh||todayWork>180) prompts.push({id:"recovery",level:"inform",text:"Recovery-aware plan: workload is lighter where possible; sleep, dinner, and deliberate free time remain protected."});
  if(new Date(now).getDay()===1&&workspace.preferences.weeklyBriefingSeen!==today){const risk=prompts.filter(p=>p.level==="ask").length;prompts.unshift({id:"monday",level:risk?"prompt":"inform",text:risk?`Weekly outlook: ${risk} deadline risk${risk>1?"s":""}. Wednesday is reserved as the best deep-work opportunity.`:`Weekly outlook is manageable. Wednesday is your major deep-study opportunity and Sunday stays mostly free.`});workspace.preferences.weeklyBriefingSeen=today;}
  workspace.plan=blocks;workspace.prompts=prompts;workspace.recovery={...workspace.recovery,load:recoveryHigh?"moderate":"normal",lastUpdated:new Date().toISOString()};return workspace;
}
export function markBlockDone(workspace,blockId){const block=workspace.plan.find(b=>b.id===blockId),task=block&&workspace.tasks.find(t=>t.id===block.taskId);if(task){task.remainingMinutes=Math.max(0,task.remainingMinutes-block.minutes);if(task.remainingMinutes===0){task.status="done";task.completedAt=new Date().toISOString();const old=workspace.estimates[task.category];workspace.estimates[task.category]=old?Math.round((old*4+task.estimateMinutes)/5):task.estimateMinutes;}}return workspace;}
export function applyProgress(workspace,query,amount){const task=workspace.tasks.filter(t=>t.status==="open").find(t=>!query||t.title.toLowerCase().includes(query)||query.includes(t.title.toLowerCase()));if(!task)return false;let done=0;if(amount==="half")done=Math.ceil(task.remainingMinutes/2);else if(/%$/.test(amount))done=Math.round(task.remainingMinutes*Number.parseInt(amount)/100);else{const n=Number.parseFloat(amount);done=Math.round(n*(/h/i.test(amount)?60:1));}task.remainingMinutes=Math.max(0,task.remainingMinutes-done);if(task.remainingMinutes===0){task.status="done";task.completedAt=new Date().toISOString();}return true;}
export function cleanup(workspace){const cutoff=Date.now()-30*86400000;workspace.tasks=workspace.tasks.filter(t=>t.status!=="done"||new Date(t.completedAt||0).getTime()>cutoff);workspace.commitments=workspace.commitments.filter(c=>new Date(`${c.date}T23:59`).getTime()>cutoff);return workspace;}
