# Ultimate Musician - Open Defects (2026-08-15)

Findings from the 2026-08-09 → 08-15 sessions that are **diagnosed but not fixed**.
Recorded here because they existed only in a session transcript. Related:
[[Ultimate Playback - Stem Delivery Fix 2026-08-09]],
[[Ultimate Musician - Setlist Approval Authorization 2026-08-14]],
[[Ultimate Musician - CineStage Desktop Stem Worker]].

## 🔴 P0 — the DAW worker deletes published stems every 60 seconds

`apps/ultimate_daw/src/main/workers/stemJobWorker.js`

- `cleanupExpiredJobs(dryRun = false)` — line 427. **The default is destructive.**
- Called as `cleanupExpiredJobs(false)` on the 60-second tick — line 654. No grace
  period, no dry-run gate, no confirmation.

Flagged 2026-08-11; the DAW then ran for three days and the 48h retention window lapsed
on 08-12. All four published songs are now `status: expired` with `stems: {}` and their
R2 objects gone:

```
expired    Deus de Promessas
expired    Creio que Tu es a cura
expired    Que se abram os ceus
expired    Algo Novo
```

**Recovery source — do not delete.** 57 blobs / 1.5 GB survive locally:

```
apps/ultimate_playback/cloudflare/ultimate-playback-sync/.wrangler/state/v3/r2/cinestage-stems/blobs
```

Map key → blob through `.wrangler/state/v3/r2/miniflare-R2BucketObject/*.sqlite`
(copy the `-wal`/`-shm` alongside the `.sqlite` or the tables read empty), then
re-upload with `wrangler r2 object put --remote`. Never run `git clean` or prune
`.wrangler/state` in this tree.

The DAW is **not running as of 2026-08-15 20:45** — no Electron process — so nothing is
being deleted right now. The loop resumes the next time the DAW launches. Anything
published before the `dryRun` default is patched meets the same fate.

**Fix:** flip the default to `dryRun = true`, pass an explicit destructive flag at the
one call site that should delete, and add a grace period past `expiresAt`. ~10 lines.

## 🟠 The Worker converts every routing mistake into a fake success

`apps/ultimate_playback/cloudflare/ultimate-playback-sync/worker.js`

- Line 4220 — `handleGet` falls through to `return json({ ok: true })`. **Every
  unmatched GET returns HTTP 200 `{"ok":true}`** instead of 404.
- Line 4233 — every `DELETE` returns `{ ok: true }` without doing anything.

That is why `/sync/stems/job/:id`, `/sync/messages` and `/sync/songs` all appear to
"succeed". It silently hides typos, renamed routes and unimplemented endpoints, and it
is likely masking more than the one bug it was found through.

**Fix:** return `404 { ok: false, error: 'not found' }` from both fall-throughs — the
same shape the method-level fall-through at line 4235 already uses.

## 🟡 "Vem me buscar" — Run CineStage reports `status: UNKNOWN`

Unresolved. Four hypotheses ruled out with evidence:

| Hypothesis | Verdict |
|---|---|
| Response shape mismatch | No — all four call sites destructure `{ job, fileUrl }` correctly |
| `normalizeDesktopStemJob` dropping status | No — it defaults to `PENDING` |
| `/sync/stems/job/:id` catch-all returning `{ok:true}` | Real, but the code skips it because `job.status` is falsy |
| CineStage fallback | Returns `PENDING` for *every* id, including fabricated ones |

No reachable path produces a falsy status. The strongest clue: **no job for that song
exists in the sync store at all** — only the 10 old ones. So creation is failing before
persistence and `UNKNOWN` is a symptom, not the cause. Closing it needs the live failure
captured from Metro while the action is retried; `/tmp/metro8081.log` had rotated away.

## 🟡 The Musician app tree has diverged from git

The **running** Musician source is the iCloud copy:

```
~/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Utimate Musician app/UltimatePlatform_MONOREPO_MASTER/apps/primary_app/ultimate_musician_full_project_v3/mobile
```

It differs from `apps/primary_app/.../mobile` in this repo in ~30 code files, including
`data/storage.js`, `audioEngine/index.js`, `components/WaveformTimeline.js`,
`screens/NewSongScreen.js`, `screens/RehearsalScreen.js` and `services/cinestage/client.js`
(iCloud last touched in June; the vault copy carries separate Aug 8 session edits).
Neither side is a superset — they are two lineages. **Committed ≠ running** for anything
Musician-side until they are reconciled file by file.

Playback is not affected: its live source *is* this repo
(`apps/ultimate_playback/`), and the iCloud `Desktop/ultimate_playback` copy is a
February snapshot with no `screens_v2/` at all.
