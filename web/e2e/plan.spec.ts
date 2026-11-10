/** M3 gate, iteration 2: the journey works end to end, on a phone viewport and on a desktop. */
import { expect, test, type Page } from "@playwright/test";

const APP = "/?basemap=none"; // no tile requests: the test checks the app, not the tile server

/** On a phone the result is a sheet; open it fully so every control is on screen. */
async function openSheet(page: Page): Promise<void> {
  await expect(page.locator(".ticket")).toBeVisible();
  const sheet = page.locator(".sheet");
  if ((await sheet.count()) === 0) return;
  // One tap per step, waiting for each height: a tap on a full sheet would close it again.
  const order = ["peek", "half", "full"];
  for (let i = 0; i < 2; i++) {
    const now = (await sheet.getAttribute("data-snap")) ?? "peek";
    if (now === "full") return;
    await page.locator(".grab").click();
    await expect(sheet).toHaveAttribute("data-snap", order[order.indexOf(now) + 1]!);
  }
}

async function pickStation(page: Page, label: "From" | "Home", query: string, option: RegExp): Promise<void> {
  const editor = page.locator("section.editor");
  await editor.getByLabel(label, { exact: true }).fill(query);
  await editor.getByRole("option", { name: option }).first().click();
}

async function addPerson(page: Page, name: string, query: string, option: RegExp): Promise<void> {
  await page.getByRole("button", { name: "+ Add person" }).click();
  await page.locator("section.editor").getByLabel("Name").fill(name);
  await pickStation(page, "From", query, option);
  await page.locator("section.editor").getByRole("button", { name: "Done" }).click();
}

async function remove(page: Page, id: string): Promise<void> {
  await page.locator(`[data-person="${id}"]`).click();
  await page.locator(".prow.open").getByRole("button", { name: /^Edit / }).click();
  await page.locator("section.editor").getByRole("button", { name: "Remove" }).click();
}

test("the example group opens on 神田: lines draw in, the seal stamps, five stations rank", async ({ page }) => {
  await page.goto(APP);
  await expect(page.locator(".t-lab")).toHaveText("Meet at");
  await expect(page.locator(".t-name b")).toHaveText("神田");
  await expect(page.locator(".example-tag")).toHaveText("Example group");
  await expect(page.locator(".mk-person")).toHaveCount(2);
  await expect(page.locator(".mk-meet .seal")).not.toHaveClass(/wait/);
  await expect(page.locator(".others li")).toHaveCount(5);
  await expect(page.locator(".t-nums")).toContainText("6 changes"); // why this station: the changes are visible
  await expect(page.locator(".others li").first()).toContainText("6 changes");
  await expect(page.locator("[data-person]")).toHaveCount(2);
  await expect(page.locator(".t-stay")).toHaveText("Everyone can stay until 23:32, Tora's last train home.");
  await expect(page.getByLabel("Meeting ends")).toHaveCount(0); // the app proposes the end; nobody types it
});

test("tapping a person opens their trip and fades everyone else", async ({ page }) => {
  await page.goto(APP);
  await openSheet(page);
  await page.locator('[data-person="p2"]').click();
  await expect(page.locator('[data-person="p2"] .pill')).toHaveCount(0); // open: the rail replaces the pills
  await expect(page.locator(".prow.open .rail li").first()).toContainText("Shibamata");
  await expect(page.locator(".prow.open .rail li").first()).toContainText("Kanamachi");
  await expect(page.locator(".prow.open .rail .tag")).toHaveText(["walk", "through train", "change"]);
  await expect(page.locator(".prow.open .rail li.arrive")).toContainText("Kanda");
  await expect(page.locator(".prow.open .last.first")).toHaveText("Last train home leaves Kanda at 23:32");
  await expect(page.locator(".mk-person.dimmed")).toHaveCount(1);
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.locator(".prow.open .rail li").first()).toContainText("柴又");
  await expect(page.locator(".prow.open .rail .tag")).toHaveText(["徒歩", "直通", "乗り換え"]);
  await expect(page.locator(".mk-person.dimmed")).toHaveCount(1);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.locator('[data-person="p2"]').click();
  await expect(page.locator(".prow.open")).toHaveCount(0);
  await expect(page.locator('[data-person="p2"] .pill')).toHaveText(["Kanamachi", "Joban Local", "Chiyoda", "Yamanote"]);
  await expect(page.locator(".mk-person.dimmed")).toHaveCount(0);
});

