// Run against a built preview, with SITE_URL and CHROMIUM_PATH set (openspec/specs/web/site; design D14).
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { ANSWERS } from "../src/content/demo.ts";
import { GARAGE, NOTES } from "../src/content/garage.ts";
import { HERO, TEAM_NOTE } from "../src/content/copy.ts";
import { LAYERS, LINKS } from "../src/content/layers.ts";

const { SITE_URL, CHROMIUM_PATH } = process.env;
if (!SITE_URL) throw new Error("Set SITE_URL to the built site preview");
if (!CHROMIUM_PATH)
  throw new Error("Set CHROMIUM_PATH to a Chromium executable");

const ALL_NOTES = [NOTES.start, NOTES.quarrel, ...NOTES.reasons];

async function open(browser, options) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(SITE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // The first screen rises into place on load; measure it once it stands still.
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  return { page, errors };
}

const rect = (locator) =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  });

const near = (a, b, message) =>
  assert(Math.abs(a - b) <= 1, `${message}: ${a} vs ${b}`);

const inView = (locator) =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight && box.height > 0;
  });

/**
 * Scrolls the middle of an element to the middle of the screen at once. Not scrollIntoView: the notes have a scroll
 * margin for their anchors, and the page scrolls smoothly otherwise.
 */
const centre = (locator) =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    scrollTo({
      top: scrollY + box.top + box.height / 2 - innerHeight / 2,
      behavior: "instant",
    });
  });

/** Waits for a smooth scroll to bring the element into view. Polled from here: without JavaScript the page runs no
 * timers, so page.waitForFunction never returns. */
