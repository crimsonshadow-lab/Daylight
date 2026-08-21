const KEY = "daylight.workspaces.v1";
const id = () => crypto.randomUUID();

export const defaultPreferences = () => ({
  wake: "09:15", sleep: "00:30", lectureStart: "10:30", lectureEnd: "17:30", lecturesEnabled: true,
  lunchStart: "13:15", lunchEnd: "14:15", dinnerStart: "20:00", dinnerEnd: "22:00", dinnerMinutes: 45,
  protectedFreeMinutes: 120, saturdayFreeAfter: "16:00", sundayRecovery: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, weeklyBriefingSeen: ""
});

export function newWorkspace(name) {
  return { id: id(), name: name.trim() || "My planner", createdAt: new Date().toISOString(), preferences: defaultPreferences(), tasks: [], commitments: [], plan: [], prompts: [], estimates: {}, recovery: { load: "normal", hecticDates: [], lastUpdated: "" } };
}

export function loadRoot() { try { return JSON.parse(localStorage.getItem(KEY)) || { activeId: null, workspaces: [] }; } catch { return { activeId: null, workspaces: [] }; } }
export function saveRoot(root) { localStorage.setItem(KEY, JSON.stringify(root)); }
export function activeWorkspace() { const root = loadRoot(); return { root, workspace: root.workspaces.find(w => w.id === root.activeId) || null }; }
export function saveWorkspace(workspace) { const root = loadRoot(); const i = root.workspaces.findIndex(w => w.id === workspace.id); if (i < 0) root.workspaces.push(workspace); else root.workspaces[i] = workspace; root.activeId = workspace.id; saveRoot(root); }
export function selectWorkspace(id) { const root = loadRoot(); root.activeId = id; saveRoot(root); }
export function deleteWorkspace(id) { const root = loadRoot(); root.workspaces = root.workspaces.filter(w => w.id !== id); root.activeId = root.workspaces[0]?.id || null; saveRoot(root); }
export function uid() { return id(); }
