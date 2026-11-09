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

test("the example group opens on 神保町: lines draw in, the seal stamps, five stations rank", async ({ page }) => {
  await page.goto(APP);
  await expect(page.locator(".t-lab")).toHaveText("Meet at");
  await expect(page.locator(".t-name b")).toHaveText("神保町");
  await expect(page.locator(".pill")).toHaveText("Example group");
  await expect(page.locator(".mk-person")).toHaveCount(2);
  await expect(page.locator(".mk-meet .seal")).not.toHaveClass(/wait/);
  await expect(page.locator(".others li")).toHaveCount(5);
  await expect(page.locator("[data-person]")).toHaveCount(2);
});

test("tapping a person opens their trip and fades everyone else", async ({ page }) => {
  await page.goto(APP);
  await openSheet(page);
  await page.locator('[data-person="p2"]').click();
  await expect(page.locator(".prow.open .itin li").first()).toHaveText("Board the Kanamachi Line at Shibamata");
  await expect(page.locator(".prow.open .itin")).toContainText("Get off at Jimbocho");
  await expect(page.locator(".mk-person.dimmed")).toHaveCount(1);
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.locator(".prow.open .itin li").first()).toHaveText("柴又で金町線に乗る");
  await expect(page.locator(".mk-person.dimmed")).toHaveCount(1);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.locator('[data-person="p2"]').click();
  await expect(page.locator(".prow.open")).toHaveCount(0);
  await expect(page.locator(".mk-person.dimmed")).toHaveCount(0);
});

test("another station, the slider, a third person and a meeting end each say what changed", async ({ page }) => {
  await page.goto(APP);
  await expect(page.locator(".t-name b")).toHaveText("神保町");
  await openSheet(page);

  await page.locator(".others li").nth(1).getByRole("button").click();
  await expect(page.locator(".t-lab")).toHaveText("Number 2 of the ranking");
  await expect(page.locator(".t-name b")).toHaveText("九段下");
  await expect(page.locator(".ticket")).toContainText("Same average as Jimbocho. Shizuku's trip is 3 min shorter, Tora's trip is 3 min longer.");

  await page.getByLabel("Efficient to fair").fill("0");
  await expect(page.locator(".t-name b")).toHaveText("日暮里");
  await expect(page.locator(".note")).toHaveText("Efficient: the lowest average, even if one trip gets long.");
  await page.getByLabel("Efficient to fair").fill("50");
  await expect(page.locator(".t-name b")).toHaveText("神保町");

  await addPerson(page, "Hitori", "kanazawa-hakkei", /Kanazawa-hakkei/);
  await expect(page.locator(".t-name b")).toHaveText("品川");
  await expect(page.locator(".pill")).toHaveCount(0);
  await expect(page.locator(".mk-person")).toHaveCount(3);

  await page.getByLabel("Meeting ends").fill("23:30");
  await expect(page.locator(".t-name b")).toHaveText("東京");
  await expect(page.locator(".ticket")).toContainText("Shinagawa would be first, but someone cannot get home from it.");
  await expect(page.locator(".ticket")).toContainText("Tora's last train home leaves Shinagawa at 23:18.");
  await expect(page.locator(".mk-gone")).toHaveCount(1);

  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.locator(".t-lab")).toHaveText("待ち合わせ");
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
