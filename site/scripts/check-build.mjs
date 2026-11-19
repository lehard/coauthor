// Checks of the built site against openspec/specs/web/site: files, text without JavaScript, metadata,
// links, no placeholders and no values of the repository .env except the two settings of the build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { EPIGRAPH, FAQ, HERO, TEAM_NOTE } from "../src/content/copy.ts";
import { ANSWER_CAPTION, ANSWERS } from "../src/content/demo.ts";
import { FRAMES, GARAGE, NOTES } from "../src/content/garage.ts";
import { LAYERS, TIP } from "../src/content/layers.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const problems = [];
const fail = (message) => problems.push(message);
const read = (file) => fs.readFileSync(path.join(dist, file), "utf8");

for (const file of [
  "index.html",
  "privacy/index.html",
  "legal/offer/index.html",
  "legal/privacy/index.html",
  "pricing/index.html",
  "404.html",
  "sitemap.xml",
  "robots.txt",
  "og.jpg",
  // Page icons and the mark (openspec/specs/web/brand).
  "favicon.svg",
  "favicon.ico",
  "apple-touch-icon.png",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "brand-mark.svg",
]) {
  if (!fs.existsSync(path.join(dist, file))) fail(`missing ${file}`);
}

// Every built page links the page icons (openspec/specs/web/brand, «Значки страницы сайта»).
const ICON_LINKS = [
  'href="/favicon.svg"',
  'href="/favicon.ico"',
  'href="/apple-touch-icon.png"',
  'href="/manifest.webmanifest"',
];
const htmlPages = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlPages(full);
    return entry.name.endsWith(".html") ? [full] : [];
  });
