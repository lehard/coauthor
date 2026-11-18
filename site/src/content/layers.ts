// «Что стоит за одним ответом» (openspec/specs/web/site; design D6): one plain answer and the five layers it rests
// on, from the author's screenplay down to the schools. Names are plain words: the page never names the framework
// the layers come from («Слои названы простыми словами»).

export const TIP = {
  title: "Что стоит за одним ответом",
  question: "Где у меня расходятся детали?",
  answer:
    "В сцене 5 Коля говорит: «Он утонул. Всё.» В сцене 6 Аня пересказывает его слова иначе: «Он сказал, что Миша утонул не случайно».",
  waterline: "под ответом",
  listLabel:
    "Слои, на которые опирается ответ. В каждом выделено то, что понадобилось для этого ответа, остальное названо по сторонам",
  summary:
    "В этом ответе сошлись две сцены, три карточки, три области, два приёма и три школы. В следующем ответе загорятся другие.",
};

export type Layer = {
  name: string;
  /** Width of the layer from 1024 px, in % of the column: the layers widen downwards. */
  width: number;
  /** Dots of the background web. */
  dots: number;
  left: string[];
  lit: { key: string; name: string }[];
  right: string[];
};

export const LAYERS: Layer[] = [
  {
    name: "Ваш сценарий",
    width: 62,
    dots: 18,
    left: ["Сцена 1", "Сцена 2", "Сцена 3", "Сцена 4"],
    lit: [
      { key: "s5", name: "Сцена 5 · Гараж" },
      { key: "s6", name: "Сцена 6 · Кухня" },
    ],
    right: ["Сцена 7"],
  },
  {
    name: "Герои, места, заметки",
    width: 72,
    dots: 28,
    left: ["Озеро", "Дом Веры", "Миша", "Вера"],
    lit: [
      { key: "kolya", name: "Дядя Коля" },
      { key: "anya", name: "Аня" },
      { key: "note", name: "Что знает Аня" },
    ],
    right: ["Гараж", "Пристань", "Вопросы к читке"],
  },
  {
    name: "Как устроена история",
    width: 82,
    dots: 40,
    left: ["Тема и смысл", "Эмоции", "Мир и причины"],
    lit: [
      { key: "chars", name: "Характеры" },
      { key: "rel", name: "Отношения" },
      { key: "know", name: "Кто что знает" },
    ],
    right: ["Конфликт и выбор", "Зритель"],
  },
  {
    name: "Приёмы драматургии",
    width: 91,
    dots: 54,
    left: [
      "Градации антагонизма",
      "Ставки",
      "Сюжетные линии",
      "Арка героя",
      "Ценностный поворот",
    ],
    lit: [
      { key: "subtext", name: "Подтекст" },
      { key: "speech", name: "Речевое действие" },
    ],
    right: [
      "Раскрытие и открытие",
      "Мотив и повтор",
      "Жанровые ожидания",
      "Комический ритм",
      "Закладки и финал",
    ],
  },
  {
    name: "Школы и исследования",
    width: 100,
    dots: 70,
    left: ["Язык и стиль", "Кинонарратив", "Бордуэлл", "Труби", "Макки"],
    lit: [
      { key: "seger", name: "Сегер" },
      { key: "egri", name: "Эгри" },
      { key: "dialog", name: "Исследования диалога" },
    ],
    right: ["Сериальная композиция", "Комедия", "Жанры", "Импровизация"],
  },
];

/** The lines from the answer down: from what used it to what it used, layer by layer. */
export const LINKS: [string, string][] = [
  ["answer", "s5"],
  ["answer", "s6"],
  ["s5", "kolya"],
  ["s6", "anya"],
  ["s6", "note"],
  ["kolya", "chars"],
  ["kolya", "rel"],
  ["anya", "rel"],
  ["anya", "know"],
  ["note", "know"],
  ["chars", "subtext"],
  ["rel", "subtext"],
  ["know", "speech"],
  ["subtext", "seger"],
  ["speech", "egri"],
  ["speech", "dialog"],
];

export const WEB_SIZE = { width: 1200, height: 180 };

export type Web = {
  dots: { x: number; y: number; r: number }[];
  lines: [number, number][];
};

/**
 * The background web of a layer: dots and the short lines between near ones, from a fixed seed, so the prerendered
 * page and the browser draw the same web (design D6).
 */
export function web(dots: number, seed: number): Web {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const points = Array.from({ length: dots }, () => ({
    x: Math.round(12 + random() * (WEB_SIZE.width - 24)),
    y: Math.round(12 + random() * (WEB_SIZE.height - 24)),
    r: random() < 0.35 ? 2.2 : 1.6,
  }));
  const lines: [number, number][] = [];
  points.forEach((point, index) => {
    const near = points
      .map((other, otherIndex) => ({
        otherIndex,
        distance: Math.hypot(other.x - point.x, other.y - point.y),
      }))
      .filter(({ otherIndex, distance }) => otherIndex > index && distance < 95)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
    for (const { otherIndex } of near) lines.push([index, otherIndex]);
  });
  return { dots: points, lines };
}
