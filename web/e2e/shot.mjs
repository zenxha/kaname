// Ad-hoc screenshots during development: node e2e/shot.mjs URL OUT.png WIDTH HEIGHT
import { chromium } from "@playwright/test";
const [url, out, w, h] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url);
await page.waitForSelector(".ticket, .notice, .notice-page", { timeout: 30000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: out, fullPage: Number(w) < 700 });
console.log(JSON.stringify({ errors }));
await browser.close();
