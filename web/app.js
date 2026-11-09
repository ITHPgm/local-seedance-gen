const $ = (id) => document.getElementById(id);
const form = $('job-form');
const history = $('history');
const preview = $('preview');
const jobState = $('job-state');
let latestId = null;

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function refreshHealth() {
  try {
    const data = await api('/api/health');
    $('health').textContent = data.provider === 'local' ? 'Offline preview ready' : 'Provider connected';
    $('health').style.color = 'var(--accent)';
  } catch (err) { $('health').textContent = 'Backend unavailable'; }
}

async function uploadIfNeeded() {
  const file = $('file').files[0];
  if (!file) return null;
  const body = new FormData(); body.append('file', file);
  return api('/api/upload', { method: 'POST', body });
}

async function poll(id) {
  const data = await api(`/api/jobs/${id}`);
  jobState.textContent = `${data.status} · ${data.progress}%`;
  $('job-meta').textContent = data.error || `${data.mode} · ${data.duration}s · ${data.resolution} · ${data.aspect_ratio}`;
  if (data.status === 'completed' && data.output_url) {
    const src = data.output_url.startsWith('http') ? data.output_url : data.output_url;
    preview.innerHTML = `<video controls autoplay loop src="${src}"></video>`;
    jobState.textContent = 'Completed';
    await loadHistory();
    return;
  }
  if (data.status === 'failed') return;
  setTimeout(() => poll(id).catch(e => { jobState.textContent = 'Polling error'; }), 1000);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type=submit]'); button.disabled = true; button.textContent = 'Submitting…';
  try {
    const uploaded = await uploadIfNeeded();
    const mode = $('mode').value;
    const payload = { prompt: $('prompt').value, mode, duration: Number($('duration').value), aspect_ratio: $('aspect').value, resolution: $('resolution').value, audio: $('audio').checked };
    if (uploaded) payload[mode === 'image-to-video' ? 'image_path' : mode === 'audio-to-video' ? 'audio_path' : mode === 'reference-video' ? 'reference_video_path' : 'image_path'] = uploaded.filename;
    const job = await api('/api/jobs', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    latestId = job.id; jobState.textContent = 'queued · 0%'; preview.innerHTML = '<div class="play-orb">…</div><p>Rendering your scene…</p>'; poll(job.id);
  } catch (err) { $('form-note').textContent = `Error: ${err.message}`; }
  finally { button.disabled = false; button.innerHTML = 'Generate preview <span>↗</span>'; }
});

async function loadHistory() {
  const jobs = await api('/api/jobs');
  if (!jobs.length) { history.className = 'history-empty'; history.textContent = 'No generations yet.'; return; }
  history.className = '';
  history.innerHTML = jobs.slice(0, 10).map(j => `<div class="job-row"><strong>${j.prompt.slice(0, 70)}${j.prompt.length > 70 ? '…' : ''}</strong><small>${j.mode} · ${j.duration}s</small><small>${j.status}</small>${j.output_url ? `<a href="${j.output_url}" target="_blank">Open</a>` : ''}</div>`).join('');
}
$('refresh').addEventListener('click', loadHistory);
refreshHealth(); loadHistory();
