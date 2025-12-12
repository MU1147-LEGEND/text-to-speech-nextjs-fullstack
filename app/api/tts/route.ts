export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeXml(s: string) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function toRate(rate: number) {
    const pct = Math.round((rate - 1) * 100);
    return `${pct}%`;
}
function toPitch(pitch: number) {
    const pct = Math.round((pitch - 1) * 50);
    return `${pct}%`;
}

export async function POST(req: Request) {
    try {
        const key = process.env.AZURE_SPEECH_KEY;
        const region = process.env.AZURE_SPEECH_REGION;
        if (!key || !region)
            return new Response("Missing Azure env vars", { status: 500 });

        const body = await req.json();
        const text = String(body?.text ?? "").trim();
        if (!text) return new Response("Empty text", { status: 400 });

        const voice = String(body?.voice ?? "en-US-JennyNeural");
        const rate = Number(body?.rate ?? 1);
        const pitch = Number(body?.pitch ?? 1);
        const format = String(
            body?.format ?? "audio-16khz-128kbitrate-mono-mp3"
        );

        // token
        const tokenRes = await fetch(
            `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
            {
                method: "POST",
                headers: {
                    "Ocp-Apim-Subscription-Key": key,
                    "Content-type": "application/x-www-form-urlencoded",
                    "Content-Length": "0",
                },
            }
        );
        if (!tokenRes.ok) {
            const errorText = await tokenRes.text();
            console.error("Token error:", tokenRes.status, errorText);
            return new Response(`Token error: ${tokenRes.status}`, {
                status: 502,
            });
        }
        const token = await tokenRes.text();

        const ssml =
            `<speak version="1.0" xml:lang="en-US">` +
            `<voice name="${escapeXml(voice)}">` +
            `<prosody rate="${toRate(rate)}" pitch="${toPitch(pitch)}">` +
            `${escapeXml(text)}` +
            `</prosody></voice></speak>`;

        const ttsRes = await fetch(
            `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": format,
                    "User-Agent": "vercel-tts-app",
                },
                body: ssml,
            }
        );
        if (!ttsRes.ok) {
            const errorText = await ttsRes.text();
            console.error("TTS error:", ttsRes.status, errorText);
            return new Response(`TTS error: ${ttsRes.status}`, { status: 502 });
        }

        const audio = await ttsRes.arrayBuffer();
        return new Response(audio, {
            headers: { "Content-Type": "audio/mpeg" },
        });
    } catch (error) {
        console.error("API error:", error);
        return new Response("Internal server error", { status: 500 });
    }
}