test("another station, the slider and a third person each say what changed, and the end follows the place", async ({ page }) => {
  await page.goto(APP);
  await expect(page.locator(".t-name b")).toHaveText("神田");
  await openSheet(page);

  await page.locator(".others li").nth(1).getByRole("button").click();
  await expect(page.locator(".t-lab")).toHaveText("Number 2 of the ranking");
  await expect(page.locator(".t-name b")).toHaveText("日暮里");
  await expect(page.locator(".ticket")).toContainText("6 min less on average than Kanda. Shizuku's trip is 22 min longer, Tora's trip is 34 min shorter and has 2 fewer changes.");

  await page.getByLabel("Efficient to fair").fill("0");
  await expect(page.locator(".t-name b")).toHaveText("日暮里");
  await expect(page.locator(".note")).toHaveText("Efficient: the lowest average, even if one trip gets long.");
  await page.getByLabel("Efficient to fair").fill("50");
  await expect(page.locator(".t-name b")).toHaveText("神田");

  await addPerson(page, "Hitori", "kanazawa-hakkei", /Kanazawa-hakkei/);
  await expect(page.locator(".t-name b")).toHaveText("東京");
  await expect(page.locator(".example-tag")).toHaveCount(0);
  await expect(page.locator(".mk-person")).toHaveCount(3);
  await expect(page.locator(".t-stay")).toHaveText("Everyone can stay until 23:30, Tora's last train home.");

  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.locator(".t-lab")).toHaveText("待ち合わせ");
  await expect(page.locator(".t-stay")).toHaveText("23:30まで大丈夫（Toraの終電）");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});

test("on a phone the sheet drags to the nearest height and the handle works from the keyboard", async ({ page }) => {
  await page.goto(APP);
  await expect(page.locator(".ticket")).toBeVisible();
  const sheet = page.locator(".sheet");
  test.skip((await sheet.count()) === 0, "the desktop layout has a panel, not a sheet");
  await expect(sheet).toHaveAttribute("data-snap", "peek");
  await expect(page.locator(".sheet-rest")).toHaveAttribute("inert", "");
  const box = (await page.locator(".grab").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 30);
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-snap", "half");
  await expect(page.locator(".sheet-rest")).not.toHaveAttribute("inert", "");
  await page.locator(".grab").focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toHaveAttribute("data-snap", "full");
});

test("a plan travels in the link: stations, names and settings", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined }));
  await page.goto(APP);
  await expect(page).toHaveURL(/\/\?basemap=none$/); // the untouched example keeps a clean address
  await openSheet(page);
  await addPerson(page, "Hitori", "kanazawa-hakkei", /Kanazawa-hakkei/);
  await page.locator(".others li").nth(1).getByRole("button").click();
  await expect(page.locator(".t-name b")).toHaveText("大門");
  await expect(page).toHaveURL(/\?basemap=none&p=seiseki-sakuragaoka_Shizuku&p=shibamata_Tora&p=kanazawa-hakkei_Hitori&at=daimon$/);

  await page.getByRole("button", { name: "Share plan" }).click();
  await expect(page.locator(".toast")).toHaveText("Link copied");
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toBe(page.url());

  const friend = await context.newPage();
  await friend.goto(url);
  await expect(friend.locator(".t-name b")).toHaveText("大門");
  await expect(friend.locator(".example-tag")).toHaveText("Shared plan");
  await expect(friend.locator(".mk-person")).toHaveCount(3);
  await expect(friend.locator(".prow .pname")).toHaveText(["Shizuku", "Tora", "Hitori"]);
  await expect(friend.locator(".mk-label")).toContainText(["Shizuku", "Tora", "Hitori"]);
});

