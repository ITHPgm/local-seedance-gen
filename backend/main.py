from __future__ import annotations

import asyncio
import base64
import json
import os
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
MEDIA = ROOT / "media"
MEDIA.mkdir(parents=True, exist_ok=True)

PROVIDER = os.getenv("VIDEO_PROVIDER", "local")
SEEDANCE_API_URL = os.getenv("SEEDANCE_API_URL", "")
SEEDANCE_API_KEY = os.getenv("SEEDANCE_API_KEY", "")
SEEDANCE_MODEL = os.getenv("SEEDANCE_MODEL", "seedance-2.5")

app = FastAPI(title="Seedance Studio Local API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

jobs: dict[str, dict[str, Any]] = {}
WEB = ROOT.parent / "web"

class CreateJob(BaseModel):
    prompt: str = Field(min_length=1, max_length=5000)
    mode: Literal["text-to-video", "image-to-video", "audio-to-video", "reference-video"] = "text-to-video"
    duration: int = Field(default=5, ge=1, le=30)
    aspect_ratio: Literal["16:9", "9:16", "1:1"] = "16:9"
    resolution: Literal["480p", "720p", "1080p"] = "720p"
    audio: bool = True
    image_path: str | None = None
    audio_path: str | None = None
    reference_video_path: str | None = None


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in job.items() if k != "error" or v}


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "provider": PROVIDER, "seedance_configured": bool(SEEDANCE_API_URL and SEEDANCE_API_KEY)}


@app.get("/api/jobs")
def list_jobs() -> list[dict[str, Any]]:
    return [public_job(j) for j in sorted(jobs.values(), key=lambda x: x["created_at"], reverse=True)]


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return public_job(job)


@app.get("/api/media/{filename}")
def get_media(filename: str) -> FileResponse:
    path = MEDIA / Path(filename).name
    if not path.exists():
        raise HTTPException(404, "Media not found")
    return FileResponse(path)


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, str]:
    suffix = Path(file.filename or "upload.bin").suffix.lower()[:10]
    safe_name = f"{uuid.uuid4().hex}{suffix}"
    target = MEDIA / safe_name
    with target.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    return {"filename": safe_name, "url": f"/api/media/{safe_name}"}


@app.post("/api/jobs")
async def create_job(request: CreateJob) -> dict[str, Any]:
    job_id = uuid.uuid4().hex
    job = {
        "id": job_id,
        "status": "queued",
        "progress": 0,
        "created_at": now(),
        "updated_at": now(),
        "mode": request.mode,
        "prompt": request.prompt,
        "duration": request.duration,
        "aspect_ratio": request.aspect_ratio,
        "resolution": request.resolution,
        "audio": request.audio,
        "provider": PROVIDER,
        "output_url": None,
        "error": None,
    }
    jobs[job_id] = job
    asyncio.create_task(run_job(job_id, request))
    return public_job(job)


async def run_job(job_id: str, request: CreateJob) -> None:
    job = jobs[job_id]
    try:
        job.update(status="running", progress=5, updated_at=now())
        if PROVIDER == "seedance" and SEEDANCE_API_URL and SEEDANCE_API_KEY:
            result = await call_seedance(request, job)
        else:
            result = await render_local_preview(request, job)
        job.update(status="completed", progress=100, output_url=result, updated_at=now())
    except Exception as exc:
        job.update(status="failed", progress=100, error=str(exc), updated_at=now())


async def call_seedance(request: CreateJob, job: dict[str, Any]) -> str:
    payload: dict[str, Any] = {
        "model": SEEDANCE_MODEL,
        "prompt": request.prompt,
        "duration": request.duration,
        "aspect_ratio": request.aspect_ratio,
        "resolution": request.resolution,
        "generate_audio": request.audio,
    }
    for key in ("image_path", "audio_path", "reference_video_path"):
        value = getattr(request, key)
        if value:
            path = MEDIA / Path(value).name
            if path.exists():
                payload[key] = base64.b64encode(path.read_bytes()).decode("ascii")
    headers = {"Authorization": f"Bearer {SEEDANCE_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(SEEDANCE_API_URL, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        task_id = data.get("id") or data.get("task_id")
        if data.get("video_url"):
            return data["video_url"]
        if not task_id:
            raise RuntimeError(f"Provider returned no task id: {json.dumps(data)[:500]}")
        status_url = data.get("status_url", f"{SEEDANCE_API_URL.rstrip('/')}/{task_id}")
        for _ in range(120):
            await asyncio.sleep(2)
            poll = await client.get(status_url, headers=headers)
            poll.raise_for_status()
            state = poll.json()
            job["progress"] = min(95, int(state.get("progress", 10)))
            job["updated_at"] = now()
            if state.get("video_url") or state.get("output_url"):
                return state.get("video_url") or state.get("output_url")
            if state.get("status") in {"failed", "error"}:
                raise RuntimeError(state.get("error", "Provider job failed"))
        raise TimeoutError("Provider job timed out after four minutes")


app.mount("/", StaticFiles(directory=WEB, html=True), name="web")


async def render_local_preview(request: CreateJob, job: dict[str, Any]) -> str:
    """Create a deterministic local preview when no external model is configured.

    This keeps the app usable offline and provides a safe integration test for the UI.
    It is not a substitute for the Seedance model itself.
    """
    out = MEDIA / f"{job['id']}.mp4"
    width, height = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (720, 720)}[request.aspect_ratio]
    colors = {"text-to-video": "0x152238", "image-to-video": "0x263b2d", "audio-to-video": "0x3d2b45", "reference-video": "0x413428"}
    color = colors[request.mode]
    label = request.mode.replace("-", " ").title()
    draw = f"drawtext=text='{label} | {request.prompt[:70].replace(':', '\\:').replace("'", '')}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=(h-text_h)/2"
    cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={color}:s={width}x{height}:r=24", "-vf", draw, "-t", str(request.duration), "-pix_fmt", "yuv420p", str(out)]
    process = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
    while process.returncode is None:
        await asyncio.sleep(0.25)
        if job["progress"] < 90:
            job["progress"] += 3
            job["updated_at"] = now()
    if process.returncode != 0:
        stderr = (await process.stderr.read()).decode(errors="ignore")
        raise RuntimeError(f"ffmpeg preview failed: {stderr[-500:]}")
    return f"/api/media/{out.name}"
