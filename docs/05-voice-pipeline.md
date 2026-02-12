# Voice Pipeline

End-to-end voice integration from microphone input through AI providers to mouth animation.

```mermaid
flowchart TD
    subgraph User Input
        MIC["Microphone<br/>(getUserMedia)"]
    end

    subgraph "Provider: OpenAI Realtime (realtime-voice.js)"
        OA_PC["RTCPeerConnection<br/>+ RTCDataChannel"]
        OA_SDP["SDP offer/answer<br/>via /realtime sessions"]
        OA_AUDIO["Remote audio stream<br/>→ AnalyserNode"]
        OA_DC["Data channel events:<br/>transcript, session.created,<br/>response.audio_transcript.delta"]
    end

    subgraph "Provider: ElevenLabs (elevenlabs-voice.js)"
        EL_CONV["Conversation SDK<br/>(WebRTC or WebSocket)"]
        EL_AUDIO["Remote audio stream<br/>→ AnalyserNode"]
        EL_EVENTS["Events:<br/>agent_response,<br/>agent_response_correction"]
    end

    subgraph "Viseme Generation (visemes.js)"
        PARSE["textToVisemeFrames(text)"]
        DIGRAPH["Digraph rules<br/>(th, ch, sh, oo, ea...)"]
        SINGLE["Single-letter rules<br/>(a→aa, m→mbp, f→fv...)"]
        COALESCE["coalesce() — merge<br/>adjacent identical visemes"]
    end

    subgraph "Audio Analysis"
        ANALYSER["AnalyserNode<br/>getByteFrequencyData()"]
        SMOOTH["Smoothed speech level<br/>(0–1 float)"]
    end

    subgraph "Viseme Timeline"
        QUEUE["visemeQueue[]<br/>{ viseme, durationMs }"]
        STEP["Timeline stepping:<br/>elapsed += dt * 1000<br/>advance when frame expires"]
        EMIT["Emit { viseme, strength }<br/>to studio callbacks"]
    end

    subgraph "Studio Dispatch (studio.js)"
        MUTEX["Mutual exclusion:<br/>canConsumeVoice(provider)<br/>activeVoiceProvider"]
        SPEECH["assistantSpeechLevel"]
        VISEME_STATE["assistantViseme<br/>{ viseme, strength }"]
    end

    subgraph "Avatar Mouth"
        VOICE_ACT["controller.setVoiceActivity(level)"]
        VOICE_VIS["controller.setVoiceViseme(payload)"]
        MOUTH["Mouth rig animation<br/>(pose blending)"]
    end

    MIC -->|"audio track"| OA_PC
    MIC -->|"audio track"| EL_CONV

    OA_PC --> OA_SDP
    OA_PC --> OA_AUDIO
    OA_PC --> OA_DC

    EL_CONV --> EL_AUDIO
    EL_CONV --> EL_EVENTS

    OA_DC -->|"transcript delta text"| PARSE
    EL_EVENTS -->|"agent response text"| PARSE

    PARSE --> DIGRAPH
    PARSE --> SINGLE
    DIGRAPH --> COALESCE
    SINGLE --> COALESCE
    COALESCE --> QUEUE

    OA_AUDIO --> ANALYSER
    EL_AUDIO --> ANALYSER
    ANALYSER --> SMOOTH

    QUEUE --> STEP
    STEP --> EMIT

    EMIT --> MUTEX
    SMOOTH --> MUTEX

    MUTEX --> SPEECH
    MUTEX --> VISEME_STATE

    SPEECH --> VOICE_ACT
    VISEME_STATE --> VOICE_VIS

    VOICE_ACT --> MOUTH
    VOICE_VIS --> MOUTH
```

## Provider Lifecycle

Both providers follow the same pattern:

1. **Connect**: User clicks voice button → acquire microphone → establish WebRTC/WebSocket connection
2. **Session**: Provider sends session configuration (instructions, voice, model)
3. **Streaming**: Audio flows bidirectionally; transcript chunks arrive as events
4. **Viseme generation**: Each transcript chunk is parsed into viseme frames and queued
5. **Disconnect**: User clicks again or provider errors → cleanup audio, close connection

## Mutual Exclusion

Only one voice provider can be active at a time. `handleVoiceConnectionChange()` in studio.js enforces this:

```
Provider A connects → activeVoiceProvider = "A"
                    → Provider B.disconnect({ silent: true })

Provider A disconnects → activeVoiceProvider = null
                       → setAssistantMouth() (reset to silent)
```

## Speech Level Analysis

Both providers create a Web Audio pipeline on the remote audio stream:

```
Remote audio → MediaStreamSource → AnalyserNode → getByteFrequencyData()
                                                 → average speech band (85–255 Hz range)
                                                 → normalize to 0–1
                                                 → smooth with exponential decay
```

The smoothed level drives `setVoiceActivity(level)` on the active avatar, producing subtle mouth movement even between viseme transitions.