test("a person can be added by typing kana or a street address", async ({ page }) => {
  await page.goto(APP);
  await openSheet(page);
  await page.getByRole("button", { name: "+ Add person" }).click();
  const editor = page.locator("section.editor");
  await editor.getByLabel("Name").fill("Hitori");
  await editor.getByLabel("From", { exact: true }).fill("かなざわはっ");
  await editor.getByRole("option", { name: /Kanazawa-hakkei/ }).first().click();
  await editor.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".t-name b")).toHaveText("東京");

  await page.getByRole("button", { name: "+ Add person" }).click();
  await editor.getByLabel("Name").fill("Eri");
  await editor.getByLabel("From", { exact: true }).fill("渋谷区神南1-2-3");
  const address = editor.getByRole("group", { name: "Addresses" }).getByRole("option", { name: /神南一丁目/ });
  await address.click();
  await expect(editor.getByLabel("From", { exact: true })).toHaveValue("東京都渋谷区神南一丁目");
  await expect(editor.locator(".snap")).toContainText(/→ Shibuya · \d+ min/);
  await editor.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".mk-person")).toHaveCount(4);
  await expect(page).toHaveURL(/p=shibuya_Eri/); // the link carries the station, never the address
  expect(page.url()).not.toMatch(/%E7%A5%9E%E5%8D%97/);
});

test("addresses appear on the very first search, while the index loads", async ({ page }) => {
  await page.goto(APP);
  await openSheet(page);
  await page.getByRole("button", { name: "+ Add person" }).click();
  await page.locator("section.editor").getByLabel("From", { exact: true }).fill("中目黒");
  await expect(page.locator("section.editor").getByRole("option", { name: /中目黒一丁目/ })).toBeVisible();
});

test("a link with a station the data does not have says so and keeps the rest", async ({ page }) => {
  await page.goto("/?basemap=none&p=tokyo&p=atlantis&p=ueno");
  await expect(page.locator(".notice")).toHaveText("Some stations in the link are not in the data, so they are left out (1).");
  await expect(page.locator(".mk-person")).toHaveCount(2);
});

test("two friends with the same name still get a plan", async ({ page }) => {
  await page.goto("/?basemap=none&p=tokyo_Aki&p=shinjuku_Aki");
  await expect(page.locator(".ticket")).toBeVisible();
  await expect(page.locator(".notice")).toHaveCount(0);
});

test("a home with no evening train names the person, in their language", async ({ page }) => {
  await page.goto("/?basemap=none&p=tokyo_Aki&p=shinjuku.kazusa-kameyama_Ben");
  await expect(page.getByRole("alert")).toHaveText("No meeting station has a train to Ben's home between 21:00 and 23:00. Pick another home for Ben.");
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.getByRole("alert")).toContainText("Benの帰りの駅");
});

test("fewer than two people asks for more", async ({ page }) => {
  await page.goto(APP);
  await openSheet(page);
  await remove(page, "p1");
  await expect(page.getByText("Add at least two people")).toBeVisible();
});

test("removing someone in the middle renumbers the rows and the map markers together", async ({ page }) => {
  await page.goto(APP);
  await openSheet(page);
  await addPerson(page, "Hitori", "kanazawa-hakkei", /Kanazawa-hakkei/);
  await expect(page.locator(".prow .badge")).toHaveText(["1", "2", "3"]);
  await remove(page, "p2");
  await expect(page.getByRole("button", { name: "+ Add person" })).toBeFocused();
  await expect(page.locator(".prow .badge")).toHaveText(["1", "2"]);
  await expect(page.locator(".mk-badge")).toHaveText(["1", "2"]);
  await addPerson(page, "Celty", "ikebukuro", /Ikebukuro/);
  await expect(page.locator(".prow .badge")).toHaveText(["1", "2", "3"]);
  await expect(page.locator(".mk-person")).toHaveCount(3);
  await expect(page.locator('[data-person="p4"]')).toBeFocused();
});

test("names on the map never cover each other when two people start close together", async ({ page }) => {
  // 神田 and 秋葉原 are 1 km apart. 町田 and 大宮 are far away, so the map zooms out.
  await page.goto(`${APP}&p=kanda_Aki&p=akihabara_Dai&p=machida_Ben&p=omiya_Chie`);
  await expect(page.locator(".mk-person")).toHaveCount(4);
  await expect(page.locator(".mk-meet .seal")).not.toHaveClass(/wait/);
  await page.waitForTimeout(600); // the camera eases to the group for 450 ms
  type Box = { x: number; y: number; width: number; height: number };
  const boxes: Box[] = [];
  for (const label of await page.locator(".mk-label").all()) {
    if (await label.isVisible()) boxes.push((await label.boundingBox())!);
  }
  expect(boxes.length).toBeGreaterThanOrEqual(3);
  const hit = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(hit(a, b)).toBe(false);
});

