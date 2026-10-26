import { test, expect } from '@playwright/test';

const LEGACY_STORIES = [
  'Ví dụ/Nến với annotation (CandleStickChartWithAnnotation)',
  'Ví dụ/Nến với MACD (CandleStickChartWithMACDIndicator)',
  'Ví dụ/Nến với RSI và Bollinger (CandleStickChartWithRSIIndicator)',
  'Ví dụ/Nến và khối lượng (CandleStickStockScaleChartWithVolumeBarV3)',
  'Ví dụ/Nến với tải thêm lịch sử (CandleStickChartPanToLoadMore)',
  'Ví dụ/Volume profile (VolumeProfileChart)',
];

const WIDGET_STORIES = [
  'Widget/VNInvestCharts/Default',
  'Widget/VNInvestCharts/ForkRuntime',
  'Widget/VNInvestCharts/DarkTheme',
  'Widget/VNInvestCharts/WithDrawings',
  'Widget/VNInvestCharts/EnglishLocale',
];

const UNIFIED_HEADER_STORIES = [
  'Widget/UnifiedHeader/Default',
  'Widget/UnifiedHeader/Compact',
  'Widget/UnifiedHeader/Expanded',
  'Widget/UnifiedHeader/EnglishLocale',
  'Widget/UnifiedHeader/DarkTheme',
  'Widget/UnifiedHeader/WithAllSyncEnabled',
  'Widget/UnifiedHeader/WithAllSyncDisabled',
];

test.describe('Storybook Visual Regression - Legacy Charts', () => {
  for (const storyTitle of LEGACY_STORIES) {
    test(`Story: ${storyTitle}`, async ({ page }) => {
      await page.goto(`/?path=/story/${encodeURIComponent(storyTitle)}`);
      await page.waitForSelector('canvas, svg', { timeout: 10000 });
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot(`${storyTitle.replace(/[^a-zA-Z0-9]/g, '-')}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});

test.describe('Storybook Visual Regression - Widget', () => {
  for (const storyTitle of WIDGET_STORIES) {
    test(`Widget: ${storyTitle}`, async ({ page }) => {
      await page.goto(`/?path=/story/${encodeURIComponent(storyTitle)}`);
      await page.waitForSelector('[data-testid="vninvest-charts"], canvas, svg', { timeout: 15000 });
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot(`${storyTitle.replace(/[^a-zA-Z0-9]/g, '-')}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});

test.describe('Storybook Visual Regression - UnifiedHeader', () => {
  for (const storyTitle of UNIFIED_HEADER_STORIES) {
    test(`UnifiedHeader: ${storyTitle}`, async ({ page }) => {
      await page.goto(`/?path=/story/${encodeURIComponent(storyTitle)}`);
      await page.waitForSelector('[data-testid="unified-header"], .unified-header', { timeout: 10000 });
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot(`${storyTitle.replace(/[^a-zA-Z0-9]/g, '-')}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});

test.describe('Widget Interactive States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?path=/story/Widget-VNInvestCharts-Default');
    await page.waitForSelector('[data-testid="vninvest-charts"], canvas', { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test('Default widget state', async ({ page }) => {
    await expect(page.locator('canvas').first()).toHaveScreenshot('widget-default.png');
  });

  test('Widget crosshair hover', async ({ page }) => {
    const canvas = page.locator('canvas').first();
    await canvas.hover({ position: { x: 600, y: 300 } });
    await page.waitForTimeout(300);
    await expect(canvas).toHaveScreenshot('widget-crosshair.png');
  });
});

test.describe('UnifiedHeader Interactive States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?path=/story/Widget-UnifiedHeader-Default');
    await page.waitForSelector('[data-testid="unified-header"], .unified-header', { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('Default header state', async ({ page }) => {
    await expect(page.locator('[data-testid="unified-header"], .unified-header').first()).toHaveScreenshot('unified-header-default.png');
  });

  test('Header with symbol dropdown open', async ({ page }) => {
    const header = page.locator('[data-testid="unified-header"], .unified-header').first();
    const symbolButton = header.locator('button[aria-label*="symbol"], button[aria-label*="Symbol"]').first();
    if (await symbolButton.isVisible()) {
      await symbolButton.click();
      await page.waitForTimeout(300);
      await expect(header).toHaveScreenshot('unified-header-symbol-dropdown.png');
    }
  });

  test('Header with timeframe dropdown open', async ({ page }) => {
    const header = page.locator('[data-testid="unified-header"], .unified-header').first();
    const timeframeButton = header.locator('button[aria-label*="timeframe"], button[aria-label*="Timeframe"]').first();
    if (await timeframeButton.isVisible()) {
      await timeframeButton.click();
      await page.waitForTimeout(300);
      await expect(header).toHaveScreenshot('unified-header-timeframe-dropdown.png');
    }
  });

  test('Header with chart type dropdown open', async ({ page }) => {
    const header = page.locator('[data-testid="unified-header"], .unified-header').first();
    const chartTypeButton = header.locator('button[aria-label*="chart"], button[aria-label*="Chart"]').first();
    if (await chartTypeButton.isVisible()) {
      await chartTypeButton.click();
      await page.waitForTimeout(300);
      await expect(header).toHaveScreenshot('unified-header-charttype-dropdown.png');
    }
  });

  test('Header sync toggles', async ({ page }) => {
    const header = page.locator('[data-testid="unified-header"], .unified-header').first();
    const syncButtons = header.locator('button[aria-label*="sync"], button[aria-label*="Sync"]');
    const count = await syncButtons.count();
    if (count > 0) {
      await syncButtons.first().click();
      await page.waitForTimeout(300);
      await expect(header).toHaveScreenshot('unified-header-sync-toggled.png');
    }
  });
});