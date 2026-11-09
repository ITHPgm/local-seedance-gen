# Architecture Notes

## System boundary

The system has three layers. The browser and Android clients are thin interfaces for creating jobs and polling status. The FastAPI service owns file uploads, job state, provider authentication, and output URLs. The provider adapter is the only layer that knows how to call an external video model.

```text
Browser / Android
       |
       | REST: upload, create job, poll job
       v
FastAPI local service
       |\
       | \-- local FFmpeg preview renderer
       |
       \---- authorized Seedance-compatible endpoint
```

## Why the repository was not used as a video backend

REA is a reverse-engineering platform, not a Seedance implementation. The relevant reusable idea is its separation between analysis capabilities and providers. This project applies that pattern without importing unrelated REA application code: provider selection is explicit, the local renderer is deterministic, and external model access is opt-in and credentialed.

## Provider contract

`call_seedance()` creates a JSON request containing the prompt, requested duration, aspect ratio, resolution, audio flag, selected model, and optional base64 media. It expects either an immediate video URL or an asynchronous task ID plus a pollable status endpoint. Because provider gateways may use different field names, the adapter is intentionally isolated in `backend/main.py`.

## Local mode

`VIDEO_PROVIDER=local` is the default. The local mode produces a short FFmpeg clip with a colored background and prompt label. This is an integration-test renderer, not a generative model. It makes the UI, queue, upload, and playback behavior testable on a machine without a GPU or external API account.

## Android deployment

The `android-client/android/` directory is generated with Expo prebuild and is suitable for `./gradlew assembleDebug` or an EAS preview build. The present sandbox has no Android SDK, ADB, or Gradle toolchain, so no APK binary could be compiled here. The source tree includes the package ID, Expo metadata, build profiles, and bundled JS export needed to finish the build on a normal Android development machine.
