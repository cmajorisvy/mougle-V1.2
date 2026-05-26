import type { SupportedLexiconLocale } from "../omni-channel-audience-schema";

export type LexiconAxis = "abuse" | "hate" | "spam";

export type LocaleLexicon = Record<LexiconAxis, string[]>;

export type MultilingualLexicons = Record<SupportedLexiconLocale, LocaleLexicon>;