async function waitInView(locator, message) {
  for (let tries = 0; tries < 50; tries++) {
    if (await inView(locator)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${message}: not in view after 5 s`);
}

/** The colour behind an element: its own background or that of the nearest painted ancestor. */
const paint = (locator) =>
  locator.evaluate((element) => {
    let node = element;
    while (node) {
      const background = getComputedStyle(node).backgroundColor;
      if (background !== "rgba(0, 0, 0, 0)" && background !== "transparent")
        return { background, color: getComputedStyle(element).color };
      node = node.parentElement;
    }
    throw new Error("no painted ancestor");
  });

// ---------- The first screen (design D4) ----------

async function checkEditorEdges(page) {
  const sheet = await rect(page.locator(".sheet"));
  const bar = await rect(page.locator(".ed-bar"));
  const chat = await rect(page.locator(".chat"));
  const head = await rect(page.locator(".chat-head"));
  near(sheet.height, (sheet.width * 297) / 210, "the sheet is not A4");
  near(bar.left, sheet.left, "toolbar left edge");
  near(bar.right, sheet.right, "toolbar right edge");
  near(bar.top, chat.top, "toolbar top and chat top");
  near(sheet.bottom, chat.bottom, "sheet bottom and chat bottom");
  near(head.bottom, sheet.top, "the rule under the chat head");
}

async function checkHeroLayouts(browser) {
  {
    const { page, errors } = await open(browser, {
      viewport: { width: 1440, height: 900 },
    });
    await checkEditorEdges(page);
    assert.deepEqual(errors, [], "browser errors at 1440");
    await page.close();
  }
  {
    const { page, errors } = await open(browser, {
      viewport: { width: 1000, height: 862 },
    });
    await checkEditorEdges(page);
    const column = await page.locator(".hero .wrap").evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: box.left + parseFloat(style.paddingLeft),
        right: box.right - parseFloat(style.paddingRight),
      };
    });
    near(
      (await rect(page.locator(".sheet"))).left,
      column.left,
      "1000 px: sheet and column",
    );
    near(
      (await rect(page.locator(".chat"))).right,
      column.right,
      "1000 px: chat and column",
    );
    for (const question of await page.locator(".co-q").all())
      assert(await inView(question), "1000 px: a ready question is hidden");
    assert.deepEqual(errors, [], "browser errors at 1000");
    await page.close();
  }
  {
    const { page, errors } = await open(browser, {
      viewport: { width: 1024, height: 768 },
    });
    for (const locator of [
      page.locator("h1"),
      page.locator(".hero-cta .btn"),
      page.locator(".sheet"),
      page.locator(".chat"),
      ...(await page.locator(".co-q").all()),
    ])
      assert(await inView(locator), "1024×768: the first screen is cut");
    assert.deepEqual(errors, [], "browser errors at 1024");
    await page.close();
  }
}

// ---------- The landing at one size ----------

async function checkLanding(browser, options) {
  console.log(
    `landing ${options.viewport.width}×${options.viewport.height}, JavaScript ${options.javaScriptEnabled ? "on" : "off"}, motion ${options.reducedMotion}`,
  );
  const { page, errors } = await open(browser, options);
  const js = options.javaScriptEnabled;
  const still = !js || options.reducedMotion === "reduce";
  const wide = options.viewport.width >= 768;

  // First screen.
  assert.equal(
    await page.locator("h1").textContent(),
    HERO.title,
    "the heading",
  );
  assert(await page.locator("h1").isVisible());
  const cta = page.locator(".hero-cta").getByRole("link", {
    name: HERO.primary,
  });
  for (const link of [
    cta,
    page.getByRole("navigation").getByRole("link", { name: "Войти" }),
  ])
    assert(await inView(link), "first screen link outside viewport");
  if (options.viewport.width === 390) {
    const sheet = await rect(page.locator(".sheet"));
    const chat = await rect(page.locator(".chat"));
    assert(sheet.top < chat.top, "390 px: the sheet stands above the chat");
    assert(await inView(page.locator(".sheet .lit")), "the marked line");
    assert(await inView(page.locator(".chat-head")), "the head of the chat");
  }

  // The button of the header (design D10).
  const navCta = page.locator(".nav-cta");
  const shown = () =>
    navCta.evaluate(
      (element) =>
        getComputedStyle(element).visibility === "visible" &&
        getComputedStyle(element).opacity === "1",
    );
  if (js) {
    assert.equal(await shown(), false, "header button while the hero shows");
    await page.evaluate(() => scrollTo({ top: 1600, behavior: "instant" }));
    await page.waitForFunction(() =>
      document.documentElement.classList.contains("cta-away"),
    );
    await page.waitForTimeout(600);
    assert(await shown(), "header button after scrolling");
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  } else {
    assert(await shown(), "header button without JavaScript");
  }

  await cta.click();
  await page.waitForURL(/#beta$/);
  await waitInView(
    page.getByRole("heading", { name: "Попробуйте на своём сценарии" }),
    "the beta form after the button",
  );
  assert.equal(await page.locator("details[open]").count(), 0);

  // Questions about the screenplay (design D5).
  const questions = page.getByRole("region", {
    name: "Спросите о своём сценарии",
  });
  await centre(questions);
  const answer = (index) =>
    questions.getByText(ANSWERS[index].answer, { exact: true });
  assert(await answer(0).isVisible(), "the first answer is open at once");
  const requests = [];
  const onRequest = (request) => requests.push(request.url());
  page.on("request", onRequest);
  for (const [index, { question }] of ANSWERS.entries()) {
    const label = questions.locator("label").filter({ hasText: question });
    if (options.hasTouch) await label.tap();
    else if (index === 0) await label.click();
    else
      await questions
        .getByRole("radio")
        .nth(index - 1)
        .press("ArrowRight");
    const panel = questions.locator(`.ask-panel[data-q="${index + 1}"]`);
    assert(await answer(index).isVisible(), question);
    assert(await panel.locator(".ask-sheet").isVisible(), `${question}: sheet`);
    for (const other of ANSWERS.keys())
      if (other !== index)
        assert.equal(await answer(other).isVisible(), false, question);
    const sheet = await rect(panel.locator(".ask-sheet"));
    const reply = await rect(panel.locator(".ask-answer"));
    if (wide)
      assert(sheet.right <= reply.left, `${question}: sheet left of answer`);
    else assert(sheet.bottom <= reply.top, `${question}: sheet above answer`);
  }
  const shortening = questions.locator('.ask-panel[data-q="3"]');
  assert.deepEqual(
    await shortening.locator("s").allTextContents(),
    ["АНЯ (З.К.)", "Мам, ты опять не спишь?"],
    "the struck reply",
  );
  assert(
    (await shortening.locator("mark").allTextContents()).includes(
      "Чашка давно чистая. Она всё равно трёт её губкой.",
    ),
    "the marked remark",
  );
  page.off("request", onRequest);
  assert.deepEqual(requests, [], "a canned question triggered network traffic");

  // A ready question of the first screen opens its answer (with scripts) or leads to the block (without).
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  const ready = page.locator(".co-q").nth(1);
  if (options.hasTouch) await ready.tap();
  else await ready.press("Enter");
  await page.waitForURL(/#ask$/);
  await waitInView(
    page.getByRole("heading", { name: "Спросите о своём сценарии" }),
    "the questions block after a ready question",
  );
  if (js)
    assert(await answer(1).isVisible(), "a ready question opens its answer");

  // What stands behind one answer (design D6).
  const scene = page.getByRole("region", { name: GARAGE.title });
  const deep = scene.locator(".deep");
  await centre(deep.locator(".layers"));
  for (const layer of await deep.locator(".layer").all()) {
    await centre(layer);
    if (still)
      assert.equal(
        await layer.evaluate((element) => getComputedStyle(element).opacity),
        "1",
        "a layer is hidden without motion",
      );
  }
  if (js && !still) await page.waitForTimeout(1300);
  for (const layer of LAYERS)
    for (const { name } of layer.lit)
      assert(
        await deep.getByText(name, { exact: true }).isVisible(),
        `the lit «${name}»`,
      );
  const lines = deep.locator(".roots path");
  if (wide && js) {
    assert.equal(await lines.count(), LINKS.length, "the lines of the layers");
    const ends = await deep.evaluate((element, links) => {
      const box = element.getBoundingClientRect();
      const node = (key) =>
        element.querySelector(`[data-node="${key}"]`).getBoundingClientRect();
      const paths = [...element.querySelectorAll(".roots path")];
      return links.map(([from, to], index) => {
        const numbers = paths[index]
          .getAttribute("d")
          .match(/-?[\d.]+/g)
          .map(Number);
        const a = node(from);
        const b = node(to);
        return {
          link: `${from}→${to}`,
          start: [numbers[0], numbers[1]],
          end: numbers.slice(-2),
          from: [a.left + a.width / 2 - box.left, a.bottom - box.top],
          to: [b.left + b.width / 2 - box.left, b.top - box.top],
          offset: getComputedStyle(paths[index]).strokeDashoffset,
        };
      });
    }, LINKS);
    for (const end of ends) {
      near(end.start[0], end.from[0], `${end.link} starts at x`);
      near(end.start[1], end.from[1], `${end.link} starts at y`);
      near(end.end[0], end.to[0], `${end.link} ends at x`);
      near(end.end[1], end.to[1], `${end.link} ends at y`);
      assert.equal(end.offset, "0px", `${end.link} is not drawn`);
    }
  } else if (!wide) {
    assert.equal(
      await deep
        .locator(".roots")
        .evaluate((element) => getComputedStyle(element).visibility),
      "hidden",
      "no lines on a phone",
    );
  }
  if (options.viewport.width >= 1024) {
    const widths = await deep
      .locator(".layer")
      .evaluateAll((layers) =>
        layers.map((layer) => layer.getBoundingClientRect().width),
      );
    widths.forEach((width, index) => {
      if (index > 0) assert(width > widths[index - 1], "layers widen");
    });
    near(
      widths.at(-1),
      (await rect(scene.locator(".know-head"))).width,
      "the last layer fills the column",
    );
  }
  if (!wide) {
    const lefts = await deep
      .locator(".layer")
      .evaluateAll((layers) =>
        layers.map((layer) => Math.round(layer.getBoundingClientRect().left)),
      );
    assert.equal(new Set(lefts).size, 1, "layers stand in a column");
  }

  // The brothers: a dialogue, three frames, five notes (design D7–D8).
  const board = scene.locator(".board");
  const talk = board.locator(".talk");
  for (const text of [
    GARAGE.author.map((run) => (typeof run === "string" ? run : run.text)),
    GARAGE.line.text,
  ].flat())
    assert(await talk.getByText(text).first().isVisible(), text);
  const frames = board.locator(".frame-svg");
  assert.equal(await frames.count(), 3, "three frames");
  for (const frame of await frames.all()) {
    await centre(frame);
    if (still)
      assert.equal(
        await frame
          .locator(".f-el")
          .first()
          .evaluate((element) => getComputedStyle(element).opacity),
        "1",
        "a frame is not drawn without motion",
      );
  }
  for (const note of ALL_NOTES) {
    const element = board.locator(`#note-${note.n}`);
    await centre(element);
    assert(
      await element.getByText(note.text, { exact: true }).isVisible(),
      note.title,
    );
  }
  if (js && wide && options.viewport.height >= 600) {
    for (const note of ALL_NOTES) {
      await centre(board.locator(`#note-${note.n}`));
      await page.waitForTimeout(150);
      assert(await inView(talk), "the dialogue stays on screen");
      assert.equal(
        await board.locator(".ph.is-on").getAttribute("data-n"),
        String(note.n),
        `the phrase of «${note.title}» is marked`,
      );
    }
  }
  await centre(talk);
  const gesture = talk.locator('.ph[data-n="4"]');
  if (options.hasTouch) await gesture.tap();
  else await gesture.press("Enter");
  await page.waitForURL(/#note-4$/);
  await waitInView(
    board.getByText(NOTES.quarrel.text, { exact: true }),
    "the note of «рука высунется»",
  );
  const section = await paint(scene);
  for (const neighbour of [
    page.getByRole("region", { name: "Спросите о своём сценарии" }),
    page.locator("#draft-title"),
    page.getByRole("navigation"),
  ]) {
    const other = await paint(neighbour);
    assert.notEqual(section.background, other.background, "section background");
    assert.notEqual(section.color, other.color, "section text");
  }

  // The draft: the card and the arrow end above the sheet of the screen (design D11).
  const picture = page.locator(".shot-pic");
  await centre(picture);
  if (js && !still) await page.waitForTimeout(1600);
  assert(await page.getByText("Тихая вода.fdx").isVisible(), "the file card");
  const tip = await picture.evaluate((element) => {
    const arrow = element.querySelector(".drop-arrow").getBoundingClientRect();
    const image = element.querySelector("img").getBoundingClientRect();
    const frame = element.querySelector(".shot-frame").getBoundingClientRect();
    const style = getComputedStyle(element.querySelector(".drop-arrow"));
    const file = getComputedStyle(element.querySelector(".file"));
    return {
      share: (arrow.right - image.left) / image.width,
      gap: frame.top - arrow.bottom,
      clip: style.clipPath,
      file: file.opacity,
    };
  });
  assert(
    tip.share > 0.26 && tip.share < 0.7,
    `the arrow ends over the sheet: ${tip.share}`,
  );
  assert(
    tip.gap >= 0 && tip.gap <= 12,
    `the arrow ends at the frame: ${tip.gap}`,
  );
  if (still) {
    assert.equal(tip.file, "1", "the file card without motion");
    assert.equal(tip.clip, "none", "the arrow without motion");
  }

  // The team: the letter and the last sentence on the dark card (design D12).
  for (const text of [TEAM_NOTE.opening, ...TEAM_NOTE.paragraphs])
    assert(await page.getByText(text, { exact: true }).isVisible(), text);
  const credo = page.locator(".credo");
  await centre(credo);
  if (js && !still) await page.waitForTimeout(2200);
  assert.equal(
    (await credo.textContent()).trim(),
    TEAM_NOTE.credo,
    "the last sentence",
  );
  assert(
    (
      await credo
        .locator(".w")
        .evaluateAll((words) =>
          words.map((word) => getComputedStyle(word).opacity),
        )
    ).every((opacity) => opacity === "1"),
    "every word of the last sentence is lit",
  );
  const card = await paint(page.locator(".screen"));
  const around = await paint(
    page.getByRole("region", { name: TEAM_NOTE.title }),
  );
  assert.notEqual(card.background, around.background, "card background");
  assert.notEqual(card.color, around.color, "card text");

  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "page overflows horizontally",
  );
  if (still) {
    assert(
      await page
        .locator("[data-reveal]")
        .evaluateAll((nodes) =>
          nodes.every(
            (node) =>
              getComputedStyle(node).opacity === "1" &&
              getComputedStyle(node).transform === "none",
          ),
        ),
      "a block is hidden without motion",
    );
  }
  if (js && !options.hasTouch) {
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
    await page.getByText("Заявка принята", { exact: true }).waitFor();
  }
  assert.deepEqual(errors, [], "browser errors");
  await page.close();
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
try {
  await checkHeroLayouts(browser);
  for (const options of [
    {
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: true,
      hasTouch: false,
      reducedMotion: "no-preference",
    },
    {
      viewport: { width: 918, height: 900 },
      javaScriptEnabled: true,
      hasTouch: false,
      reducedMotion: "no-preference",
    },
    {
      viewport: { width: 918, height: 900 },
      javaScriptEnabled: false,
      hasTouch: false,
      reducedMotion: "no-preference",
    },
    {
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: true,
      hasTouch: true,
      reducedMotion: "reduce",
    },
    {
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
      hasTouch: false,
      reducedMotion: "no-preference",
    },
  ])
    await checkLanding(browser, options);
} finally {
  await browser.close();
}
console.log("site behaviour check passed");
