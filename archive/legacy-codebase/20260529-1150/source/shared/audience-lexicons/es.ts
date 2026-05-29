import type { LocaleLexicon } from "./types";

// Spanish (es) — covers Iberian + Latin American slang variants.
// Terms are stored lower-case and (where possible) without diacritics so they
// match against text after `normalizeAudienceText` (NFKC + lowercase + leet +
// repeat-collapse). Common accented forms are also included since the
// normalizer does not strip accents.
export const ES_LEXICON: LocaleLexicon = {
  abuse: [
    "idiota", "estupido", "estúpido", "imbecil", "imbécil", "callate", "cállate",
    "tonto", "tonta", "pendejo", "pendeja", "gilipollas", "subnormal",
    "retrasado", "retrasada", "mongolo", "mongólico", "tarado", "tarada",
    "cretino", "cretina", "anormal", "lerdo", "lerda", "bobo", "boba",
    "menso", "mensa", "estupida", "estúpida", "patetico", "patético",
    "patetica", "patética", "asqueroso", "asquerosa", "basura", "escoria",
    "perdedor", "perdedora", "fracasado", "fracasada", "inutil", "inútil",
    "muerete", "muérete", "lameculos", "chupamedias", "boludo", "boluda",
    "pelotudo", "pelotuda", "huevon", "huevón", "huevona", "cabron", "cabrón",
    "cabrona", "mamon", "mamón", "mamona", "chinga tu madre", "tu puta madre",
    "vete a la mierda", "vete al carajo", "vete al diablo", "callate la boca",
    "cierra la boca", "no jodas", "no mames", "que asco", "qué asco",
  ],
  hate: [
    "odio a todos los", "odio a las", "mueran los", "mueran las", "fuera los",
    "fuera las", "muerte a los", "muerte a las", "fuera de mi pais",
    "fuera de mi país", "no queremos a los", "no queremos a las",
    "todos los inmigrantes", "todas las feministas", "los judios deberian",
    "los musulmanes deberian", "los negros deberian", "los gitanos deberian",
    "los chinos deberian", "los gays deberian", "los maricones",
    "que se vayan los", "echen a los", "echen a las", "expulsen a los",
    "expulsen a las", "no merecen vivir", "no son humanos",
    "son una plaga", "son ratas", "son animales", "son basura",
    "raza inferior", "raza superior", "limpieza etnica", "limpieza étnica",
    "ningun moro", "ningún moro", "ningun sudaca", "ningún sudaca",
    "panchitos", "putos negros", "putos moros", "putos chinos",
    "putos judios", "putos gays", "putos maricones", "putas feministas",
    "putas zorras", "mueranse todos los", "muéranse todos los",
    "deberian morir todos los", "deberían morir todos los",
    "hay que exterminar a los", "hay que matar a todos los",
    "linchen a los", "quememos a los", "no merecen derechos",
  ],
  spam: [
    "dinero gratis", "haz clic aqui", "haz clic aquí", "suscribete a mi canal",
    "suscríbete a mi canal", "visita mi perfil", "mira mi perfil", "mira mi bio",
    "gana dinero rapido", "gana dinero rápido", "trabaja desde casa",
    "oferta limitada", "promocion exclusiva", "promoción exclusiva",
    "compra ahora", "envio gratis", "envío gratis", "descuento del",
    "rebaja del", "regalo gratis", "premio gratis", "ganador del sorteo",
    "has ganado un", "felicidades has ganado", "reclama tu premio",
    "reclama tu regalo", "click en mi enlace", "entra en mi web",
    "visita mi web", "visita mi sitio", "visita mi tienda", "mira mi tienda",
    "mira mis videos", "mira mis vídeos", "dale like y suscribete",
    "dale like y suscríbete", "sigueme en instagram", "sígueme en instagram",
    "sigueme en tiktok", "sígueme en tiktok", "sigueme en telegram",
    "sígueme en telegram", "agregame en whatsapp", "agrégame en whatsapp",
    "escribeme al privado", "escríbeme al privado", "manda dm", "mandame dm",
    "envio info por dm", "envío info por dm", "criptomonedas gratis",
    "bitcoin gratis", "inversion segura", "inversión segura",
    "doble tu dinero", "doblá tu dinero", "ganancias garantizadas",
    "100% gratis", "totalmente gratis", "no es estafa", "esto no es spam",
    "metodo secreto", "método secreto", "truco secreto", "hack secreto",
    "cuenta premium gratis", "netflix gratis", "vbucks gratis", "robux gratis",
  ],
};
