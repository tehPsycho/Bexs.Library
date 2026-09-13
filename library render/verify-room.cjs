const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const origin = "http://localhost:5173";
const screenshotsDir = path.join(process.cwd(), "tmp", "screenshots");
fs.mkdirSync(screenshotsDir, { recursive: true });

const sampleBooks = [
  {
    id: "test-book-1",
    isbn: "9780143127550",
    isbns: ["9780143127550"],
    title: "Station Eleven",
    authors: ["Emily St. John Mandel"],
    publishers: ["Vintage"],
    publishedDate: "2015",
    pageCount: 352,
    subjects: ["Fiction"],
    synopsis: "A traveling Shakespeare troupe moves through a transformed world.",
    coverUrl: "",
    source: "Test",
    addedAt: new Date().toISOString(),
    isRead: true,
    startedDate: "",
    finishedDate: "2026-09-11",
    rating: 4.5,
    review: "",
  },
  {
    id: "test-book-2",
    isbn: "9780385547345",
    isbns: ["9780385547345"],
    title: "Sea of Tranquility",
    authors: ["Emily St. John Mandel"],
    publishers: ["Knopf"],
    publishedDate: "2022",
    pageCount: 272,
    subjects: ["Fiction"],
    synopsis: "A time-bending novel with moon colonies and violin music.",
    coverUrl: "",
    source: "Test",
    addedAt: new Date().toISOString(),
    isRead: false,
    startedDate: "",
    finishedDate: "",
    rating: 0,
    review: "",
  },
];

(async () => {
  const browser = await launchBrowser();
  try {
    await checkViewport(browser, { width: 1440, height: 960 }, "desktop");
    await checkViewport(browser, { width: 390, height: 844 }, "mobile");
  } finally {
    await browser.close();
  }
})();

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch (_error) {
    return chromium.launch({ headless: true });
  }
}

async function newSeededPage(browser, viewport, options = {}) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript((books) => {
    localStorage.setItem("beccas-library:v1", JSON.stringify(books));
    localStorage.setItem("beccas-library:verify", "1");
  }, sampleBooks);
  if (options.mockLookup) {
    await installLookupMock(page);
  }
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForSelector("#exploreMain");
  return page;
}

async function checkViewport(browser, viewport, name) {
  const page = await newSeededPage(browser, viewport);
  await page.screenshot({ path: path.join(screenshotsDir, `${name}-main.png`), fullPage: false });

  const embeddedRoomCount = await page.locator("#libraryRoom").count();
  if (embeddedRoomCount !== 0) throw new Error(`${name} still has the old embedded room`);

  await page.locator("#exploreMain").click();
  await page.waitForSelector("body.exploring");
  await page.waitForTimeout(900);
  const pixelStats = await sampleCanvas(page);
  if (pixelStats.nonBlank < 800 || pixelStats.colors < 8) {
    throw new Error(`${name} explore canvas appears blank: ${JSON.stringify(pixelStats)}`);
  }

  await page.screenshot({ path: path.join(screenshotsDir, `${name}-explore.png`), fullPage: false });
  await walk(page, [["w", 2900]]);
  await page.waitForTimeout(350);
  let shelfPrompt = await page.locator("#explorePrompt").textContent();
  if (!/book|shelf|spine|click|view/i.test(shelfPrompt || "")) {
    throw new Error(`${name} did not reach bookshelf interaction: ${shelfPrompt}`);
  }
  await page.evaluate(() => window.BeccasRoom?.__testPickFirstBook?.());
  await page.waitForTimeout(250);
  shelfPrompt = await page.locator("#explorePrompt").textContent();
  if (name === "desktop" && (await page.locator("#heldBookOverlay.open").count()) !== 0) {
    throw new Error(`Picking up a book should not auto-open the review panel: ${shelfPrompt}`);
  }
  await page.keyboard.press("e");
  await page.waitForTimeout(250);
  if (name === "desktop" && (await page.locator("#heldBookOverlay.open").count()) === 0) {
    throw new Error(`Pressing E did not open the inspect/review panel: ${shelfPrompt}`);
  }
  await page.close();

  const scannerPage = await newSeededPage(browser, viewport, { mockLookup: true });
  await scannerPage.locator("#exploreMain").click();
  await scannerPage.waitForSelector("body.exploring");
  await scannerPage.waitForTimeout(500);
  await walk(scannerPage, [
    ["w", 2200],
    ["d", 1250],
  ]);
  await scannerPage.keyboard.press("e");
  await scannerPage.waitForTimeout(300);
  if ((await scannerPage.locator("#scannerModal.open").count()) === 0) {
    const scannerPrompt = await scannerPage.locator("#explorePrompt").textContent();
    throw new Error(`${name} scanner modal did not open: ${scannerPrompt}`);
  }
  await scannerPage.locator("#exploreIsbn").fill("1111111111");
  await scannerPage.locator("#exploreScanForm button[type='submit']").click();
  await scannerPage.waitForFunction(() => {
    const books = JSON.parse(localStorage.getItem("beccas-library:v1") || "[]");
    return books.length === 3 && books.some((book) => book.title === "The Mocked Library Key");
  });
  await scannerPage.screenshot({ path: path.join(screenshotsDir, `${name}-scanner.png`), fullPage: false });
  console.log(`${name}: ${JSON.stringify(pixelStats)} shelfPrompt="${shelfPrompt}"`);
  await scannerPage.close();
}

async function installLookupMock(page) {
  await page.route("https://openlibrary.org/isbn/1111111111.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        title: "The Mocked Library Key",
        authors: [{ key: "/authors/OL1A" }],
        works: [{ key: "/works/OL1W" }],
        publishers: ["Beccas Press"],
        publish_date: "2026",
        number_of_pages: 321,
        isbn_10: ["1111111111"],
      }),
    }),
  );
  await page.route("https://openlibrary.org/authors/OL1A.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ name: "Becca Reader" }) }),
  );
  await page.route("https://openlibrary.org/works/OL1W.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ description: "A tiny test book for the scanner.", subjects: ["Testing"] }),
    }),
  );
  await page.route("https://www.googleapis.com/books/v1/volumes**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }),
  );
}

async function walk(page, steps) {
  for (const [key, ms] of steps) {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  }
}

async function sampleCanvas(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#exploreCanvas");
    const sample = document.createElement("canvas");
    sample.width = 80;
    sample.height = 50;
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const data = context.getImageData(0, 0, sample.width, sample.height).data;
    let nonBlank = 0;
    const colors = new Set();
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];
      if (a > 0 && (r > 8 || g > 8 || b > 8)) nonBlank += 1;
      colors.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`);
    }
    return { nonBlank, colors: colors.size, width: canvas.clientWidth, height: canvas.clientHeight };
  });
}
