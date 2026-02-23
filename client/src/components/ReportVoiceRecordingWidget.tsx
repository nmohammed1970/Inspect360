import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mic, Square, Play, Sparkles, Loader2, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getAudioUrls(value: string[] | string | null | undefined): string[] {
    if (Array.isArray(value)) return value.filter((u): u is string => typeof u === "string");
    if (typeof value === "string") return [value];
    return [];
}

interface ReportVoiceRecordingWidgetProps {
    fieldId: string;
    initialAudioUrls: string[];
    onTranscription: (audioUrl: string, transcribedText: string) => Promise<void>;
    onAudioUrlsChange: (audioUrls: string[]) => Promise<void>;
}

export function ReportVoiceRecordingWidget({
    fieldId,
    initialAudioUrls,
    onTranscription,
    onAudioUrlsChange,
}: ReportVoiceRecordingWidgetProps) {
    const { toast } = useToast();

    const [audioUrls, setAudioUrls] = useState<string[]>(initialAudioUrls);
    const audioUrlsRef = useRef<string[]>(initialAudioUrls);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [transcribingUrl, setTranscribingUrl] = useState<string | null>(null);
    const [playingUrl, setPlayingUrl] = useState<string | null>(null);
    const [isUploadingAudio, setIsUploadingAudio] = useState(false);

    const currentAudioRef = useRef<HTMLAudioElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const urls = getAudioUrls(initialAudioUrls);
        if (JSON.stringify(urls) !== JSON.stringify(audioUrlsRef.current)) {
            audioUrlsRef.current = urls;
            setAudioUrls(urls);
        }
    }, [initialAudioUrls]);

    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                mediaRecorderRef.current.stop();
                mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    return (
        <div className="pt-2 space-y-2 no-print">
            <Label className="text-sm font-bold text-muted-foreground mt-2 inline-block">
                Voice Recording
            </Label>
            <div className="flex flex-wrap items-center gap-2">
                {!isRecording && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                            try {
                                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                const mediaRecorder = new MediaRecorder(stream, {
                                    mimeType: "audio/webm;codecs=opus",
                                });

                                mediaRecorderRef.current = mediaRecorder;
                                audioChunksRef.current = [];

                                mediaRecorder.ondataavailable = (event) => {
                                    if (event.data.size > 0) {
                                        audioChunksRef.current.push(event.data);
                                    }
                                };

                                mediaRecorder.onstop = () => {
                                    stream.getTracks().forEach((track) => track.stop());
                                };

                                mediaRecorder.start();
                                setIsRecording(true);
                                setRecordingTime(0);

                                recordingTimerRef.current = setInterval(() => {
                                    setRecordingTime((prev) => prev + 1);
                                }, 1000);
                            } catch (error: any) {
                                toast({
                                    title: "Recording Failed",
                                    description: error.message || "Could not access microphone.",
                                    variant: "destructive",
                                });
                            }
                        }}
                        data-testid={`button-start-recording-${fieldId}`}
                    >
                        <Mic className="w-4 h-4 mr-2" />
                        Add Recording
                    </Button>
                )}

                {isRecording && (
                    <>
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={async () => {
                                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                                    mediaRecorderRef.current.stop();
                                    setIsRecording(false);
                                    if (recordingTimerRef.current) {
                                        clearInterval(recordingTimerRef.current);
                                        recordingTimerRef.current = null;
                                    }

                                    if (audioChunksRef.current.length > 0) {
                                        setIsUploadingAudio(true);
                                        try {
                                            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                                            const uploadFormData = new FormData();
                                            uploadFormData.append("file", audioBlob, "voice-note.webm");

                                            const uploadResponse = await fetch("/api/objects/upload-file", {
                                                method: "POST",
                                                body: uploadFormData,
                                                credentials: "include",
                                            });

                                            if (!uploadResponse.ok) throw new Error("Failed to upload audio file");

                                            const uploadResult = await uploadResponse.json();
                                            const uploadedAudioUrl = uploadResult.url || uploadResult.objectId;

                                            if (!uploadedAudioUrl) throw new Error("No audio URL returned from upload");

                                            const newUrls = [...audioUrlsRef.current, uploadedAudioUrl];
                                            audioUrlsRef.current = newUrls;
                                            setAudioUrls(newUrls);
                                            await onAudioUrlsChange(newUrls);

                                            toast({
                                                title: "Voice Note Saved",
                                                description: "Your voice note has been saved.",
                                            });
                                        } catch (error: any) {
                                            toast({
                                                title: "Upload Failed",
                                                description: "Voice note could not be saved.",
                                                variant: "destructive",
                                            });
                                        } finally {
                                            setIsUploadingAudio(false);
                                        }
                                    }
                                }
                            }}
                            data-testid={`button-stop-recording-${fieldId}`}
                            disabled={isUploadingAudio}
                        >
                            <Square className="w-4 h-4 mr-2" />
                            {isUploadingAudio
                                ? "Saving..."
                                : `Stop (${Math.floor(recordingTime / 60)}:${(recordingTime % 60).toString().padStart(2, "0")})`}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                                    mediaRecorderRef.current.stop();
                                    mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
                                }
                                if (recordingTimerRef.current) {
                                    clearInterval(recordingTimerRef.current);
                                    recordingTimerRef.current = null;
                                }
                                audioChunksRef.current = [];
                                setIsRecording(false);
                            }}
                        >
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                        </Button>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-sm text-muted-foreground">Recording...</span>
                        </div>
                    </>
                )}

                {audioUrls.length > 0 && !isRecording && (
                    <div className="flex flex-col gap-2 w-full">
                        {[...audioUrls].reverse().map((url, idx) => (
                            <div key={idx} className="flex flex-wrap items-center gap-2 p-2 rounded border">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        if (playingUrl === url) {
                                            currentAudioRef.current?.pause();
                                            setPlayingUrl(null);
                                            return;
                                        }
                                        currentAudioRef.current?.pause();
                                        const resolvedUrl = url.startsWith("/") ? `${window.location.origin}${url}` : url;
                                        const audio = new Audio(resolvedUrl);
                                        currentAudioRef.current = audio;
                                        audio.onended = () => {
                                            setPlayingUrl(null);
                                            currentAudioRef.current = null;
                                        };
                                        audio.onerror = () => {
                                            toast({ title: "Playback Failed", variant: "destructive" });
                                            setPlayingUrl(null);
                                            currentAudioRef.current = null;
                                        };
                                        audio.play();
                                        setPlayingUrl(url);
                                    }}
                                >
                                    {playingUrl === url ? (
                                        <><Square className="w-4 h-4 mr-2" /> Pause</>
                                    ) : (
                                        <><Play className="w-4 h-4 mr-2" /> Play #{idx + 1}</>
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    disabled={!!transcribingUrl}
                                    onClick={async () => {
                                        setTranscribingUrl(url);
                                        try {
                                            const fetchUrl = url.startsWith("http") ? url : `${window.location.origin}${url.startsWith("/") ? url : "/" + url}`;
                                            const response = await fetch(fetchUrl);
                                            const audioBlob = await response.blob();
                                            const formData = new FormData();
                                            formData.append("audio", audioBlob, "recording.webm");

                                            const resp = await fetch("/api/audio/transcribe", {
                                                method: "POST",
                                                body: formData,
                                                credentials: "include",
                                            });
                                            if (!resp.ok) throw new Error("Transcription failed");
                                            const result = await resp.json();
                                            if (result.text) {
                                                await onTranscription(url, result.text);
                                                toast({ title: "Transcription Complete", description: "Added to notes." });
                                            } else throw new Error("No transcription text");
                                        } catch (error: any) {
                                            toast({
                                                title: "Transcription Failed",
                                                description: error.message || "Failed to transcribe.",
                                                variant: "destructive",
                                            });
                                        } finally {
                                            setTranscribingUrl(null);
                                        }
                                    }}
                                >
                                    {transcribingUrl === url ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Transcribing...</>
                                    ) : (
                                        <><Sparkles className="w-4 h-4 mr-2" /> Transcribe</>
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive border-destructive hover:bg-destructive/10"
                                    onClick={async () => {
                                        const newUrls = audioUrls.filter((u) => u !== url);
                                        audioUrlsRef.current = newUrls;
                                        setAudioUrls(newUrls);
                                        if (playingUrl === url) setPlayingUrl(null);
                                        await onAudioUrlsChange(newUrls);
                                    }}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
