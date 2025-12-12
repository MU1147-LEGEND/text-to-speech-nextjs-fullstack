export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function escapeXml(s: string) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

/**
 * Azure SSML prosody rate:
 * accepts "0%" "+10%" "-10%" etc.
 * We'll output signed % for safety.
 */
function toRate(rate: number) {
    const r = clamp(rate, 0.5, 2); // 0.5x to 2x
    const pct = Math.round((r - 1) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * Azure SSML prosody pitch:
 * accepts "0%" "+10%" "-10%" etc.
 */
function toPitch(pitch: number) {
    const p = clamp(pitch, 0.5, 2); // 0.5x to 2x (mapped)
    const pct = Math.round((p - 1) * 50);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

// Keep formats to known Azure output formats.
// (If frontend sends something else, fallback to default.)
const ALLOWED_FORMATS = new Set([
    "audio-16khz-128kbitrate-mono-mp3",
    "audio-24khz-160kbitrate-mono-mp3",
    "audio-24khz-48kbitrate-mono-mp3",
    "audio-48khz-192kbitrate-mono-mp3",
]);

async function fetchAzureToken(region: string, key: string) {
    const urls = [
        `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        `https://${region}.api.cognitiveservices.azure.com/sts/v1.0/issueToken`,
    ];

    let lastErr = "";
    for (const url of urls) {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Ocp-Apim-Subscription-Key": key,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "",
        });

        if (res.ok) return await res.text();

        const txt = await res.text().catch(() => "");
        lastErr = `Token endpoint ${url} failed: ${res.status} ${txt}`;
        console.error(lastErr);
    }

    throw new Error(lastErr || "Failed to obtain Azure token");
}

export async function POST(req: Request) {
    try {
        const key = process.env.AZURE_SPEECH_KEY;
        const region = process.env.AZURE_SPEECH_REGION;

        if (!key || !region) {
            return new Response(
                JSON.stringify({ error: "Missing Azure env vars" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        const body = await req.json().catch(() => ({} as any));
        const text = String(body?.text ?? "").trim();
        if (!text) {
            return new Response(JSON.stringify({ error: "Empty text" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // ---- sanitize inputs ----
        const voiceRaw = String(body?.voice ?? "en-US-JennyNeural").trim();
        const voice = voiceRaw || "en-US-JennyNeural";

        const rateNum = Number(body?.rate ?? 1);
        const pitchNum = Number(body?.pitch ?? 1);

        const safeRate = Number.isFinite(rateNum) ? rateNum : 1;
        const safePitch = Number.isFinite(pitchNum) ? pitchNum : 1;

        const formatRaw = String(
            body?.format ?? "audio-16khz-128kbitrate-mono-mp3"
        ).trim();
        const format = ALLOWED_FORMATS.has(formatRaw)
            ? formatRaw
            : "audio-16khz-128kbitrate-mono-mp3";

        // ---- token ----
        const token = await fetchAzureToken(region, key);

        // ---- ssml ----
        // Keep xml:lang stable. You can change "en-US" if you later support other languages.
        const ssml =
            `<speak version="1.0" xml:lang="en-US">` +
            `<voice name="${escapeXml(voice)}">` +
            `<prosody rate="${toRate(safeRate)}" pitch="${toPitch(
                safePitch
            )}">` +
            `${escapeXml(text)}` +
            `</prosody></voice></speak>`;

        const ttsUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

        const ttsRes = await fetch(ttsUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/ssml+xml; charset=utf-8",
                "X-Microsoft-OutputFormat": format,
                "User-Agent": "vercel-tts-app",
                Accept: "audio/mpeg",
            },
            body: ssml,
        });

        if (!ttsRes.ok) {
            const errText = await ttsRes.text().catch(() => "");
            // Sometimes Azure returns empty body on 400; include some headers/status for debugging
            const reqId =
                ttsRes.headers.get("x-requestid") ||
                ttsRes.headers.get("X-RequestId") ||
                ttsRes.headers.get("apim-request-id") ||
                "";

            console.error("TTS error", {
                status: ttsRes.status,
                reqId,
                errText,
                voice,
                format,
                rate: safeRate,
                pitch: safePitch,
            });

            return new Response(
                JSON.stringify({
                    error: `TTS error: ${ttsRes.status}`,
                    details: errText || "(empty error body from Azure)",
                    requestId: reqId || undefined,
                    hint:
                        ttsRes.status === 400
                            ? "Likely invalid SSML/voice/format/rate/pitch. Check voice name + output format + make sure rate/pitch are numbers."
                            : undefined,
                }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }

        const audio = await ttsRes.arrayBuffer();

        // Extra guard: if response ok but audio empty, treat as error
        if (!audio || audio.byteLength === 0) {
            return new Response(
                JSON.stringify({
                    error: "TTS returned empty audio",
                }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }

        return new Response(audio, {
            headers: {
                "Content-Type": "audio/mpeg",
                "Cache-Control": "no-store",
                // Optional: force download. If you want inline play, remove this line.
                // "Content-Disposition": 'attachment; filename="tts.mp3"',
            },
        });
    } catch (error) {
        console.error("API error:", error);
        return new Response(
            JSON.stringify({
                error: "Internal server error",
                details: String(error),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
