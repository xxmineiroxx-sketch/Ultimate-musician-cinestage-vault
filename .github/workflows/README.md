# CI/CD Workflows

## Required Repository Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `EXPO_TOKEN` | EAS access token from [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens) |
| `EXPO_PUBLIC_SYNC_URL` | Sync server URL. Playback currently uses `https://ultimate-playback-sync.studio-cinestage.workers.dev`; Musician may use the full sync backend URL. |
| `EXPO_PUBLIC_CINESTAGE_URL` | CineStage API URL (e.g. `https://cinestage.ultimatelabs.co`) |
| `EXPO_PUBLIC_SYNC_ORG_ID` | Organization ID |
| `EXPO_PUBLIC_SYNC_SECRET_KEY` | Organization secret key |

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `eas-build-playback.yml` | Push/PR to `main` affecting `apps/ultimate_playback` | Build Ultimate Playback (musician app) |
| `eas-build-admin.yml` | Push/PR to `main` affecting `apps/primary_app/.../mobile` | Build Ultimate Musician (admin app) |
| `secrets-scan.yml` | Every push/PR | Prevent credential leaks |

## Local Development

```bash
# Copy example env and fill in values
cp .env.example .env
cp apps/ultimate_playback/.env.example apps/ultimate_playback/.env
cp apps/primary_app/ultimate_musician_full_project_v3/mobile/.env.example apps/primary_app/ultimate_musician_full_project_v3/mobile/.env
```
