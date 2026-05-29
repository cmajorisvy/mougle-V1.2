import type { LocaleLexicon } from "./types";

// English audience safety is handled by the primary axis scorers in
// `omni-channel-audience-safety-service.ts` (toxicity, abuse, spam, hate, …),
// so the per-locale lexicon for `en` is intentionally empty. It exists only
// so the locale map has full coverage of `SupportedLexiconLocale`.
export const EN_LEXICON: LocaleLexicon = {
  abuse: [],
  hate: [],
  spam: [],
};
