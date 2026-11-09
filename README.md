# Seedance Studio

Seedance Studio is a local-first video-generation control surface with a Python FastAPI backend, a browser UI, and an Expo Android client. It supports four workflow modes: **text-to-video**, **image-to-video**, **audio-to-video**, and **reference-video**. In offline mode it renders deterministic FFmpeg preview clips so the complete UI and job lifecycle can be tested without a model account. With an authorized Seedance-compatible endpoint configured, the backend submits asynchronous generation jobs and polls for output.

## Reverse-engineering boundary

The referenced [REA repository](https://github.com/morluto/rea) is an MIT-licensed reverse-engineering platform for analyzing binaries, applications, and runtime behavior. Its source layout, MCP-oriented workflow, provider abstraction, and evidence-oriented design were inspected for architectural inspiration. The repository does **not** contain Seedance code or a video-generation backend. This project therefore does not copy a Seedance implementation from REA and does not attempt to bypass a proprietary service. It uses a clean-room integration boundary: a provider adapter receives a prompt and optional encoded media, then consumes an authorized API response.

The MIT notice from REA is preserved in `third_party/REA-LICENSE.txt` for attribution. Third-party services, models, and media remain subject to their own terms.

## Quick start

```bash
cd seedance-studio
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open `http://127.0.0.1:8000`. The default `VIDEO_PROVIDER=local` mode creates a short local preview using FFmpeg. The browser UI and the Android client use the same REST API.

## Seedance-compatible provider mode

Configure an endpoint and credentials only when you have obtained authorized access from the provider:

```bash
export VIDEO_PROVIDER=seedance
export SEEDANCE_API_URL='https://your-authorized-provider.example/v1/videos'
export SEEDANCE_API_KEY='replace-with-your-key'
export SEEDANCE_MODEL='seedance-2.5'
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

The adapter sends the prompt, duration, aspect ratio, resolution, audio flag, and any uploaded image/audio/reference-video as base64 fields. Provider-specific field names can be adjusted in `backend/main.py` without changing the UI.

## Android client

The Android source is in `android-client/`. Install Node.js and Expo tooling, then run:

```bash
cd android-client
npm install
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8000 npx expo start
```

For a physical phone, the phone and computer must be on the same network, and the API URL must use the computer's LAN IP rather than `127.0.0.1`. To create a signed installable APK, use an Android build environment or Expo Application Services:

```bash
npx eas-cli build --platform android --profile preview
```

This sandbox does not contain the Android SDK or Gradle toolchain, so an APK cannot be compiled locally here; the complete Android client source and Expo configuration are included for reproducible APK/AAB generation on a machine with Android build tooling.

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Backend/provider status |
| `POST /api/upload` | Upload an image, audio, or video reference |
| `POST /api/jobs` | Queue a generation job |
| `GET /api/jobs` | List recent jobs |
| `GET /api/jobs/{id}` | Poll job status |
| `GET /api/media/{filename}` | Retrieve local preview media |

## References

[1]: https://github.com/morluto/rea "REA repository"

[2]: https://seed.bytedance.com/en/seedance2_5 "ByteDance Seedance 2.5"

[3]: https://www.volcengine.com/docs/ark/seedance-2-5 "Volcengine ModelArk Seedance 2.5 documentation"
