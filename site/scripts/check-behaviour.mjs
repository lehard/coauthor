// Behaviour of the main page in a real browser (openspec/specs/web/site; design D11). Local check, not part
// of validate.sh: CI has no browsers. Run against the built site:
//   npm run build --prefix site && npm run preview --prefix site
//   SITE_URL=http://127.0.0.1:5174 CHROMIUM_PATH=<Chromium> npm run check:behaviour --prefix site
import { chromium } from "playwright-core";

import { IMPACTED, UNTOUCHED } from "../src/content/concept.ts";
import { IMPACT_COPY, STORY_APPROACH, TEAM_NOTE } from "../src/content/copy.ts";

const SITE_URL = process.env.SITE_URL;
const CHROMIUM_PATH = process.env.CHROMIUM_PATH;
if (!SITE_URL)
  throw new Error(
    "SITE_URL is not set: the address of `npm run preview --prefix site`",
  );
if (!CHROMIUM_PATH)
  throw new Error(
    "CHROMIUM_PATH is not set: the path to a Chromium executable",
  );

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

async function scrollThrough(page) {
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  for (let y = 0; y < height; y += 250) {
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
}

async function checkEditorialSections(page, name) {
  for (const copy of [STORY_APPROACH, TEAM_NOTE]) {
    const section = page.getByRole("region", { name: copy.title, exact: true });
    await section.getByRole("heading", { name: copy.title }).waitFor();
    for (const text of copy.paragraphs) {
      const paragraph = section.getByText(text, { exact: true });
      await paragraph.waitFor();
      const fits = await paragraph.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 0 && rect.right <= document.documentElement.clientWidth
        );
      });
      check(fits, `${name}: a paragraph in «${copy.title}» overflows`);
    }
    const opacity = await section
      .locator("[data-reveal]")
      .evaluate((element) => getComputedStyle(element).opacity);
    check(opacity === "1", `${name}: «${copy.title}» is not fully shown`);
  }
  const approach = page.getByRole("region", { name: STORY_APPROACH.title });
  await approach.getByText(STORY_APPROACH.badge, { exact: true }).waitFor();
  await approach.getByText(STORY_APPROACH.notYet, { exact: true }).waitFor();
}

async function checkImpactDiagram(impact, name) {
  const diagram = impact.getByRole("img");
  const labels = await diagram.locator("text").allTextContents();
  const expected = [
    "Тема",
    ...[...IMPACTED, ...UNTOUCHED].map((doc) => doc.short),
  ];
  check(
    labels.length === expected.length &&
      expected.every((label) => labels.includes(label)),
    `${name}: unexpected impact diagram labels: ${labels.join(", ")}`,
  );
  const readable = await diagram.evaluate((svg) => {
    const frame = svg.getBoundingClientRect();
    const boxes = [...svg.querySelectorAll("text")].map((label) =>
      label.getBoundingClientRect(),
    );
    return boxes.every(
      (box, index) =>
        box.left >= frame.left &&
        box.right <= frame.right &&
        box.top >= frame.top &&
        box.bottom <= frame.bottom &&
        !boxes
          .slice(index + 1)
          .some(
            (other) =>
              box.left < other.right &&
              box.right > other.left &&
              box.top < other.bottom &&
              box.bottom > other.top,
          ),
    );
  });
  check(
    readable,
    `${name}: impact labels overlap or extend beyond the diagram`,
  );
}

