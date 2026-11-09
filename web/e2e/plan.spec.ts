/** M3 gate: a 5-person scenario works end to end, on a phone viewport and on a desktop. */
import { expect, test, type Page } from "@playwright/test";

const APP = "/?basemap=none"; // no tile requests: the test checks the app, not the tile server

async function pickStation(page: Page, label: "From" | "Home", query: string, option: RegExp): Promise<void> {
  const editor = page.locator("section.editor");
  await editor.getByLabel(label, { exact: true }).fill(query);
  await editor.getByRole("option", { name: option }).first().click();
}

test("the sample group gets a meeting station, routes and a ranking", async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByText("MEET AT")).toBeVisible();
  await expect(page.locator(".result-name b")).not.toBeEmpty();
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(4);
  await expect(page.locator(".mk-start")).toHaveCount(4);
  await expect(page.locator(".mk-meet")).toHaveCount(1);
  await expect(page.locator(".next li")).toHaveCount(5);
});

test("a fifth person, a meeting end, a different pick, fairness and Japanese all work", async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByText("MEET AT")).toBeVisible();

  await page.getByRole("button", { name: "＋ Add person" }).click();
  const editor = page.locator("section.editor");
  await editor.getByLabel("Name").fill("Emi");
  await pickStation(page, "From", "shibuya", /^渋谷 ?Shibuya|^Shibuya/);
  await editor.getByLabel("Home is the same as From").uncheck();
  await pickStation(page, "Home", "funabashi", /Funabashi/);
  await editor.getByRole("button", { name: "Done" }).click();

  const emi = page.getByRole("button", { name: "Edit Emi" });
  await expect(emi).toBeVisible();
  await expect(emi).toContainText(/Shibuya → .* → Funabashi/);
  await expect(emi).toContainText(/\d+ min/);
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(5);
  await expect(page.locator(".mk-start")).toHaveCount(5);

  await page.getByLabel("Meeting ends").fill("23:40");
  await expect(page.locator(".excluded summary")).toContainText(/\d+ stations left out/);

  const second = page.locator(".next li button").nth(1);
  const secondName = (await second.locator(".name").innerText()).split("\n")[0]!.replace(/[A-Za-z].*$/, "").trim();
  await second.click();
  await expect(page.locator(".result-name b")).toHaveText(secondName);

  const before = await page.locator(".stat b").last().innerText();
  await page.getByLabel("Efficient to fair").fill("100");
  await expect(page.locator(".stat b").last()).not.toHaveText("");
  expect(Number(await page.locator(".stat b").last().innerText())).toBeLessThanOrEqual(Number(before) + 0);

  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.getByText("待ち合わせ")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});

test("fewer than two people asks for more", async ({ page }) => {
  await page.goto(APP);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: /^Edit / }).first().click();
    await page.locator("section.editor").getByRole("button", { name: "Remove" }).click();
  }
  await expect(page.getByText("Add at least two people")).toBeVisible();
});
