export const AI_MODELS = {
  PRIMARY: "gpt-5.5" as const,
  IMAGE: "gpt-image-1" as const,
  AUDIO: "gpt-audio" as const,
  TRANSCRIBE: "gpt-4o-mini-transcribe" as const,
  TTS: "tts-1" as const,
  WHISPER: "whisper-1" as const,
};

export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-5.5": { input: 0.0025, output: 0.01 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
};

export const MODEL_CREDIT_COSTS: Record<string, number> = {
  "gpt-5.5": 5,
  "gpt-4o": 5,
  "gpt-4o-mini": 2,
};

export const DEFAULT_MODEL = AI_MODELS.PRIMARY;
