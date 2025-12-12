"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import {
    AudioLines,
    Copy,
    Download,
    FastForward,
    Pause,
    Play,
    Rewind,
    RotateCcw,
    Square,
    Trash2,
    Wand2,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

function formatTime(sec: number) {
    const s = Math.max(0, Math.floor(sec));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
}

function Visualizer({ active }: { active: boolean }) {
    return (
        <div className="flex items-end gap-1 h-5">
            {[0, 1, 2, 3].map((i) => (
                <motion.div
                    key={i}
                    className="w-1.5 rounded-full bg-primary/70"
                    initial={{ height: 6, opacity: 0.6 }}
                    animate={
                        active
                            ? {
                                  height: [6, 18, 8, 14, 6],
                                  opacity: [0.5, 0.9, 0.6, 0.85, 0.5],
                              }
                            : { height: 6, opacity: 0.35 }
                    }
                    transition={
                        active
                            ? {
                                  duration: 0.9 + i * 0.06,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                              }
                            : { duration: 0.2 }
                    }
                />
            ))}
        </div>
    );
}

type GenerateResult = {
    blob: Blob;
    url: string;
    filename: string;
};

const AZURE_VOICES: Array<{ label: string; value: string }> = [
    // 🇺🇸 English (US)
    { label: "English (US) • Jenny (Natural)", value: "en-US-JennyNeural" },
    { label: "English (US) • Guy (Natural)", value: "en-US-GuyNeural" },
    { label: "English (US) • Aria (Very Natural)", value: "en-US-AriaNeural" },
    {
        label: "English (US) • Davis (Warm, Realistic)",
        value: "en-US-DavisNeural",
    },

    // 🇬🇧 English (UK)
    { label: "English (UK) • Sonia (Natural)", value: "en-GB-SoniaNeural" },
    { label: "English (UK) • Ryan (Natural)", value: "en-GB-RyanNeural" },
    { label: "English (UK) • Libby (Very Human)", value: "en-GB-LibbyNeural" },

    // 🇮🇳 Hindi
    { label: "Hindi (India) • Swara (Natural)", value: "hi-IN-SwaraNeural" },

    // 🇧🇩 Bangla (Bangladesh)
    {
        label: "Bangla (BD) • Nabanita (Natural Female)",
        value: "bn-BD-NabanitaNeural",
    },
    {
        label: "Bangla (BD) • Pradeep (Natural Male)",
        value: "bn-BD-PradeepNeural",
    },

    // 🇮🇳 Bangla (India) – MORE NATURAL
    {
        label: "Bangla (IN) • Tanishaa (Very Natural)",
        value: "bn-IN-TanishaaNeural",
    },
    {
        label: "Bangla (IN) • Bashkar (Natural Male)",
        value: "bn-IN-BashkarNeural",
    },
];

