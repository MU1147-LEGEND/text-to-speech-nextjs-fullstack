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

        // Debug logging
        console.log(
            "Environment check - Key exists:",
            !!key,
            "Region exists:",
            !!region,
            "Region value:",
            region
        );

        if (!key || !region) {
            console.error("Missing environment variables");
            return new Response(
                JSON.stringify({ error: "Missing Azure env vars" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        const body = await req.json();
        const text = String(body?.text ?? "").trim();
        if (!text) {
            return new Response(JSON.stringify({ error: "Empty text" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const voice = String(body?.voice ?? "en-US-JennyNeural");
        const rate = Number(body?.rate ?? 1);
        const pitch = Number(body?.pitch ?? 1);
        const format = String(
            body?.format ?? "audio-16khz-128kbitrate-mono-mp3"
        );

        // token
        const tokenUrl = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
        console.log("Fetching token from:", tokenUrl);

        const tokenRes = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Ocp-Apim-Subscription-Key": key,
                "Content-type": "application/x-www-form-urlencoded",
                "Content-Length": "0",
            },
        });

        console.log("Token response status:", tokenRes.status);

        if (!tokenRes.ok) {
            const errorText = await tokenRes.text();
            console.error("Token error:", tokenRes.status, errorText);
            return new Response(
                JSON.stringify({
                    error: `Token error: ${tokenRes.status}`,
                    details: errorText,
                }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }
        const token = await tokenRes.text();
        console.log("Token obtained successfully");

        const ssml =
            `<speak version="1.0" xml:lang="en-US">` +
            `<voice name="${escapeXml(voice)}">` +
            `<prosody rate="${toRate(rate)}" pitch="${toPitch(pitch)}">` +
            `${escapeXml(text)}` +
            `</prosody></voice></speak>`;

        console.log("SSML content:", ssml);
        console.log(
            "Voice:",
            voice,
            "Rate:",
            rate,
            "Pitch:",
            pitch,
            "Format:",
            format
        );

        const ttsUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
        console.log("Fetching TTS from:", ttsUrl);

        const ttsRes = await fetch(ttsUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": format,
                "User-Agent": "vercel-tts-app",
            },
            body: ssml,
        });

        console.log("TTS response status:", ttsRes.status);

        if (!ttsRes.ok) {
            const errorText = await ttsRes.text();
            console.error("TTS error:", ttsRes.status, errorText);
            return new Response(
                JSON.stringify({
                    error: `TTS error: ${ttsRes.status}`,
                    details: errorText,
                }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }

        const audio = await ttsRes.arrayBuffer();
        console.log("Audio generated successfully, size:", audio.byteLength);
        return new Response(audio, {
            headers: { "Content-Type": "audio/mpeg" },
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