test("each badge and the seal sit on their own station", async ({ page }) => {
  // Aki and Eri start at the same station, and the efficient end meets where two of them start.
  await page.goto(`${APP}&p=shinjuku_Aki&p=shinjuku_Eri&p=shibuya_Dai&fair=0`);
  await expect(page.locator(".t-name b")).toHaveText("新宿");
  await expect(page.locator(".mk-meet .seal")).not.toHaveClass(/wait/);
  await page.waitForTimeout(600); // the camera eases to the group for 450 ms
  const center = async (selector: string) => {
    const b = (await page.locator(selector).boundingBox())!;
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  };
  const aki = await center('[data-marker="p1"] .mk-badge');
  expect(await center('[data-marker="p2"] .mk-badge')).toEqual(aki);
  expect(await center(".mk-meet .seal")).toEqual(aki);
});

test("a first visit loads the packed data, never the whole route files", async ({ page }) => {
  const urls: string[] = [];
  page.on("response", (r) => urls.push(new URL(r.url()).pathname));
  await page.goto(APP);
  await expect(page.locator(".mk-meet .seal")).not.toHaveClass(/wait/);
  expect(urls.filter((u) => /_routes\.u16$/.test(u))).toEqual([]);
  expect(urls.filter((u) => /\/packed\/routes\/(out|home)\/\d+\.gz$/.test(u)).length).toBeGreaterThanOrEqual(2);
  // Development mode runs the loading effect twice, so count each file once.
  expect(new Set(urls.filter((u) => /\/packed\/[a-z_]+\.u(8|16)\.gz$/.test(u))).size).toBe(5);
  expect(urls.filter((u) => /^\/[a-z_]+\.u(8|16)$/.test(u))).toEqual([]); // no unpacked matrix
});

test("a visitor can clear the example and start their own plan", async ({ page }) => {
  await page.goto(APP);
  await openSheet(page);
  await expect(page.locator(".example-tag")).toHaveText("Example group");
  await page.getByRole("button", { name: "Start your own plan" }).click();
  await expect(page.locator(".example-tag")).toHaveCount(0);
  await expect(page.locator("section.editor").getByLabel("Name")).toBeFocused();
  await expect(page.locator(".prow")).toHaveCount(1);
  await expect(page.getByText("Add at least two people")).toBeVisible();
  await page.locator("section.editor").getByLabel("Name").fill("Mio");
  await pickStation(page, "From", "ueno", /Ueno/);
  await page.locator("section.editor").getByRole("button", { name: "Done" }).click();
  await addPerson(page, "Ren", "machida", /Machida/);
  await expect(page.locator(".t-name b")).not.toHaveText("");
  await expect(page.getByRole("button", { name: "Start your own plan" })).toHaveCount(0); // only on the example
});

test("a slow connection shows a loading screen, not a blank page, until the answer is ready", async ({ page }) => {
  // Hold back the app's code, then the data, as a slow phone connection would.
  await page.route("**/src/main.tsx", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.route("**/meta.json", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.goto(APP);
  const boot = page.locator(".boot");
  await expect(boot).toBeVisible();
  await expect(boot).toContainText("Loading train times");
  await expect(boot).toContainText("時刻データを読み込み中");
  await expect(page.locator(".t-name b")).toHaveText("神田");
  await expect(boot).toHaveCount(0);
});

test("a pencil on each row opens that person's editor, which fits a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(APP);
  await openSheet(page);
  await page.getByRole("button", { name: "Edit Tora" }).click();
  const editor = page.locator("section.editor");
  await expect(editor.getByLabel("Name")).toBeFocused();
  await expect(editor.getByLabel("Name")).toHaveValue("Tora");
  const widest = await editor.evaluate((el) => Math.max(...[...el.querySelectorAll("*")].map((e) => e.getBoundingClientRect().right)));
  expect(widest).toBeLessThanOrEqual(320);
  await editor.getByRole("button", { name: "Done" }).click();
  await expect(page.locator('[data-person="p2"]')).toBeFocused();
});
