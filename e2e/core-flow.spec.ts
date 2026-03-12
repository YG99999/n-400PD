import { test, expect } from "@playwright/test";

test("demo user can use chat, review, payment, regenerate, and download through the UI", async ({ page }) => {
  await page.goto("/#/");

  await expect(page.getByTestId("text-brand-name")).toBeVisible();
  await page.getByTestId("button-try-demo").click();

  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.getByTestId("badge-section")).toContainText("Personal Information");
  await expect(page.getByTestId("input-chat")).toBeVisible();

  await page.getByTestId("input-chat").fill("Carlos Eduardo Martinez");
  await page.getByTestId("button-send").click();
  await expect(page.getByText(/date of birth/i)).toBeVisible();

  await page.goto("/#/review");
  await expect(page.getByRole("heading", { name: "Review and Edit" })).toBeVisible();
  await expect(page.getByText("Core applicant data is collected")).toBeVisible();
  await expect(page.getByTestId("button-continue-payment")).toBeDisabled();

  await page.getByTestId("input-email").fill("ui.review.updated@example.com");
  await page.getByTestId("input-email").blur();
  await expect(page.getByTestId("input-email")).toHaveValue("ui.review.updated@example.com");

  await page.getByTestId("button-resume-chat").click();
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.getByText(/review context preserved/i)).toBeVisible();

  await page.goto("/#/review");
  await page.getByTestId("checkbox-review-confirm").click();
  await expect(page.getByTestId("button-continue-payment")).toBeEnabled();
  await page.getByTestId("button-continue-payment").click();

  await expect(page).toHaveURL(/#\/payment$/);
  await expect(page.getByRole("heading", { name: "Complete Payment" })).toBeVisible();
  const paymentResponse = page.waitForResponse((response) =>
    response.url().includes("/api/payment/checkout") && response.request().method() === "POST" && response.ok(),
  );
  await page.getByTestId("button-pay").click();
  await paymentResponse;

  await expect(page.getByRole("heading", { name: /Download and Regenerate/i })).toBeVisible();
  await expect(page.getByTestId("button-download-pdf")).toBeVisible();

  await page.goto("/#/review");
  await expect(page.getByTestId("badge-payment-status")).toHaveText("Paid");
  await page.getByTestId("input-mobile-phone").fill("217-555-0777");
  await page.getByTestId("input-mobile-phone").blur();
  await expect(page.getByText(/PDF needs regeneration/i)).toBeVisible();

  const regenerateResponse = page.waitForResponse((response) =>
    response.url().includes("/api/pdf/generate") && response.request().method() === "POST" && response.ok(),
  );
  await page.getByTestId("button-regenerate-pdf").click();
  await regenerateResponse;
  await expect(page.getByTestId("button-download-pdf")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("button-download-pdf").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename().toLowerCase()).toContain("n-400");
});
