// Run against a built preview, with SITE_URL and CHROMIUM_PATH set.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { ANSWERS } from "../src/content/demo.ts";
import { GARAGE } from "../src/content/garage.ts";
import { HERO, TEAM_NOTE } from "../src/content/copy.ts";

const { SITE_URL, CHROMIUM_PATH } = process.env;
if (!SITE_URL) throw new Error("Set SITE_URL to the built site preview");
if (!CHROMIUM_PATH)
  throw new Error("Set CHROMIUM_PATH to a Chromium executable");

async function checkLanding(browser, options) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(SITE_URL, { waitUntil: "networkidle" });
  const heading = page.getByRole("heading", { name: HERO.title, exact: true });
  assert(await heading.isVisible());
  const cta = page.getByRole("link", { name: HERO.primary });
  for (const link of [
    cta,
    page.getByRole("navigation").getByRole("link", { name: "Войти" }),
  ]) {
    const box = await link.boundingBox();
    assert(
      box && box.y >= 0 && box.y + box.height <= options.viewport.height,
      "first screen link outside viewport",
    );
  }
  const image = page.getByRole("img", { name: HERO.alt });
  assert(
    await image.evaluate((img) => img.complete && img.naturalWidth > 0),
    "editor picture failed to load",
  );
  await cta.click();
  assert.equal(new URL(page.url()).hash, "#beta");
  assert(
    await page
      .getByRole("heading", { name: "Попробуйте на своём сценарии" })
      .isVisible(),
  );
  assert.equal(await page.locator("details[open]").count(), 0);

  const questions = page.getByRole("region", {
    name: "Спросите о своём сценарии",
  });
  await questions.scrollIntoViewIfNeeded();
  const requests = [];
  const onRequest = (req) => requests.push(req.url());
  page.on("request", onRequest);
  for (const { question, answer } of ANSWERS) {
    const control = questions.locator("summary").filter({ hasText: question });
    await control.press("Enter");
    assert(
      await questions.getByText(answer, { exact: true }).isVisible(),
      question,
    );
    await control.press("Space");
    assert.equal(
      await questions.getByText(answer, { exact: true }).isVisible(),
      false,
    );
  }
  page.off("request", onRequest);
  assert.deepEqual(requests, [], "a canned question triggered network traffic");

  const scene = page.getByRole("region", { name: GARAGE.title });
  const summary = scene.locator("summary");
  const gesture = scene.getByRole("link", { name: GARAGE.gesture });
  const key = scene.locator("#garage-key");
  assert(await scene.getByText(GARAGE.author).isVisible());
  assert(await scene.getByText(GARAGE.line).isVisible());
  assert.equal(await key.isVisible(), false);
  async function followGesture() {
    if (options.hasTouch) await gesture.tap();
    else await gesture.press("Enter");
    await key.waitFor({ state: "visible" });
    assert.equal(
      await key.evaluate((el) => el === document.activeElement),
      true,
    );
    assert.equal(
      await key.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight;
      }),
      true,
      "linked scene note outside viewport",
    );
  }
  await followGesture();
  await summary.press("Enter");
  assert.equal(await key.isVisible(), false);
  await summary.press("Enter");
  for (const note of GARAGE.notes)
    assert(await scene.getByText(note.text, { exact: true }).isVisible());
  await followGesture();
  await summary.press("Space");
  assert.equal(await key.isVisible(), false);
  for (const paragraph of TEAM_NOTE.paragraphs)
    assert(await page.getByText(paragraph, { exact: true }).isVisible());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "page overflows horizontally",
  );
  if (options.reducedMotion === "reduce" || !options.javaScriptEnabled) {
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
    );
  }
  if (options.javaScriptEnabled && !options.hasTouch) {
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
  for (const options of [
    {
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: true,
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