for (const page of htmlPages(dist)) {
  const html = fs.readFileSync(page, "utf8");
  for (const link of ICON_LINKS) {
    if (!html.includes(link))
      fail(`${path.relative(dist, page)} has no icon link ${link}`);
  }
}
if (problems.length === 0) {
  const home = read("index.html");
  const privacy = read("privacy/index.html");
  const notFound = read("404.html");
  const origin = /<meta property="og:url" content="([^"]+)\/"/.exec(home)?.[1];
  if (!origin) throw new Error("index.html has no og:url");

  // The main page of the second version (openspec/specs/web/site): structure, not exact wording,
  // because the texts change without OpenSpec.
  for (const text of ["Хочу в бету", "Войти"]) {
    if (!home.includes(text))
      fail(`index.html has no text «${text}» without JavaScript`);
  }
  const section = (id) => {
    const pattern = new RegExp(
      `<section[^>]*aria-labelledby="${id}"[\\s\\S]*?</section>`,
    );
    const match = pattern.exec(home);
    if (!match) throw new Error(`index.html has no section ${id}`);
    return match[0];
  };
  const blocks = [
    "hero-title",
    "sandbox-title",
    "story-approach-title",
    "draft-title",
    "team-note-title",
    "beta-title",
    "faq-title",
  ];
  const order = blocks.map((id) => home.indexOf(section(id)));
  if (order.some((offset, index) => index > 0 && offset <= order[index - 1]))
    fail("home sections are out of order");
  function requireText(id, texts) {
    const text = section(id).replaceAll(/<[^>]+>/g, "");
    for (const phrase of texts) {
      if (!text.includes(phrase)) fail(id + " is missing " + phrase);
    }
  }
  // The first screen only names the product (design D4): the editor drawn in HTML, no screenshot of a suggestion.
  const questions = ANSWERS.map(({ question }) => question);
  requireText("hero-title", [
    HERO.title,
    HERO.lead,
    HERO.primary,
    HERO.note,
    HERO.caption,
    ...questions,
  ]);
  const hero = section("hero-title");
  if (!hero.includes('href="#beta"')) fail("the hero needs the beta link");
  if (hero.split('href="#ask"').length - 1 !== ANSWERS.length)
    fail("each ready question of the hero must link to the questions block");
  if (hero.includes("suggestion")) fail("the hero still shows the suggestion");
  requireText("sandbox-title", [
    ...ANSWERS.flatMap(({ question, answer }) => [question, answer]),
    ANSWER_CAPTION,
  ]);
  const flat = (runs) =>
    runs.map((run) => (typeof run === "string" ? run : run.text)).join("");
  requireText("story-approach-title", [
    GARAGE.title,
    GARAGE.lead,
    TIP.title,
    TIP.question,
    TIP.answer,
    ANSWER_CAPTION,
    TIP.summary,
    ...LAYERS.flatMap((layer) => [
      layer.name,
      ...layer.left,
      ...layer.lit.map(({ name }) => name),
      ...layer.right,
    ]),
    GARAGE.next,
    GARAGE.label,
    flat(GARAGE.author),
    flat(GARAGE.reply),
    GARAGE.line.text,
    GARAGE.storyTitle,
    ...[NOTES.start, NOTES.quarrel, ...NOTES.reasons].flatMap((note) => [
      note.title,
      note.text,
    ]),
    GARAGE.caption,
  ]);
  const story = section("story-approach-title");
  for (const description of Object.values(FRAMES)) {
    if (!story.includes(`aria-label="${description}"`))
      fail(`a frame of the storyboard has no description «${description}»`);
  }
  if (/<details|<summary|type="radio"/.test(story))
    fail(
      "the knowledge block must not hide its notes behind a disclosure or a switch",
    );
  for (const id of ["sandbox-title", "story-approach-title"]) {
    if (section(id).includes("<details"))
      fail(`${id} must not use disclosures`);
  }
  if (/Story Architecture Framework|\bSAF\b/.test(home))
    fail("the main page names the framework of the layers");
  requireText("team-note-title", [
    TEAM_NOTE.title,
    TEAM_NOTE.opening,
    ...TEAM_NOTE.paragraphs,
    TEAM_NOTE.credo,
    EPIGRAPH.quote,
    EPIGRAPH.author,
  ]);
  requireText("draft-title", [
    "Экран беты. Сценарий «Тихая вода» в редакторе.",
    "Тихая вода.fdx",
  ]);
  requireText("draft-title", ["Fountain", "FDX", "STARC", "DOCX", "TXT"]);
  requireText(
    "faq-title",
    FAQ.items.flatMap(({ q, a }) => [q, a]),
  );
  if (section("faq-title").split("<summary").length - 1 !== FAQ.items.length)
    fail("each FAQ item must have a disclosure");
  if (/концепт|22 этап/iu.test(home)) fail("retired terminology in index.html");

  // Budget of the scripts the main page loads (≤ 120 KB gzip).
  const scripts = [
    ...home.matchAll(/<script[^>]+src="([^"]+\.js)"/g),
    ...home.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g),
  ].map((match) => match[1]);
  if (scripts.length === 0) fail("index.html loads no scripts");
  const gzipped = scripts.reduce(
    (sum, src) => sum + gzipSync(fs.readFileSync(path.join(dist, src))).length,
    0,
  );
  if (gzipped > 120 * 1024)
    fail(
      `the scripts of the main page weigh ${(gzipped / 1024).toFixed(1)} KB gzip, more than 120 KB`,
    );

  // Every image the pages reference exists.
  for (const [file, html] of [
    ["index.html", home],
    ["privacy/index.html", privacy],
  ]) {
    const refs = [
      ...html.matchAll(/(?:src|href)="(\/(?:shots|concept)\/[^"]+)"/g),
      ...[...html.matchAll(/srcset="([^"]+)"/gi)].flatMap((match) =>
        match[1].split(",").map((part) => [null, part.trim().split(" ")[0]]),
      ),
    ].map((match) => match[1]);
    for (const ref of refs) {
      if (ref.startsWith("/") && !fs.existsSync(path.join(dist, ref)))
        fail(`${file} references a missing file ${ref}`);
    }
  }
  console.log(`main page scripts: ${(gzipped / 1024).toFixed(1)} KB gzip`);
  if (!home.includes(`<link rel="canonical" href="${origin}/" />`))
    fail("index.html: canonical is not the origin");
  if (!privacy.includes(`<link rel="canonical" href="${origin}/privacy/" />`))
    fail("privacy: canonical is wrong");
  if (
    !privacy.includes(`<meta property="og:url" content="${origin}/privacy/" />`)
  )
    fail("privacy: og:url is wrong");
  const title = (html, file) => {
    const match = /<title>([^<]+)<\/title>/.exec(html);
    if (!match) throw new Error(file + " has no title");
    return match[1];
  };
  if (title(home, "index.html") === title(privacy, "privacy/index.html"))
    fail("the titles of the home page and the policy must differ");
  if (!notFound.includes('<meta name="robots" content="noindex" />'))
    fail("404.html is not noindex");
  const GLAVAI_CREDIT =
    "https://glavai.ru/cases/soavtor-landing\\?utm_source=soavtor&amp;utm_medium=credit";
  // The documents of the service (openspec/specs/web/site, «Документы сервиса», «Документы в подвале»).
  const DOCUMENTS = [
    ["/legal/offer/", "legal/offer/index.html", "offer.md"],
    ["/legal/privacy/", "legal/privacy/index.html", "privacy.md"],
    ["/pricing/", "pricing/index.html", "pricing.md"],
  ];
  const documents = DOCUMENTS.map(([url, file, source]) => [
    url,
    file,
    source,
    read(file),
  ]);
  const pages = [
    ["index.html", home],
    ["privacy/index.html", privacy],
    ["404.html", notFound],
    ...documents.map(([, file, , html]) => [file, html]),
  ];
  for (const [file, html] of pages) {
    const match = /<footer[\s\S]*?<\/footer>/.exec(html);
    if (!match) throw new Error(file + " has no footer");
    const footer = match[0];
    if (!html.includes('<html lang="ru"')) fail(`${file}: lang is not ru`);
    for (const [url] of DOCUMENTS) {
      if (!footer.includes(`href="${url}"`))
        fail(`${file}: the footer has no link to ${url}`);
    }
    if (footer.includes('href="/privacy/"'))
      fail(`${file}: the footer links the policy of the beta request`);
    // The credit of the studio (openspec/specs/web/site, «Подпись ГлавAI в подвале»).
    const credit = new RegExp(`<a[^>]*href="${GLAVAI_CREDIT}"[^>]*>`).exec(
      footer,
    );
    if (!credit) fail(`${file}: the footer has no credit link to glavai.ru`);
    else if (!credit[0].includes('target="_blank"'))
      fail(`${file}: the credit link does not open in a new tab`);
    if (!footer.includes("Продукт и сайт сделаны в"))
      fail(`${file}: the footer has no credit line`);
  }
  if (!home.includes('href="/privacy/"'))
    fail("index.html: the consent of the form has no link to /privacy/");
  const sitemap = read("sitemap.xml");
  const pageUrls = new Set([
    ...[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
      match[1].slice(origin.length),
    ),
  ]);
  for (const [url, file, source, html] of documents) {
    if (!html.includes(`<link rel="canonical" href="${origin}${url}" />`))
      fail(`${file}: canonical is wrong`);
    if (!html.includes(`<meta property="og:url" content="${origin}${url}" />`))
      fail(`${file}: og:url is wrong`);
    if (!/<h1[^>]*>[^<]+<\/h1>/.test(html)) fail(`${file}: no heading`);
    if (
      title(html, file) === title(home, "index.html") ||
      title(html, file) === title(privacy, "privacy/index.html")
    )
      fail(`${file}: the title repeats another page`);
    // Links of a document to the product domain must lead to pages of the site (design D6). Only links of
    // the text (<a>): canonical and og:url of the page start with the origin of the build and have their own checks.
    for (const match of html.matchAll(
      /<a[^>]+href="(https:\/\/soavtor\.app[^"]*)"/g,
    ))
      fail(`${file}: a link to ${match[1]} was not made local`);
    for (const match of html.matchAll(/<a[^>]+href="(\/[^"#]*)/g)) {
      if (!pageUrls.has(match[1]))
        fail(`${file}: a link to ${match[1]}, which is not a page of the site`);
    }
    // Every numbered point (7.1., 7.2., …) is a paragraph of its own, not glued to the previous one.
    for (const match of html.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
      // Glued lines keep their line break; a reference such as «раздел 7.5.» inside a sentence does not.
      if (Array.from(match[1].matchAll(/(?:^|\n)\d+\.\d+\.\s/g)).length > 1)
        fail(
          `${file}: numbered points share a paragraph; separate them with an empty line in docs/legal/${source}`,
        );
    }
    if (source === "privacy.md" || source === "pricing.md") {
      if (!html.includes("<table"))
        fail(`${file}: the tables of docs/legal/${source} are not rendered`);
    }
  }
  if (!documents[0][3].includes('id="materials"'))
    fail("legal/offer/index.html has no anchor #materials");
  if (
    title(privacy, "privacy/index.html") ===
    title(documents[1][3], documents[1][1])
  )
    fail("the titles of /privacy/ and /legal/privacy/ must differ");
  if (!/заявк/.test(title(privacy, "privacy/index.html")))
    fail("the title of /privacy/ must name the beta request");
  for (const loc of [
    `${origin}/`,
    `${origin}/privacy/`,
    ...DOCUMENTS.map(([url]) => `${origin}${url}`),
  ]) {
    if (!sitemap.includes(`<loc>${loc}</loc>`))
      fail(`sitemap.xml has no ${loc}`);
  }
  if (!read("robots.txt").includes(`Sitemap: ${origin}/sitemap.xml`))
    fail("robots.txt does not point to sitemap.xml");

  // Placeholders and secrets in any built text file.
  const envPath = path.join(root, "..", ".env");
  const secrets = [];
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)=(.+)$/.exec(line.trim());
      if (
        match &&
        !["SITE_ORIGIN", "SITE_APP_URL"].includes(match[1]) &&
        match[2].length >= 12
      )
        secrets.push(match[2]);
    }
  }
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  for (const file of walk(dist).filter((name) =>
    /\.(html|js|css|xml|txt)$/.test(name),
  )) {
    const text = fs.readFileSync(file, "utf8");
    const relative = path.relative(dist, file);
    if (text.includes("{{"))
      fail(`${relative} has a placeholder {{…}}: fill it before the build`);
    if (secrets.some((secret) => text.includes(secret)))
      fail(`${relative} contains a value of the repository .env`);
  }
}

// The sources of the documents of the service (openspec/specs/web/site, «Документы без заглушек»; design D7):
// no placeholder in square brackets except a Markdown link, no draft mark, a real date of the edition.
const MONTHS =
  "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря";
const EDITION = new RegExp(
  `^Редакция от (\\d{2}\\.\\d{2}\\.\\d{4}|\\d{1,2} (${MONTHS}) \\d{4} года)\\.`,
  "m",
);
for (const name of ["offer.md", "privacy.md", "pricing.md"]) {
  const source = `docs/legal/${name}`;
  const text = fs.readFileSync(path.join(root, "..", source), "utf8");
  for (const match of text.matchAll(/\[[^\]\n]*\](?!\()/g))
    fail(`${source} has a placeholder ${match[0]}: fill it before the build`);
  if (text.includes("ЧЕРНОВИК")) fail(`${source} is marked ЧЕРНОВИК`);
  if (!EDITION.test(text))
    fail(`${source} has no line «Редакция от <date>.» with a real date`);
}

if (problems.length > 0) {
  console.error(`site build check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("site build check passed");
