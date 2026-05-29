import type { MultilingualLexicons } from "./types";
import { EN_LEXICON } from "./en";
import { ES_LEXICON } from "./es";
import { PT_LEXICON } from "./pt";
import { FR_LEXICON } from "./fr";
import { DE_LEXICON } from "./de";
import { ZH_LEXICON } from "./zh";
import { AR_LEXICON } from "./ar";

export type { LexiconAxis, LocaleLexicon, MultilingualLexicons } from "./types";

export const MULTILINGUAL_LEXICONS: MultilingualLexicons = {
  en: EN_LEXICON,
  es: ES_LEXICON,
  pt: PT_LEXICON,
  fr: FR_LEXICON,
  de: DE_LEXICON,
  zh: ZH_LEXICON,
  ar: AR_LEXICON,
};