async function checkImpact(page, name) {
  const impact = page.getByRole("region", {
    name: IMPACT_COPY.title,
    exact: true,
  });
  await checkImpactDiagram(impact, `${name}, original decision`);
  const change = impact.getByRole("button", { name: IMPACT_COPY.change });
  await change.focus();
  await page.keyboard.press("Enter");
  const summary = impact.getByText("Задето 3 документа из 7", { exact: true });
  await summary.waitFor({ timeout: 5000 });
  check(
    (await impact.getByText(IMPACT_COPY.stale, { exact: true }).count()) ===
      2 &&
      (await impact
        .getByText(IMPACT_COPY.conflict, { exact: true })
        .count()) === 1,
    `${name}: impact results did not show both document statuses`,
  );
  for (const doc of IMPACTED) {
    await impact
      .getByRole("heading", { name: doc.name, exact: true })
      .waitFor();
  }
  for (const doc of UNTOUCHED) {
    await impact
      .getByRole("listitem")
      .getByText(doc.name, { exact: true })
      .waitFor();
  }
  await checkImpactDiagram(impact, `${name}, changed decision`);
  const undo = impact.getByRole("button", { name: IMPACT_COPY.undo });
  check(
    await undo.evaluate((button) => document.activeElement === button),
    `${name}: impact button lost keyboard focus`,
  );
  await page.keyboard.press("Space");
  await change.waitFor();
  await summary.waitFor({ state: "detached" });
  await impact
    .getByText("7 документов опираются на тему", { exact: true })
    .waitFor();
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
try {
  // Layout at two widths: no horizontal scroll, both buttons on the first screen, no errors.
  for (const [name, width, height] of [
    ["1440", 1440, 900],
    ["390", 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on(
      "console",
      (message) => message.type() === "error" && errors.push(message.text()),
    );
    await page.goto(SITE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    for (const label of ["Хочу в бету", "Войти"]) {
      const box = await page
        .getByRole("link", { name: label })
        .first()
        .boundingBox();
      check(
        box !== null && box.y + box.height <= height,
        `${name}px: «${label}» is not on the first screen`,
      );
    }
    // Beta tabs: the ring and the focus outline of the first and the last tab are not cut by the scrolling row.
    const tablist = page.getByRole("tablist");
    for (const which of ["first", "last"]) {
      const tab = tablist.getByRole("tab")[which]();
      await tab.scrollIntoViewIfNeeded();
      const room = await tab.evaluate((element) => {
        const own = element.getBoundingClientRect();
        const row = element.parentElement.getBoundingClientRect();
        return Math.min(
          own.top - row.top,
          row.bottom - own.bottom,
          own.left - row.left,
          row.right - own.right,
        );
      });
      check(
        room >= 4,
        `${name}px: the ${which} tab has ${room}px of room in its row, its ring is cut`,
      );
    }
    // The hero card of the vision block: next to the phrase on a wide screen, under it on a phone.
    const placement = await page.evaluate(() => {
      const phrase = document
        .getElementById("vision-title")
        .getBoundingClientRect();
      const card = document
        .querySelector("section[aria-labelledby='vision-title'] aside")
        .getBoundingClientRect();
      return {
        below: card.top >= phrase.bottom,
        beside: card.left >= phrase.right,
      };
    });
    check(
      width < 1024 ? placement.below : placement.beside,
      `${name}px: the hero card is not ${width < 1024 ? "under" : "next to"} the vision phrase`,
    );
    // The «one action» cards stand in a column on a phone and in a row on a wide screen.
    const columns = await page
      .locator("section[aria-labelledby='beta-tabs-title'] ul > li")
      .evaluateAll(
        (cards) =>
          new Set(cards.map((card) => card.getBoundingClientRect().left)).size,
      );
    check(
      columns === (width < 1024 ? 1 : 3),
      `${name}px: the «one action» cards stand in ${columns} columns`,
    );
    await scrollThrough(page);
    await checkEditorialSections(page, `${name}px`);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    check(overflow === 0, `${name}px: horizontal scroll of ${overflow}px`);
    await checkImpact(page, `${name}px`);
    check(
      errors.length === 0,
      `${name}px: errors in the page: ${errors.join("; ")}`,
    );
    await page.close();
  }

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.goto(SITE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // The contradiction of the first screen: show both lines, mark it as intended, show it again.
  const contradiction = page.locator(
    "section[aria-labelledby='hero-title'] figure",
  );
  const lit = () =>
    contradiction
      .locator("mark")
      .evaluateAll(
        (marks) =>
          marks.filter(
            (mark) =>
              getComputedStyle(mark).backgroundColor !== "rgba(0, 0, 0, 0)",
          ).length,
      );
  check((await lit()) === 0, "contradiction: lines are lit before a click");
  await contradiction
    .getByRole("button", { name: "Показать в тексте" })
    .click();
  check(
    (await lit()) === 2,
    "contradiction: «Показать в тексте» did not light both lines",
  );
  await contradiction.getByRole("button", { name: "Так задумано" }).focus();
  await page.keyboard.press("Enter");
  check(
    (await contradiction
      .getByRole("button", { name: "Так задумано" })
      .count()) === 0,
    "contradiction: Enter on «Так задумано» did not fold the card",
  );
  check(
    (await lit()) === 0,
    "contradiction: «Так задумано» left the lines lit",
  );
  await contradiction.getByRole("button", { name: "Показать снова" }).click();
  check(
    await contradiction
      .getByRole("button", { name: "Так задумано" })
      .isVisible(),
    "contradiction: «Показать снова» did not bring the card back",
  );

  // The vision phrase lights up word by word.
  await scrollThrough(page);
  const unlit = await page.locator("[data-word]:not([data-lit])").count();
  check(unlit === 0, `vision: ${unlit} words did not light up`);

  // The sandbox: an own answer for each question, no requests.
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const sandbox = page.locator("section[aria-labelledby='sandbox-title']");
  const questions = sandbox
    .getByRole("group", { name: "Вопросы соавтору" })
    .getByRole("button");
  const answers = new Set();
  for (let i = 0; i < (await questions.count()); i += 1) {
    await questions.nth(i).click();
    await page.waitForTimeout(2500);
    const visible = sandbox.locator("[aria-live='polite']");
    const text = await visible.innerText();
    check(
      text.includes("пример ответа"),
      `sandbox: answer ${i + 1} is not marked «пример ответа»`,
    );
    answers.add(text);
  }
  check(
    answers.size === (await questions.count()),
    "sandbox: questions do not have their own answers",
  );
  check(
    requests.length === 0,
    `sandbox: requests were sent: ${requests.join(", ")}`,
  );

  // The scene links of the answer about contradictions light one quoted line of the fragment each.
  await questions.first().click();
  await page.waitForTimeout(2500);
  // The highlight fades in and out over 300 ms; read it once the transition is over.
  const litLines = () =>
    page
      .waitForTimeout(400)
      .then(() =>
        sandbox
          .locator("mark")
          .evaluateAll((marks) =>
            marks
              .filter(
                (mark) =>
                  getComputedStyle(mark).backgroundColor !== "rgba(0, 0, 0, 0)",
              )
              .map((mark) => mark.textContent),
          ),
      );
  await sandbox.getByRole("button", { name: "Сц. 6" }).click();
  let lines = await litLines();
  check(
    lines.length === 1 && lines[0].includes("Миша утонул не случайно"),
    `sandbox: «Сц. 6» lit ${JSON.stringify(lines)}, not Anya's line`,
  );
  await sandbox.getByRole("button", { name: "Сц. 5" }).focus();
  await page.keyboard.press("Enter");
  lines = await litLines();
  check(
    lines.length === 1 && lines[0] === "Он утонул. Всё.",
    `sandbox: Enter on «Сц. 5» lit ${JSON.stringify(lines)}, not Kolya's line`,
  );
  await questions.nth(1).click();
  check(
    (await litLines()).length === 0,
    "sandbox: another question left a line lit",
  );

  // The suggestion card under the beta tabs: accept, bring back, reject from the keyboard, bring back.
  const suggestion = page
    .locator("section[aria-labelledby='beta-tabs-title'] li")
    .filter({
      has: page.getByRole("group", { name: "Соавтор предлагает правку" }),
    });
  const after = "Чашка давно чистая — Вера всё равно её трёт.";
  const before = "Чашка давно чистая. Она всё равно трёт её губкой.";
  await suggestion.getByRole("button", { name: "Принять" }).click();
  check(
    (await suggestion.locator("del").count()) === 0 &&
      (await suggestion.innerText()).includes(after) &&
      !(await suggestion.innerText()).includes(before),
    "suggestion: «Принять» did not show the new line alone",
  );
  await suggestion.getByRole("button", { name: "Вернуть предложение" }).click();
  await suggestion.getByRole("button", { name: "Отклонить" }).focus();
  await page.keyboard.press("Enter");
  check(
    (await suggestion.innerText()).includes(before) &&
      !(await suggestion.innerText()).includes(after),
    "suggestion: Enter on «Отклонить» did not keep the old line",
  );
  await suggestion.getByRole("button", { name: "Вернуть предложение" }).click();
  check(
    await suggestion.getByRole("button", { name: "Принять" }).isVisible(),
    "suggestion: «Вернуть предложение» did not bring the suggestion back",
  );

  // Beta tabs: the arrow key opens the next tab.
  const tabs = page.getByRole("tablist").getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  check(
    (await tabs.nth(1).getAttribute("aria-selected")) === "true",
    "tabs: ArrowRight did not open the next tab",
  );
  check(
    await page.getByRole("tabpanel").first().isVisible(),
    "tabs: no visible panel",
  );

  // The form still reports an accepted request (the API answer is stubbed here).
  await page.route("**/os/api/v1/beta-requests", (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: '{"status":"accepted"}',
    }),
  );
  await page.getByLabel("Почта").fill("check@authorled.test");
  await page.getByLabel("Имя").fill("Проверка");
  await page.getByText("Сценарист", { exact: true }).click();
  await page.locator("input[type='checkbox']").check();
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  const accepted = await page
    .getByText("Заявка принята")
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(accepted, "form: no «Заявка принята»");
  await page.close();

  // Without JavaScript and with reduced motion everything is shown in its end state.
  for (const [name, viewport, options] of [
    [
      "no JavaScript",
      { width: 1440, height: 900 },
      { javaScriptEnabled: false },
    ],
    [
      "no JavaScript at 390px",
      { width: 390, height: 844 },
      { javaScriptEnabled: false },
    ],
    [
      "reduced motion",
      { width: 1440, height: 900 },
      { reducedMotion: "reduce" },
    ],
  ]) {
    const context = await browser.newContext({
      viewport,
      ...options,
    });
    const view = await context.newPage();
    await view.goto(SITE_URL, { waitUntil: "load" });
    await view.waitForTimeout(500);
    await checkEditorialSections(view, name);
    const hidden = await view.evaluate(
      () =>
        [...document.querySelectorAll("[data-reveal], [data-word]")].filter(
          (element) => Number(getComputedStyle(element).opacity) < 1,
        ).length,
    );
    check(hidden === 0, `${name}: ${hidden} blocks or words are not shown`);
    const hero = await view.evaluate(() => {
      const figure = document.querySelector(
        "section[aria-labelledby='hero-title'] figure",
      );
      const hidden = [...figure.querySelectorAll("[data-appear]")].filter(
        (element) => Number(getComputedStyle(element).opacity) < 1,
      ).length;
      const undrawn = [...figure.querySelectorAll("[data-rail]")].filter(
        (line) => getComputedStyle(line).transform !== "none",
      ).length;
      return { hidden, undrawn, marks: figure.querySelectorAll("mark").length };
    });
    check(
      hero.marks === 2 && hero.hidden === 0 && hero.undrawn === 0,
      `${name}: the first screen is not in its end state (${JSON.stringify(hero)})`,
    );
    const faq = view
      .locator("section[aria-labelledby='faq-title'] details")
      .first();
    await faq.locator("summary").click();
    check(
      (await faq.getAttribute("open")) !== null,
      `${name}: a question does not open`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error(`site behaviour check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("site behaviour check passed");
