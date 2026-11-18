// Editorial excerpts from the beta demo «Тихая вода», draft water-1 (web/src/data/demo.json), copied by hand:
// the site does not load the data of web/ (design D13).

/** A run of a line: plain text, a marked place the answer rests on, or words the answer proposes to remove. */
export type Segment = string | { mark: string } | { strike: string };

export type Line = {
  kind: "char" | "paren" | "dialogue" | "action" | "fact";
  text: Segment[];
  /** The line carries a dot that ties it to the answer. */
  hit?: boolean;
  /** An empty line before it, as on a screenplay page. */
  gap?: boolean;
};

export type Excerpt = { meta: string; lines: Line[] };

export type Answer = { question: string; answer: string; sheet: Excerpt[] };

export const ANSWERS: Answer[] = [
  {
    question: "Где у меня расходятся детали?",
    answer:
      "В сцене 5 Коля говорит: «Он утонул. Всё.» В сцене 6 Аня пересказывает его слова иначе: «Он сказал, что Миша утонул не случайно». Аня так поняла Колю или сознательно меняет его слова?",
    sheet: [
      {
        meta: "Сцена 5 · Гараж",
        lines: [
          { kind: "char", text: ["ДЯДЯ КОЛЯ"] },
          { kind: "paren", text: ["(не поднимая головы)"] },
          { kind: "dialogue", text: [{ mark: "Он утонул. Всё." }], hit: true },
        ],
      },
      {
        meta: "Сцена 6 · Кухня",
        lines: [
          { kind: "char", text: ["АНЯ"] },
          {
            kind: "dialogue",
            text: [
              "Я была у дяди Коли. ",
              { mark: "Он сказал, что Миша утонул не случайно." },
            ],
            hit: true,
          },
        ],
      },
    ],
  },
  {
    question: "Что мы знаем об этом герое?",
    answer:
      "Дяде Коле 60 лет. Он был на озере в тот день. В сцене 3 он отводит взгляд к воде, а в гараже отвечает Ане, не поднимая головы.",
    sheet: [
      {
        meta: "Карточка героя · Дядя Коля",
        lines: [
          {
            kind: "fact",
            text: ["Деверь Веры; ", { mark: "был на озере в тот день" }, "."],
            hit: true,
          },
        ],
      },
      {
        meta: "Сцена 3 · Пристань",
        lines: [
          {
            kind: "action",
            text: [
              "Паром причаливает. АНЯ (24) спрыгивает на берег с рюкзаком. ",
              { mark: "ДЯДЯ КОЛЯ (60)" },
              " курит у будки кассы.",
            ],
            hit: true,
          },
          {
            kind: "action",
            text: [{ mark: "Коля отводит глаза к воде." }],
            hit: true,
            gap: true,
          },
        ],
      },
      {
        meta: "Сцена 5 · Гараж",
        lines: [
          { kind: "char", text: ["ДЯДЯ КОЛЯ"] },
          {
            kind: "paren",
            text: [{ mark: "(не поднимая головы)" }],
            hit: true,
          },
          { kind: "dialogue", text: ["Он утонул. Всё."] },
        ],
      },
    ],
  },
  {
    question: "Можно ли сократить эту сцену?",
    answer:
      "В сцене 6 можно убрать реплику Ани «Мам, ты опять не спишь?». Что Вера не спит, уже видно: она трёт давно чистую чашку. Без реплики Аня входит молча, и первой говорит Вера.",
    sheet: [
      {
        meta: "Сцена 6 · Кухня",
        lines: [
          {
            kind: "action",
            text: [
              "Свет только над раковиной. ВЕРА моет чашку. ",
              { mark: "Чашка давно чистая. Она всё равно трёт её губкой." },
            ],
            hit: true,
          },
          { kind: "char", text: [{ strike: "АНЯ (З.К.)" }], gap: true },
          {
            kind: "dialogue",
            text: [{ strike: "Мам, ты опять не спишь?" }],
            hit: true,
          },
          {
            kind: "action",
            text: ["Входит АНЯ, в куртке, с рюкзаком. Ставит рюкзак на стул."],
            gap: true,
          },
          { kind: "char", text: ["ВЕРА"], gap: true },
          { kind: "paren", text: ["(не оборачиваясь)"] },
          {
            kind: "dialogue",
            text: ["Я же просила звонить, когда едешь так поздно."],
          },
        ],
      },
    ],
  },
];

/** The caption of every canned answer (openspec/specs/web/site, «Разные источники примеров»). */
export const ANSWER_CAPTION = "Пример ответа";
