# Social Local on Docker Desktop

This Compose setup runs the current pnpm workspace app locally:

- **Web:** Vite frontend at `http://localhost:5173`
- **API:** Express on the internal Docker network at `api:8080`
- **Database:** PostgreSQL 16, persisted in a named Docker volume
- **Uploads:** persisted in a named Docker volume

## Start

1. Install and start Docker Desktop.
2. From the repository root, copy the sample environment file:

   ```sh
   cp .env.example .env
   ```

   In PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Edit the root-level `.env` file. Set `FACEBOOK_APP_ID` and
   `FACEBOOK_APP_SECRET` from your Meta app. `VITE_FACEBOOK_APP_ID` is optional
   and should contain the same App ID.
4. Start the app:

   ```sh
   docker compose up --build
   ```

5. Open `http://localhost:5173`. Use **Pages → Connect with Facebook**, then
   open **Image Batch** to schedule a set of images.

The API waits for PostgreSQL, applies the Drizzle schema on startup, then starts
the scheduler. The first build may take several minutes. The API and database
ports are not published to the host; the web container proxies `/api` to the API.

## Meta/Facebook configuration

Get the App ID and App Secret from [Meta for Developers](https://developers.facebook.com/apps/)
by opening your app and selecting **App settings → Basic**. Add these values to
`.env`:

```dotenv
FACEBOOK_APP_ID=your_meta_app_id
FACEBOOK_APP_SECRET=your_meta_app_secret
VITE_FACEBOOK_APP_ID=your_meta_app_id
```

`FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are used by the API for OAuth.
`VITE_FACEBOOK_APP_ID` is a public frontend value used for Facebook developer
links; never put the App Secret in a `VITE_` variable.

For the local URL defaults, add this exact URI to the Facebook Login settings
for your Meta app under **Valid OAuth Redirect URIs**:

```text
http://localhost:5173/api/auth/facebook/callback
```

The app requests `pages_show_list`, `pages_read_engagement`, and
`pages_manage_posts`. In Meta development mode, authorize with an account that
has an Admin, Developer, or Tester role on the Meta app. Broader use may require
Meta's app review and permission approval.

## Facebook image publishing from Docker Desktop

Images and videos uploaded into the app are sent from the API container to
Facebook as file uploads. Facebook does not need to fetch those files from
`localhost`, so uploaded media can be published from Docker Desktop without a
public tunnel. Keep the app running and do not remove its upload volume until
the post has published.

If you use an external image or video URL instead of uploading a file, Facebook
must be able to access that URL publicly. OAuth still uses `APP_URL`; configure
the matching callback URI in Meta's Valid OAuth Redirect URIs.

## Environment variables

The file to edit is **`.env` in the repository root**. Docker Compose reads it
automatically. `.env.example` is a template only; it is safe to commit, while
`.env` is ignored by Git and Docker build context.

| Variable | Required | Purpose |
| --- | --- | --- |
| `FACEBOOK_APP_ID` | For Facebook OAuth | Meta App ID used by the API |
| `FACEBOOK_APP_SECRET` | For Facebook OAuth | Meta App Secret used only by the API |
| `VITE_FACEBOOK_APP_ID` | Optional | Same public App ID for frontend developer links |
| `APP_URL` | Recommended | OAuth callback origin; defaults to `http://localhost:5173` |
| `PUBLIC_URL` | Optional | Origin used to create uploaded-media URLs shown by the app |
| `POSTGRES_PASSWORD` | Optional | Local database password; defaults to `sociallocal` |
| `WEB_PORT` | Optional | Host port for the frontend; defaults to `5173` |
| `HUGGING_FACE_API_KEY` | Optional | AI image generation |

`DATABASE_URL` is constructed inside Compose from `POSTGRES_PASSWORD`; do not
set it to `localhost` from inside the API container.

## Architecture notes

- The API runs schema setup on each startup. Compose persists data in
  `postgres_data` and uploads in `uploads_data`.
- API and web containers target `linux/amd64` because the workspace's native
  dependency policy excludes several Linux ARM64 packages. Docker Desktop on
  Apple Silicon can emulate amd64, but builds and runtime may be slower.
- `docker compose down` stops containers but keeps database and upload data.
  **`docker compose down -v` deletes both volumes and their data.**
- To change the UI host port, set `WEB_PORT` in `.env` and update `APP_URL`,
  `PUBLIC_URL`, and the Meta redirect URI to match.