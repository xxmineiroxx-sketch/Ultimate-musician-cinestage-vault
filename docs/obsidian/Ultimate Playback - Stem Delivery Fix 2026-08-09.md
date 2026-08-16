# Ultimate Playback - Stem Delivery Fix (2026-08-09)

Practice stems for the Sunday Service would not play — the app sat on "loading"
forever. Three independent defects, none of which was the one originally suspected
(file size). Related: [[Ultimate Musician - CineStage Desktop Stem Worker]].

## 1. The stems were never in the cloud

The publish script used `wrangler r2 object put` **without `--remote`**. Wrangler 4.x
writes to a *local simulated* R2 in that mode. It printed "Upload complete", exited 0,
and put all 28 stems in `.wrangler/state/v3/r2/cinestage-stems/blobs/` on the Mac —
while rewriting the sync metadata to claim they were in Cloudflare.

Every download returned `stem asset missing from storage` (404).

The blobs were still on disk and were recovered by mapping key → blob through
`.wrangler/state/v3/r2/miniflare-R2BucketObject/*.sqlite` (copy the `-wal`/`-shm`
alongside the `.sqlite` or the tables read empty), then re-uploading with `--remote`.
No re-transcode was needed. All 28 verified serving `audio/mp4`.

**Rule:** the sanctioned upload path is `POST /sync/stem-assets/upload`, which sets
`delivery` and `downloadable` itself *after* the bytes land. Scripts that use the
wrangler CLI and hand-write the metadata bypass that truth check.

## 2. The delivery window closed before the service started

`serviceEndDateForStemJob` parsed the service's wall-clock date/time with no offset.
The Worker runs in UTC, so a 9:00 AM EDT service was read as 9:00 UTC and the
two-hour post-service window expired at **7:00 AM EDT — two hours before the service
began**. It also used the *start* time as the end time.

Now parses in the service timezone (default `America/New_York`) and adds a default
3h service duration when only a start time exists. Publish also accepts
`{"extendHours": N}` to re-open a window without changing retention policy.

The `ephemeral_delivery` policy itself is unchanged — it is a deliberate licensing
posture, not a bug.

## 3. The app cached downloads under a guessed extension

`audioEngine` named cache files from the URL. Stems are AAC but were being written as
`.wav`, which expo-av on iOS cannot decode. Worse, `FileSystem.downloadAsync` resolves
for **any** HTTP status and writes the error body to disk — so an expired link cached a
63-byte JSON error as "audio", permanently.

Extension now resolves Content-Disposition → Content-Type → URL. Downloads land in a
`.part` file validated on status/content-type/size before promotion. Cache keys are
versioned (`v2_`) so poisoned entries are purged. Failed loads surface the reason
instead of spinning.

## Also fixed

A `MAX_INITIAL_TRACK_SOURCES = 2` cap (added as a workaround for 79 MB WAV stems) was
silently truncating the personal mix. A Keys player heard their own Rhodes plus
background vocals while the UI reported "Full Song". Removed — stems are ~7 MB AAC now.

## Verified

Algo Novo played on the iPhone 17 Pro Max simulator: 5 stems loaded, 0 failures,
cache files correctly named `.m4a`. All 28 stems across all 4 songs return HTTP 200.

Commits `bf3282a`, `7fe5948` (repo `Ultimate-musician-cinestage-vault`).
Worker deployed as version `30b77d47`.

> [!warning] Live source
> The running Playback app is `/Users/studio/Ultimate-musician-cinestage-vault/apps/ultimate_playback/`.
> The `MONOREPO_MASTER` copy under iCloud is stale since 2026-06-16 — editing it does nothing.
