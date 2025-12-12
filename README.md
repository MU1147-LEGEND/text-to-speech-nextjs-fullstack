# TTS Next.js (Azure MP3)

This is a **Next.js App Router** project that generates **real MP3 audio** using **Azure Cognitive Services Speech**.

## Setup

1. Install deps

```bash
npm install
```

2. Create `.env.local`

```bash
cp .env.example .env.local
```

Fill in:

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION` (e.g. `eastus`)

3. Run

```bash
npm run dev
```

Open http://localhost:3000

## API

`POST /api/tts`

Body:
```json
{
  "text": "Hello world",
  "voice": "en-US-JennyNeural",
  "rate": 1,
  "pitch": 1,
  "format": "audio-16khz-128kbitrate-mono-mp3"
}
```

Returns: `audio/mpeg`