export default function TextToSpeechApp() {
    const [text, setText] = useState(
        "Hello, welcome to this text to speech Services. Change the text, voice, rate, and pitch settings to generate your own audio files."
    );

    const [voice, setVoice] = useState("en-US-JennyNeural");
    const [rate, setRate] = useState<number>(1);
    const [pitch, setPitch] = useState<number>(1);

    // UX options
    const [autoplay, setAutoplay] = useState(true);
    const [autoDownloadOnClick, setAutoDownloadOnClick] = useState(true);
    const [presetName, setPresetName] = useState("Default");
    const [status, setStatus] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);

    // audio state
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioUrl, setAudioUrl] = useState<string>("");
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [lastGenKey, setLastGenKey] = useState<string>("");
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const cleanedText = useMemo(() => (text || "").trim(), [text]);

    const genKey = useMemo(() => {
        // a small cache key to detect if we can reuse the last audio
        return JSON.stringify({
            text: cleanedText,
            voice,
            rate: +rate.toFixed(2),
            pitch: +pitch.toFixed(2),
        });
    }, [cleanedText, voice, rate, pitch]);

    useEffect(() => {
        // restore preset
        try {
            const raw = localStorage.getItem("tts_preset_azure_v1");
            if (!raw) return;
            const p = JSON.parse(raw);
            if (typeof p?.voice === "string") setVoice(p.voice);
            if (typeof p?.rate === "number") setRate(clamp(p.rate, 0.5, 2));
            if (typeof p?.pitch === "number") setPitch(clamp(p.pitch, 0, 2));
            if (typeof p?.autoplay === "boolean") setAutoplay(p.autoplay);
            if (typeof p?.autoDownloadOnClick === "boolean")
                setAutoDownloadOnClick(p.autoDownloadOnClick);
            if (typeof p?.presetName === "string") setPresetName(p.presetName);
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;

        const onTime = () => setCurrentTime(el.currentTime || 0);
        const onMeta = () => setDuration(el.duration || 0);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnd = () => setIsPlaying(false);

        el.addEventListener("timeupdate", onTime);
        el.addEventListener("loadedmetadata", onMeta);
        el.addEventListener("play", onPlay);
        el.addEventListener("pause", onPause);
        el.addEventListener("ended", onEnd);

        return () => {
            el.removeEventListener("timeupdate", onTime);
            el.removeEventListener("loadedmetadata", onMeta);
            el.removeEventListener("play", onPlay);
            el.removeEventListener("pause", onPause);
            el.removeEventListener("ended", onEnd);
        };
    }, [audioUrl]);

    useEffect(() => {
        // cleanup object URL on unmount / regenerate
        return () => {
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const savePreset = () => {
        try {
            localStorage.setItem(
                "tts_preset_azure_v1",
                JSON.stringify({
                    voice,
                    rate,
                    pitch,
                    autoplay,
                    autoDownloadOnClick,
                    presetName,
                })
            );
            setStatus("Saved.");
            setTimeout(() => setStatus(""), 1200);
        } catch {
            setStatus("Save blocked.");
            setTimeout(() => setStatus(""), 1400);
        }
    };

    const showStatusToast = (message: string, duration: number = 1200) => {
        setStatus(message);
        setTimeout(() => {
            setToastFadeOut(true);
            setTimeout(() => {
                setStatus("");
                setToastFadeOut(false);
            }, 300);
        }, duration);
    };

    const stopAudio = () => {
        const el = audioRef.current;
        if (!el) return;
        el.pause();
        el.currentTime = 0;
        setIsPlaying(false);
    };

    const togglePlay = async () => {
        const el = audioRef.current;
        if (!el) return;
        if (!audioUrl) {
            showStatusToast("Generate audio first.", 900);
            return;
        }
        try {
            if (el.paused) await el.play();
            else el.pause();
        } catch {
            // ignore
        }
    };

    const seekBy = (deltaSec: number) => {
        const el = audioRef.current;
        if (!el || !duration) return;
        el.currentTime = clamp(
            el.currentTime + deltaSec,
            0,
            Math.max(0, duration - 0.01)
        );
    };

    const setProgressFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = audioRef.current;
        if (!el || !duration) return;
        const rect = (
            e.currentTarget as HTMLDivElement
        ).getBoundingClientRect();
        const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        el.currentTime = x * duration;
    };

    const copyText = async () => {
        try {
            await navigator.clipboard.writeText(text);
            showStatusToast("Copied.", 900);
        } catch {
            showStatusToast("Copy failed.", 1100);
        }
    };

    const clearAll = () => {
        stopAudio();
        setText("");
        setAudioBlob(null);
        setLastGenKey("");
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl("");
        showStatusToast("Cleared.", 900);
    };

    const doDownloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const generate = async (): Promise<GenerateResult | null> => {
        const t = cleanedText;
        if (!t) {
            showStatusToast("Add some text.", 1000);
            return null;
        }

        setIsLoading(true);
        setStatus("Generating MP3…");

        try {
            const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: t,
                    voice,
                    rate: clamp(rate, 0.5, 2),
                    pitch: clamp(pitch, 0, 2),
                    format: "audio-16khz-128kbitrate-mono-mp3",
                }),
            });

            if (!res.ok) {
                const msg = await res.text().catch(() => "TTS error");
                throw new Error(msg || "TTS error");
            }

            const buf = await res.arrayBuffer();
            const blob = new Blob([buf], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);

            // swap url (cleanup old)
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            setAudioUrl(url);
            setAudioBlob(blob);
            setLastGenKey(genKey);

            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `tts-${stamp}.mp3`;

            // update player
            const el = audioRef.current;
            if (el) {
                el.src = url;
                el.load();
                setCurrentTime(0);
                setDuration(0);
                if (autoplay) {
                    try {
                        await el.play();
                    } catch {
                        // autoplay blocked
                    }
                }
            }

            showStatusToast("Done.", 1000);
            return { blob, url, filename };
        } catch (err: any) {
            setStatus(
                err?.message
                    ? `Error: ${err.message}`
                    : "Error generating audio."
            );
            setTimeout(() => setStatus(""), 2200);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    const onGenerateClick = async () => {
        await generate();
    };

    const onDownloadClick = async () => {
        // if we already have audio for current settings, download it
        if (audioBlob && lastGenKey === genKey) {
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            doDownloadBlob(audioBlob, `tts-${stamp}.mp3`);
            showStatusToast("Downloaded MP3.", 1100);
            return;
        }

        if (!autoDownloadOnClick) {
            showStatusToast("Generate first, then download.", 1100);
            return;
        }

        const out = await generate();
        if (out) doDownloadBlob(out.blob, out.filename);
    };

    const progressPct = useMemo(() => {
        if (!duration) return 0;
        return clamp(currentTime / duration, 0, 1);
    }, [currentTime, duration]);

    const qualityTip = useMemo(() => {
        const hints: string[] = [];
        if (rate > 1.2) hints.push("Lower rate a bit for more natural speech.");
        if (pitch > 1.2)
            hints.push("Pitch closer to 1.0 usually sounds realistic.");
        return (
            hints[0] || "Tip: Generate MP3, then you can scrub/seek accurately."
        );
    }, [rate, pitch]);

    const primaryIcon = isPlaying ? (
        <Pause className="h-4 w-4" />
    ) : (
        <Play className="h-4 w-4" />
    );
    const primaryLabel = isPlaying ? "Pause" : "Play";

    // Toast notification management
    const [showToast, setShowToast] = useState(false);
    const [toastFadeOut, setToastFadeOut] = useState(false);

    useEffect(() => {
        if (status) {
            setToastFadeOut(false);
            setShowToast(true);
        }
    }, [status]);

    return (
        <div className="min-h-screen w-full bg-gradient-to-b from-background via-background to-muted/30">
            {showToast && status && (
                <div
                    className={`status-toast ${toastFadeOut ? "fade-out" : ""}`}
                    onAnimationEnd={() => {
                        if (toastFadeOut) {
                            setShowToast(false);
                        }
                    }}
                >
                    {status}
                </div>
            )}
            <div className="mx-auto max-w-5xl p-4 md:p-8">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="mb-6"
                >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-11 w-11 rounded-2xl border bg-card/60 backdrop-blur flex items-center justify-center shadow-sm">
                                <AudioLines className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                                    Text to Speech (MP3)
                                </h1>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">
                                        Human Tone
                                    </Badge>
                                    {voice ? (
                                        <Badge variant="outline">{voice}</Badge>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <Visualizer active={isPlaying || isLoading} />
                    </div>
                </motion.div>

                <div className="grid gap-4 md:grid-cols-5">
                    <Card className="md:col-span-3 rounded-2xl shadow-sm border-muted/60 bg-card/70 backdrop-blur">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Text</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="Type or paste text here…"
                                className="min-h-[240px] resize-y rounded-2xl"
                                title="Enter or paste the text you want to convert to speech. Longer text = longer audio."
                            />

                            <div
                                className="rounded-2xl border bg-background/40 p-3"
                                title="Text input and generation controls"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="mx-auto flex md:items-center md:gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={onGenerateClick}
                                            disabled={isLoading || !cleanedText}
                                            className="rounded-2xl"
                                            title="Generate MP3 audio from the text above using your selected voice settings."
                                        >
                                            <Wand2 className="mr-2 h-4 w-4" />
                                            Generate
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={onDownloadClick}
                                            disabled={isLoading || !cleanedText}
                                            className="rounded-2xl"
                                            title={
                                                autoDownloadOnClick
                                                    ? "Download the generated MP3. Will auto-generate if not ready."
                                                    : "Download the generated MP3. Generate first if needed."
                                            }
                                        >
                                            <Download className="mr-2 h-4 w-4" />
                                            Download MP3
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={copyText}
                                            className="rounded-2xl"
                                            title="Copy all the text to your clipboard."
                                        >
                                            <Copy className="mr-2 h-4 w-4" />
                                            Copy
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={clearAll}
                                            className="rounded-2xl"
                                            title="Clear all text, audio, and reset everything."
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Clear
                                        </Button>
                                    </div>
                                    {/* Audio Controls */}
                                    <div
                                        className="mx-auto w-4/5 justify-around flex items-center gap-2"
                                        title="Audio playback controls"
                                    >
                                        <Button
                                            onClick={togglePlay}
                                            disabled={isLoading || !audioUrl}
                                            className="rounded-2xl"
                                            title={
                                                !audioUrl
                                                    ? "Generate audio first"
                                                    : isPlaying
                                                    ? "Pause the audio"
                                                    : "Play the generated audio"
                                            }
                                        >
                                            <span className="mr-2">
                                                {primaryIcon}
                                            </span>
                                            {primaryLabel}
                                        </Button>

                                        <Button
                                            variant="secondary"
                                            onClick={() => seekBy(-5)}
                                            disabled={!audioUrl}
                                            className="rounded-2xl"
                                            title="Rewind audio 5 seconds"
                                        >
                                            <Rewind className="mr-2 h-4 w-4" />
                                            -5s
                                        </Button>

                                        <Button
                                            variant="secondary"
                                            onClick={() => seekBy(5)}
                                            disabled={!audioUrl}
                                            className="rounded-2xl"
                                            title="Skip forward 5 seconds"
                                        >
                                            <FastForward className="mr-2 h-4 w-4" />
                                            +5s
                                        </Button>

                                        <Button
                                            variant="destructive"
                                            onClick={stopAudio}
                                            disabled={!audioUrl}
                                            className="rounded-2xl"
                                            title="Stop audio playback and reset position"
                                        >
                                            <Square className="mr-2 h-4 w-4" />
                                            Stop
                                        </Button>
                                    </div>
                                </div>

                                <div
                                    className="mt-3"
                                    title="Click on the progress bar to seek to a specific time"
                                >
                                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                                        <span title="Current playback position">
                                            {formatTime(currentTime)}
                                        </span>
                                        <span title="Total audio duration">
                                            {duration
                                                ? formatTime(duration)
                                                : "0:00"}
                                        </span>
                                    </div>
                                    <div
                                        className="h-2 rounded-full bg-muted/60 overflow-hidden cursor-pointer"
                                        onClick={setProgressFromClick}
                                        title="Click to seek to a specific time in the audio"
                                    >
                                        <div
                                            className="h-full rounded-full bg-primary transition-[width]"
                                            style={{
                                                width: `${progressPct * 100}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* hidden audio element (we control UI above) */}
                                <audio ref={audioRef} className="hidden" />
                            </div>

                            <p
                                className="text-sm text-muted-foreground"
                                title="Tips to improve audio quality"
                            >
                                {qualityTip}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="md:col-span-2 rounded-2xl shadow-sm border-muted/60 bg-card/70 backdrop-blur">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">
                                Voice & settings
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="voice" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="voice">
                                        Voice
                                    </TabsTrigger>
                                    <TabsTrigger value="prefs">
                                        Prefs
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent
                                    value="voice"
                                    className="space-y-5 pt-4"
                                >
                                    <div
                                        className="space-y-2"
                                        title="Choose from multiple Azure neural voices"
                                    >
                                        <Label title="Select the voice for text-to-speech conversion">
                                            Azure voice
                                        </Label>
                                        <Select
                                            value={voice}
                                            onValueChange={setVoice}
                                        >
                                            <SelectTrigger
                                                className="rounded-2xl"
                                                title="Click to select a voice"
                                            >
                                                <SelectValue placeholder="Select a voice" />
                                            </SelectTrigger>
                                            <SelectContent title="Available voices from Azure">
                                                {AZURE_VOICES.map((v) => (
                                                    <SelectItem
                                                        key={v.value}
                                                        value={v.value}
                                                        title={`Voice: ${v.label}`}
                                                    >
                                                        {v.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p
                                            className="text-xs text-muted-foreground"
                                            title="You can add custom voice names in Preferences"
                                        >
                                            Need a different one? Type a custom
                                            voice name in Prefs.
                                        </p>
                                    </div>
                                    <div
                                        className="space-y-2"
                                        title="Control how fast the speech is generated (0.5x = slow, 2x = fast)"
                                    >
                                        <div className="flex items-center justify-between">
                                            <Label title="Speech speed multiplier">
                                                Rate
                                            </Label>
                                            <span
                                                className="text-xs text-muted-foreground"
                                                title="Current speech rate"
                                            >
                                                {rate.toFixed(2)}×
                                            </span>
                                        </div>
                                        <Slider
                                            value={[rate]}
                                            min={0.5}
                                            max={2}
                                            step={0.05}
                                            onValueChange={(v) => setRate(v[0])}
                                            title="Drag to adjust speech speed"
                                        />
                                    </div>

                                    <div
                                        className="space-y-2"
                                        title="Adjust the pitch/tone of the voice (0 = low, 2 = high)"
                                    >
                                        <div className="flex items-center justify-between">
                                            <Label title="Voice pitch control">
                                                Pitch
                                            </Label>
                                            <span
                                                className="text-xs text-muted-foreground"
                                                title="Current pitch setting"
                                            >
                                                {pitch.toFixed(2)}
                                            </span>
                                        </div>
                                        <Slider
                                            value={[pitch]}
                                            min={0}
                                            max={2}
                                            step={0.05}
                                            onValueChange={(v) =>
                                                setPitch(v[0])
                                            }
                                            title="Drag to adjust voice pitch"
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent
                                    value="prefs"
                                    className="pt-4 space-y-4"
                                >
                                    <div
                                        className="rounded-2xl border p-3 space-y-3 bg-background/40"
                                        title="Preferences and settings for audio generation"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <Label
                                                    className="block"
                                                    title="Automatically play audio after generation"
                                                >
                                                    Autoplay after generate
                                                </Label>
                                                <p
                                                    className="text-xs text-muted-foreground"
                                                    title="Audio will start playing immediately when ready"
                                                >
                                                    Plays immediately when MP3
                                                    is ready.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={autoplay}
                                                onCheckedChange={setAutoplay}
                                                title={
                                                    autoplay
                                                        ? "Autoplay enabled"
                                                        : "Autoplay disabled"
                                                }
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <Label
                                                    className="block"
                                                    title="Download button will automatically generate if needed"
                                                >
                                                    Download button
                                                    auto-generates
                                                </Label>
                                                <p
                                                    className="text-xs text-muted-foreground"
                                                    title="Enables one-click download without manual generation"
                                                >
                                                    If not generated yet, it
                                                    will generate then download.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={autoDownloadOnClick}
                                                onCheckedChange={
                                                    setAutoDownloadOnClick
                                                }
                                                title={
                                                    autoDownloadOnClick
                                                        ? "Auto-download enabled"
                                                        : "Auto-download disabled"
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div
                                        className="rounded-2xl border p-3 space-y-3 bg-background/40"
                                        title="Use any Azure neural voice name"
                                    >
                                        <Label title="Enter custom Azure voice name">
                                            Custom voice (optional)
                                        </Label>
                                        <Input
                                            value={voice}
                                            onChange={(e) =>
                                                setVoice(e.target.value)
                                            }
                                            className="rounded-2xl"
                                            placeholder="e.g. en-US-JennyNeural"
                                            title="Paste any valid Azure Neural voice name"
                                        />
                                        <p
                                            className="text-xs text-muted-foreground"
                                            title="Find more voices at Azure documentation"
                                        >
                                            Paste any Azure Neural voice name
                                            here.
                                        </p>
                                    </div>

                                    <div
                                        className="rounded-2xl border p-3 space-y-3 bg-background/40"
                                        title="Save your preferred settings to browser storage"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={presetName}
                                                onChange={(e) =>
                                                    setPresetName(
                                                        e.target.value
                                                    )
                                                }
                                                className="rounded-2xl"
                                                placeholder="Preset name"
                                                title="Give your preset a memorable name"
                                            />
                                            <Button
                                                variant="outline"
                                                onClick={savePreset}
                                                className="rounded-2xl"
                                                title="Save current voice, rate, pitch, and preferences to your browser"
                                            >
                                                <RotateCcw className="mr-2 h-4 w-4" />
                                                Save
                                            </Button>
                                        </div>
                                        <p
                                            className="text-xs text-muted-foreground"
                                            title="Settings are saved locally in your browser"
                                        >
                                            Saves voice + sliders + preferences
                                            in your browser.
                                        </p>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
