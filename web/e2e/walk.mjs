// A new user's first visit on a phone, with a screenshot of each step: node e2e/walk.mjs URL OUT_DIR
// It clears the example, adds three people by kana, by address and by location, shares the plan,
// and opens the link as a friend. Look at the pictures: it checks what a person sees, not values.
import { chromium, devices } from "@playwright/test";

const [url, dir] = process.argv.slice(2);
if (!url || !dir) throw new Error("usage: node e2e/walk.mjs URL OUT_DIR");
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices["Pixel 7"], viewport: { width: 390, height: 844 },
  permissions: ["geolocation", "clipboard-read", "clipboard-write"], geolocation: { latitude: 35.7295, longitude: 139.7109 },
});
const page = await ctx.newPage();
const notes = [];
page.on("pageerror", (e) => notes.push(`page error: ${e}`));
let n = 0;
const shot = async (p, name) => {
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${dir}/${String(++n).padStart(2, "0")}-${name}.png` });
};

const t0 = Date.now();
await page.goto(url);
await shot(page, "first-paint");
await page.waitForSelector(".ticket", { timeout: 30000 });
notes.push(`answer after ${Date.now() - t0} ms`);
await page.waitForTimeout(2500);
await shot(page, "answer");
await page.locator(".ticket").getByRole("button", { name: "Start your own plan" }).tap();
await shot(page, "own-plan");
const editor = page.locator("section.editor");
await editor.getByLabel("Name").fill("Aki");
await editor.getByLabel("From", { exact: true }).fill("しぶや");
await shot(page, "kana-search");
await editor.getByRole("option").first().tap();
await editor.getByRole("button", { name: "Done" }).tap();
await page.getByRole("button", { name: "+ Add person" }).tap();
await editor.getByLabel("Name").fill("Ben");
await editor.getByLabel("From", { exact: true }).fill("西新宿2");
await shot(page, "address-search");
await editor.getByRole("option").first().tap();
await page.locator(".people-head .sub").tap(); // a tap outside closes the editor
await page.getByRole("button", { name: "+ Add person" }).tap();
await editor.getByLabel("Name").fill("Chie");
await editor.getByRole("button", { name: "Use my location" }).tap();
await shot(page, "location");
await editor.getByRole("button", { name: "Done" }).tap();
await shot(page, "three-people");
await page.locator(".ticket").scrollIntoViewIfNeeded();
await page.getByRole("button", { name: "Share plan" }).tap();
await shot(page, "share");
const link = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
notes.push(`shared link: ${link}`);
const friend = await ctx.newPage();
await friend.goto(link || page.url());
await friend.waitForSelector(".ticket", { timeout: 30000 });
await friend.waitForTimeout(2500);
await shot(friend, "friend-opens");
notes.push(`sender: ${await page.locator(".t-name b").textContent()}, friend: ${await friend.locator(".t-name b").textContent()}`);
process.stdout.write(`${notes.join("\n")}\n`);
await browser.close();
