# Self-hosted speech-to-text (replace OpenAI Whisper)

**Status:** Investigation complete; implementation behind env flags (default remains OpenAI).  
**Date:** 2026-10-13  
**Do not change Contabo production `.env` or deploy without explicit approval.**

---

## 1. Current-state findings

### 1.1 Where `AI_WHISPER_MODEL` is used

| Location | Role |
|----------|------|
| [`server/aiModels.ts`](../../server/aiModels.ts) | `getWhisperModel()` → `AI_WHISPER_MODEL` (default `whisper-1`) |
| [`server/routes.ts`](../../server/routes.ts) | All OpenAI `audio.transcriptions.create` calls |

No other packages call Whisper.

### 1.2 API routes

| Method | Path | Auth | Input | Max size |
|--------|------|------|-------|----------|
| `POST` | `/api/audio/transcribe` | `isAuthenticated` | multipart field `audio` | 25MB audio (multer allows 100MB before route check) |
| `POST` | `/api/audio/transcribe-base64` | `isAuthenticated` | JSON `{ audioBase64, fileName? }` | 25MB decoded; JSON body limit 35MB |

- **Not** credit/trial-locked (`/api/audio/*` is outside `isLockedApiPath` prefixes).
- **No** org-scoped resource check on the audio blob itself (session auth only).
- Response: `{ text: string }`.

### 1.3 Formats & preprocessing

- Web records **WebM/Opus**; mobile uses **M4A**.
- Allowed multipart MIME types include mp3, wav, webm, ogg, m4a, mp4, flac, etc.
- Fallback conversion via **`ffmpeg-static`** (pipe and/or temp files under `os.tmpdir()`).
- OpenAI SDK `toFile()` wraps buffers for the API.

### 1.4 Language

All Whisper calls hardcode **`language: "en"`**. There is no client/org language parameter today.  
Urdu is **not** supported by the current API contract (would need `language` / auto-detect).

### 1.5 Consumers

| Client | Endpoint | How result is used |
|--------|----------|--------------------|
| `client/.../FieldWidget.tsx` | `/api/audio/transcribe` | Appends `Inspector Comments: …` via `appendVoiceTranscription` |
| `client/.../ReportVoiceRecordingWidget.tsx` | same | Same pattern |
| `mobile/.../FieldWidget.tsx` | `/api/audio/transcribe-base64` | Appends inspector comments to notes |
| `mobile/.../InspectionReportScreen.tsx` | same | Saves via entry voice helper |

### 1.6 Deployment

- Single container [`docker-compose.contabo.yml`](../../docker-compose.contabo.yml): Node 20 bookworm-slim, no STT sidecar, no CPU/RAM limits in compose.
- Image already includes build tools in **deps** stage; production image has Chromium-related libs; **`ffmpeg-static`** ships in `node_modules`.
- No DB table or billing counter for transcription minutes.

### 1.7 Privacy note

Successful responses `{ text }` can appear truncated in Express access logs (`server/index.ts`). Audio bytes are not logged. OpenAI Whisper **does** send audio to OpenAI when the current provider is used.

---

## 2. Option comparison: `faster-whisper` vs `whisper.cpp`

| Criterion | faster-whisper | whisper.cpp |
|-----------|----------------|-------------|
| Runtime | Python + CTranslate2 | Native C++ binary |
| Fit with Node/Express | Needs HTTP sidecar or Python subprocess + venv | CLI spawn (same pattern as `ffmpeg-static`) or optional HTTP server |
| Extra container | Typically **yes** (Python image) | **Optional**; can run binary inside app container |
| Models | Hugging Face / CTranslate2 | ggml / gguf downloads |
| CPU performance | Excellent (int8) | Excellent (quantized models) |
| GPU | Easy with CUDA image | Possible but more ops work |
| RAM (approx, `base`/`small`) | ~1–2 GB process | ~0.5–1.5 GB depending on quant |
| Multilingual (incl. Urdu) | Yes (Whisper family) | Yes (same family) |
| Ops complexity on Contabo | Higher (2nd service, healthchecks, network) | Lower if CLI-in-app; medium if sidecar |

### Recommendation (for Inspect360 today)

**Use `whisper.cpp` (CLI) as the self-hosted provider**, invoked from Node via a `SpeechToTextProvider` interface.

**Why not faster-whisper first:** Contabo deploy is a **single** Node container. Adding a Python service doubles process surface area, compose complexity, and failure modes. The app already spawns **ffmpeg** children; spawning **whisper-cli** matches that model without a mandatory second container.

**When to reconsider faster-whisper:** Sustained high concurrency, need for batched GPU inference, or team preference for a Python ML stack with a dedicated microservice.

**Default behaviour until approved:** keep **`STT_PROVIDER=openai`** (current Whisper API). Self-hosted is opt-in via env.

---

## 3. Proposed architecture

```
Client (web multipart / mobile base64)
        │
        ▼
POST /api/audio/transcribe{,-base64}   ← auth, size, mime validation unchanged
        │
        ▼
server/stt/transcribeAudio()           ← shared orchestration (ffmpeg normalize if needed)
        │
        ├── STT_PROVIDER=openai  → OpenAIWhisperProvider  (existing API)
        ├── STT_PROVIDER=whisper_cpp → WhisperCppProvider (local CLI, no outbound audio)
        └── on local failure + STT_FALLBACK_OPENAI=true → OpenAI (dev/testing only)
```

### 3.1 Env (dev / future prod — do not apply to Contabo without approval)

