import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

function nodeByLabel(page: Page, label: string) {
  return page.locator(".hardware-node").filter({ has: page.getByText(label, { exact: true }) });
}

test("三层编辑、实时诊断与 RTL 预览", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("System Architecture", { exact: true })).toBeVisible();
  await expect(nodeByLabel(page, "u_mac_core")).toBeVisible();
  await expect(page.getByText("Compile ready", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "打开 u_mac_core" }).click();
  await expect(page.getByText("Module Interface", { exact: true })).toBeVisible();
  await expect(page.getByText("mac_core", { exact: true }).first()).toBeVisible();

  await nodeByLabel(page, "a").click();
  const width = page.getByTestId("property-width");
  await width.fill("7");
  await expect(page.locator(".compile-state")).toContainText("errors");
  await expect(page.getByText("GHDL-E4002").first()).toBeVisible();

  await width.fill("8");
  await expect(page.getByText("Compile ready", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /打开内部结构/ }).click();
  await expect(page.getByText("Module Implementation", { exact: true })).toBeVisible();
  await expect(nodeByLabel(page, "multiply")).toBeVisible();
  await expect(nodeByLabel(page, "accumulator")).toBeVisible();

  await page.getByRole("button", { name: "RTL Preview" }).click();
  await expect(page.locator(".rtl-code")).toContainText("module mac_core");
  await page.screenshot({
    path: path.resolve(import.meta.dirname, "../../build/graphicalhdl-editor.png"),
    fullPage: true,
  });
});
