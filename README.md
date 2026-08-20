# Daylight — Personal Time Manager

## Final deployment URL

**Not available from this execution environment.** Publishing needs an authenticated static-host account (for example GitHub Pages, Cloudflare Pages, or Netlify). This environment has no GitHub, Cloudflare, or Netlify credentials or deployment command configured, so a truthful public HTTPS URL cannot be created here.

The finished app is a static PWA: deploy the contents of this folder unchanged to any free static HTTPS host. No database, API key, server, or paid infrastructure is required.

## Run locally

With Node.js installed, run:

```text
npx serve .
```

Open the address it prints. For a free public deployment, create a GitHub Pages or Cloudflare Pages static-site project and upload/publish this folder; the published URL is then your Daylight URL.

## iPhone installation

1. Open the deployed HTTPS Daylight URL in **Safari**.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Open **Daylight** from the new icon.

It opens as a standalone app and remains usable offline after its first successful load.

## What works

- Today, Week, Tasks, and editable Settings views.
- Automatic planning every time the app launches, after any change, and via **Replan**.
- Natural-language local inputs including “OB assignment due Friday”, “SCOP meeting tomorrow at 7”, “I finished the assignment”, “I only completed half”, and “I’m exhausted today”.
- Remaining effort, partial progress, task carryover, normal 7-day planning, and 14/21-day planning for longer important work.
- Monday weekly briefing, deadline-risk prompts, protected sleep, deliberate free time, dinner in the 8–10 PM window, recovery-aware limits, Wednesday deep-work preference, Saturday-after-4 protection, and Sunday recovery.
- SCOP work is high priority; Synergy HR and InsightX are lower priority. User-entered commitments are hard/read-only and the planner never moves them.
- A separate private workspace for every person, stored only in that person’s browser/device. No shared account or planner state exists.

## First use and second user

Enter a name at first launch. Daylight starts with the requested defaults: weekday lectures 10:30–17:30, lunch 13:15–14:15, wake 09:15, protected sleep, dinner 20:00–22:00, Wednesday deep study, Saturday free after 16:00, Sunday recovery, and two hours of protected free time.

Everything is editable in **Settings**. A friend opens the same deployed URL on their own phone and completes their own first-run setup. Their browser receives a separate local workspace automatically; your data never travels to their device.

## Reset local data

In Safari: **Settings → Safari → Advanced → Website Data**, find the Daylight site, then delete its data. This permanently deletes that device’s Daylight workspaces. Use the in-app Settings screen to delete only a secondary workspace.

## Known limitations

- iPhone PWAs cannot reliably wake up or send scheduled notifications while completely closed without a hosted push/background service. Daylight shows its Monday briefing and prompts when you next open it.
- The app deliberately does not integrate with Apple Calendar; Daylight is the primary planner UI.
- AI calls are not faked. Natural-language understanding and scheduling are deterministic and local. [MASTER_AI_PROMPT.md](MASTER_AI_PROMPT.md) is the clean future contract for optional bring-your-own AI.