```env
# openai | whisper_cpp
STT_PROVIDER=openai
# If whisper_cpp fails, optionally fall back (disable in privacy-strict mode)
STT_FALLBACK_OPENAI=false
# Path to whisper.cpp whisper-cli (or main) binary
WHISPER_CPP_BIN=/opt/whisper/whisper-cli
# Path to ggml/gguf model file
WHISPER_CPP_MODEL=/opt/whisper/models/ggml-small.bin
# en | ur | auto (auto = omit -l / use detect)
STT_LANGUAGE=en
# Kill runaway jobs (ms)
STT_TIMEOUT_MS=120000
# Optional: threads for whisper.cpp
WHISPER_CPP_THREADS=4
```

`AI_WHISPER_MODEL` remains the OpenAI model id when `STT_PROVIDER=openai`.

### 3.2 Interface (conceptual)

```ts
type SttRequest = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  language?: string; // optional override
};

type SttResult = { text: string; provider: string; model: string };

interface SpeechToTextProvider {
  readonly name: string;
  transcribe(req: SttRequest): Promise<SttResult>;
}
```

### 3.3 Languages & formats

- **Formats:** Keep current accept lists; normalize to **WAV 16 kHz mono** for whisper.cpp when needed (reuse ffmpeg-static).
- **English:** default `STT_LANGUAGE=en` (parity with today).
- **Urdu:** set `STT_LANGUAGE=ur` or `auto`, or pass `language` on the request once wired. Model must be multilingual (e.g. `small` / `medium`, not `tiny.en` / `base.en`).

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| Contabo RAM spike with large models | Start with `ggml-small` or `base`; document RAM; optional compose mem limit later |
| Latency on CPU for long clips | Timeout (`STT_TIMEOUT_MS`); keep 25MB cap; prefer short field notes |
| Binary/model missing in container | Clear error; fallback only if explicitly enabled |
| Privacy regression via fallback | Default `STT_FALLBACK_OPENAI=false` when using local |
| Quality vs `whisper-1` | Evaluate on real Foxtons/English clips before prod cutover |
| Concurrent ffmpeg + whisper CPU | Document concurrency; queue later if needed |
| English-only clients | Keep default `en`; document Urdu as config/API opt-in |

---

## 5. Test plan

| Case | Expectation |
|------|-------------|
| Successful transcription (mock provider) | `{ text }` non-empty; provider name set |
| Invalid / tiny audio | 400 before provider call |
| Oversized (>25MB) | 400 |
| Timeout | Provider rejects; route returns 504/500 with safe message |
| Unavailable binary / model | Clear error; fallback if enabled |
| Concurrent requests | Multiple parallel `transcribe` calls complete without shared-state corruption |
| OpenAI provider still used when `STT_PROVIDER=openai` | Unchanged behaviour |

Automated tests use **mocks** for OpenAI and whisper.cpp spawn (no GPU, no model download in CI).

Manual (dev): English WebM + M4A; Urdu sample with `STT_LANGUAGE=ur` or `auto` once local binary/model installed.

---

## 6. Cost estimate (no invented usage)

**Finding:** There is **no** database counter, billing event, or log aggregation in-repo that records Whisper minutes or request counts. Therefore **actual OpenAI Whisper spend cannot be computed from this repository**.

Public list pricing reference (OpenAI Whisper API, as of investigation): priced **per audio minute** on OpenAI’s pricing page — operators should pull **actual** minutes from the OpenAI usage dashboard / invoices and compare to Contabo VPS incremental cost (RAM/CPU already paid for the VM; self-hosted adds disk for models ~hundreds of MB–few GB and CPU time).

**Formula (fill with real numbers):**

```
Monthly OpenAI STT ≈ (audio_minutes_from_OpenAI_dashboard) × (Whisper $/minute)
Self-hosted incremental ≈ $0 API + (optional larger VPS if CPU/RAM insufficient) + ops time
```

Do **not** treat any figure as factual until taken from OpenAI billing or Contabo invoices.

---

## 7. Installation / Docker / rollback (summary)

### whisper.cpp (recommended path)

1. Build or download `whisper-cli` for linux-x64 (bookworm-compatible).
2. Download a multilingual model e.g. `ggml-small.bin` into a host directory.
3. Mount into the app container (when approved), e.g. `/opt/whisper`.
4. Set `STT_PROVIDER=whisper_cpp`, paths, `STT_FALLBACK_OPENAI=false` for privacy-strict mode.
5. Restart **dev** container only; verify English then Urdu samples.

### Monitoring

- Log provider name + duration + byte size (not transcript body in prod if privacy-hardened).
- Alert on timeout / spawn errors rate.

### Rollback

1. Set `STT_PROVIDER=openai` (and keep `AI_WHISPER_MODEL=whisper-1`).
2. Restart app.
3. No schema migration required.

---

## 8. Implementation checklist (post-doc)

- [x] Document findings (this file)
- [x] `server/stt/*` provider interface + openai + whisper_cpp
- [x] Wire routes through shared orchestrator; preserve auth/validation
- [x] Optional `language` on request + `STT_LANGUAGE`
- [x] Tests listed in §5 (`npx tsx server/stt/stt.test.ts`)
- [x] Env templates documented (dev only; no Contabo prod edit)

### Code map

| Path | Role |
|------|------|
| `server/stt/types.ts` | Interface + `SttError` |
| `server/stt/openaiWhisperProvider.ts` | Existing OpenAI Whisper |
| `server/stt/whisperCppProvider.ts` | Local whisper.cpp CLI |
| `server/stt/ffmpegWav.ts` | 16 kHz mono WAV for local STT |
| `server/stt/index.ts` | Factory + fallback orchestration |
| `server/routes.ts` | `/api/audio/transcribe*` → `runSpeechToText` |

---

## 9. Approval gate

Production Contabo `.env` / compose changes require **explicit approval**.  
OpenAI Whisper must remain available until self-hosted passes **development** testing.
