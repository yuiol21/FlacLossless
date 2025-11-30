import { GoogleGenAI, FunctionDeclaration, Type, Blob, Modality } from "@google/genai";
import { EQ_FREQUENCIES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// LiveSession type is not exported by the SDK, so we define a loose type for it.
type LiveSession = any;

// 1. Define Tools (Functions the AI can call)
const updateEQTool: FunctionDeclaration = {
  name: "updateEQ",
  description: "Updates the 10-band equalizer settings based on a description (e.g., 'Bass Boost', 'Vocal Clarity').",
  parameters: {
    type: Type.OBJECT,
    properties: {
      presetName: { type: Type.STRING, description: "Name of the preset being applied" },
      gains: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
        description: "Array of 10 gain values (dB) from -12 to 12."
      }
    },
    required: ["gains"]
  }
};

const controlPlaybackTool: FunctionDeclaration = {
  name: "controlPlayback",
  description: "Controls the music playback (play, pause, volume, speed).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["play", "pause", "resume"], description: "The playback action" },
      volume: { type: Type.NUMBER, description: "Volume level from 0.0 to 1.0" },
      playbackRate: { type: Type.NUMBER, description: "Playback speed/pitch multiplier (0.5 to 2.0)" }
    }
  }
};

// 2. Audio Utils for Live API
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

function base64ToBlob(base64: string): Blob {
    return {
        data: base64,
        mimeType: 'audio/pcm;rate=24000' // Model output format
    };
}

// 3. Service Class
class LiveService {
  private session: LiveSession | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private inputStream: MediaStream | null = null;
  private onEQUpdate: ((gains: number[]) => void) | null = null;
  private onPlaybackUpdate: ((action: string, val?: number) => void) | null = null;

  async connect(
    onEQUpdate: (gains: number[]) => void, 
    onPlaybackUpdate: (action: string, val?: number) => void
  ) {
    this.onEQUpdate = onEQUpdate;
    this.onPlaybackUpdate = onPlaybackUpdate;

    // Get Microphone Stream
    this.inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Connect to Gemini Live
    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        tools: [{ functionDeclarations: [updateEQTool, controlPlaybackTool] }],
        systemInstruction: "You are the AI engine of a high-tech music player called SonicPulse. Users will speak commands to change the equalizer or playback. When asked to change sound, generate specific 10-band gain values and call the updateEQ tool. Be brief and robotic.",
      },
      callbacks: {
        onopen: () => {
          console.log("Live Socket Connected");
          this.startAudioStream(sessionPromise);
        },
        onmessage: (msg) => {
          // Handle Function Calls
          if (msg.toolCall) {
            this.handleToolCall(msg.toolCall, sessionPromise);
          }
        },
        onclose: () => console.log("Live Socket Closed"),
        onerror: (err) => console.error("Live Socket Error", err)
      }
    });

    this.session = await sessionPromise;
  }

  private startAudioStream(sessionPromise: Promise<LiveSession>) {
    if (!this.inputStream) return;

    const source = audioContext.createMediaStreamSource(this.inputStream);
    // Use ScriptProcessor for raw PCM data (Live API requirement)
    this.inputProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    
    this.inputProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Convert Float32 to Int16 PCM for Gemini
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Base64 Encode
      let binary = '';
      const bytes = new Uint8Array(pcmData.buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      sessionPromise.then(session => {
          session.sendRealtimeInput({
             media: {
                 mimeType: 'audio/pcm;rate=16000',
                 data: base64
             }
          });
      });
    };

    source.connect(this.inputProcessor);
    this.inputProcessor.connect(audioContext.destination);
  }

  private handleToolCall(toolCall: any, sessionPromise: Promise<LiveSession>) {
    toolCall.functionCalls.forEach((fc: any) => {
        let result = { status: "ok" };

        if (fc.name === "updateEQ" && this.onEQUpdate) {
            this.onEQUpdate(fc.args.gains);
            result = { status: "EQ Updated" };
        } else if (fc.name === "controlPlayback" && this.onPlaybackUpdate) {
            if (fc.args.action) this.onPlaybackUpdate(fc.args.action);
            if (fc.args.playbackRate) this.onPlaybackUpdate("rate", fc.args.playbackRate);
            result = { status: "Playback Updated" };
        }

        // Send response back to model
        sessionPromise.then(session => {
            session.sendToolResponse({
                functionResponses: {
                    id: fc.id,
                    name: fc.name,
                    response: { result }
                }
            });
        });
    });
  }

  disconnect() {
    if (this.session) {
      // No explicit close method in current SDK type, usually strictly managed by connection drop
      // but we can stop sending audio
    }
    if (this.inputStream) {
        this.inputStream.getTracks().forEach(t => t.stop());
    }
    if (this.inputProcessor) {
        this.inputProcessor.disconnect();
    }
  }
}

export const liveService = new LiveService();