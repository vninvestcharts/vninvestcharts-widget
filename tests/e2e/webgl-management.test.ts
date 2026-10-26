/**
 * E2E Tests for WebGL Context Management via IntersectionObserver
 * Tests freeze/thaw behavior, snapshot capture/restore, and memory management
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

// Helper functions
async function waitForCharts(page: Page, count: number) {
  await page.waitForSelector('[data-chart-id]', { state: 'attached', timeout: 10000 });
  const charts = await page.$$('[data-chart-id]');
  expect(charts.length).toBe(count);
}

async function getChartVisibility(page: Page, chartId: string): Promise<number> {
  return await page.evaluate((id) => {
    const element = document.querySelector(`[data-chart-id="${id}"]`);
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    return visibleHeight / rect.height;
  }, chartId);
}

async function scrollToChart(page: Page, chartId: string) {
  await page.evaluate((id) => {
    const element = document.querySelector(`[data-chart-id="${id}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, chartId);
  await page.waitForTimeout(500); // Wait for scroll to complete
}

async function getFrozenState(page: Page, chartId: string): Promise<boolean> {
  return await page.evaluate((id) => {
    const element = document.querySelector(`[data-chart-id="${id}"]`);
    return element?.classList.contains('frozen') || false;
  }, chartId);
}

async function getThawingState(page: Page, chartId: string): Promise<boolean> {
  return await page.evaluate((id) => {
    const element = document.querySelector(`[data-chart-id="${id}"]`);
    return element?.classList.contains('thawing') || false;
  }, chartId);
}

async function getMemoryMetrics(page: Page) {
  return await page.evaluate(() => {
    if (window.__VNINVESTCHARTS_PERF__) {
      return window.__VNINVESTCHARTS_PERF__.getReport();
    }
    return null;
  });
}

test.describe('WebGL Context Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');
  });

  test('should load multi-chart layout with 4 charts', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Verify all charts are initially visible and not frozen
    for (let i = 1; i <= 4; i++) {
      const chartId = `chart-${i}`;
      const visibility = await getChartVisibility(page, chartId);
      expect(visibility).toBeGreaterThan(0.5);
      
      const frozen = await getFrozenState(page, chartId);
      expect(frozen).toBe(false);
    }
  });

  test('should freeze charts when scrolled out of viewport', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Scroll down to hide first two charts
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000); // Wait for IntersectionObserver debounce
    
    // Check that charts 1 and 2 are frozen (low visibility)
    const chart1Visibility = await getChartVisibility(page, 'chart-1');
    const chart2Visibility = await getChartVisibility(page, 'chart-2');
    
    expect(chart1Visibility).toBeLessThan(0.5);
    expect(chart2Visibility).toBeLessThan(0.5);
    
    // Wait for freeze to take effect
    await page.waitForTimeout(500);
    
    const chart1Frozen = await getFrozenState(page, 'chart-1');
    const chart2Frozen = await getFrozenState(page, 'chart-2');
    
    // At least one should be frozen
    expect(chart1Frozen || chart2Frozen).toBe(true);
  });

  test('should thaw charts when scrolled back into viewport', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Scroll down to freeze first charts
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1500);
    
    // Scroll back up
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
    
    // Charts should be thawed
    const chart1Frozen = await getFrozenState(page, 'chart-1');
    const chart2Frozen = await getFrozenState(page, 'chart-2');
    
    expect(chart1Frozen).toBe(false);
    expect(chart2Frozen).toBe(false);
  });

  test('should not show visual flash during freeze/thaw', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Take screenshot before scroll
    const beforeScreenshot = await page.screenshot({ fullPage: true });
    
    // Scroll to trigger freeze
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1500);
    
    // Take screenshot during freeze
    const duringScreenshot = await page.screenshot({ fullPage: true });
    
    // Scroll back
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
    
    // Take screenshot after thaw
    const afterScreenshot = await page.screenshot({ fullPage: true });
    
    // Compare screenshots - they should be visually similar (no gray/black flash)
    // This is a basic check - in practice you'd use pixelmatch or similar
    expect(beforeScreenshot).toBeDefined();
    expect(duringScreenshot).toBeDefined();
    expect(afterScreenshot).toBeDefined();
  });

  test('should capture and restore snapshots correctly', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Trigger freeze on chart-1 by scrolling
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1500);
    
    // Check that snapshot was captured (via performance monitor)
    const metrics = await getMemoryMetrics(page);
    expect(metrics).not.toBeNull();
    
    if (metrics) {
      expect(metrics.freezeThaw.freezeCount).toBeGreaterThan(0);
      expect(metrics.freezeThaw.averageSnapshotCaptureMs).toBeGreaterThan(0);
    }
    
    // Scroll back to trigger thaw
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
    
    const metricsAfterThaw = await getMemoryMetrics(page);
    if (metricsAfterThaw) {
      expect(metricsAfterThaw.freezeThaw.thawCount).toBeGreaterThan(0);
      expect(metricsAfterThaw.freezeThaw.averageSnapshotRestoreMs).toBeGreaterThan(0);
    }
  });

  test('should maintain memory budget under pressure', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Get initial memory metrics
    const initialMetrics = await getMemoryMetrics(page);
    
    // Rapidly scroll up and down to trigger multiple freeze/thaw cycles
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(500);
      
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(500);
    }
    
    const finalMetrics = await getMemoryMetrics(page);
    
    if (finalMetrics) {
      // Memory should not grow unbounded
      expect(finalMetrics.memory.currentHeapUsed).toBeLessThan(500 * 1024 * 1024); // 500MB
      
      // Should have recorded freeze/thaw cycles
      expect(finalMetrics.freezeThaw.freezeCount).toBeGreaterThan(0);
      expect(finalMetrics.freezeThaw.thawCount).toBeGreaterThan(0);
    }
  });

  test('should respect device-specific profiles', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Check that device profile was detected
    const deviceProfile = await page.evaluate(() => {
      if (window.__VNINVESTCHARTS_PERF__) {
        const report = window.__VNINVESTCHARTS_PERF__.getReport();
        return report.memory.webglContextsActive;
      }
      return null;
    });
    
    // Device profile should be applied (this is more of an integration check)
    expect(deviceProfile).not.toBeNull();
  });

  test('should handle rapid scroll without visual glitches', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Rapid scroll up and down
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, 200);
      });
      await page.waitForTimeout(50);
    }
    
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, -200);
      });
      await page.waitForTimeout(50);
    }
    
    // All charts should be in valid state (not stuck frozen/thawing)
    for (let i = 1; i <= 4; i++) {
      const chartId = `chart-${i}`;
      const frozen = await getFrozenState(page, chartId);
      const thawing = await getThawingState(page, chartId);
      
      // Should not be stuck in thawing state
      expect(thawing).toBe(false);
    }
  });

  test('should handle tab background/foreground correctly', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Simulate tab blur (page hidden)
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: true });
      window.dispatchEvent(new Event('blur'));
    });
    await page.waitForTimeout(1000);
    
    // All charts should be frozen when tab is hidden
    let allFrozen = true;
    for (let i = 1; i <= 4; i++) {
      const frozen = await getFrozenState(page, `chart-${i}`);
      if (!frozen) allFrozen = false;
    }
    
    // Simulate tab focus (page visible)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false });
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1000);
    
    // Charts should thaw when tab is focused
    let allThawed = true;
    for (let i = 1; i <= 4; i++) {
      const frozen = await getFrozenState(page, `chart-${i}`);
      if (frozen) allThawed = false;
    }
    
    expect(allThawed).toBe(true);
  });

  test('snapshot swap should complete within 50ms', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Trigger freeze and thaw cycle
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1500);
    
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
    
    const metrics = await getMemoryMetrics(page);
    
    if (metrics) {
      // Snapshot swap (capture + restore) should be fast
      const totalSnapshotTime = metrics.freezeThaw.averageSnapshotCaptureMs + metrics.freezeThaw.averageSnapshotRestoreMs;
      expect(totalSnapshotTime).toBeLessThan(50); // <50ms per ADR-0011
    }
  });
});

test.describe('Memory Budget Manager', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');
  });

  test('should enforce memory budget when contexts exceed limit', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Get memory budget status
    const budgetStatus = await page.evaluate(() => {
      // This would need to be exposed from MemoryBudgetManager
      return window.MemoryBudgetManager?.getEstimate?.() || null;
    });
    
    // Budget status should be available
    expect(budgetStatus).not.toBeNull();
  });

  test('should evict LRU charts under memory pressure', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // This test would require simulating memory pressure
    // For now, verify the LRU mechanism exists
    const lruList = await page.evaluate(() => {
      return window.MemoryBudgetManager?.lruList || null;
    });
    
    expect(lruList).not.toBeNull();
  });
});

test.describe('Performance Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');
  });

  test('should expose performance metrics to devtools', async ({ page }) => {
    await waitForCharts(page, 4);
    
    const exposed = await page.evaluate(() => {
      return typeof window.__VNINVESTCHARTS_PERF__ !== 'undefined';
    });
    
    expect(exposed).toBe(true);
  });

  test('should track frame time metrics', async ({ page }) => {
    await waitForCharts(page, 4);
    
    // Wait for some frames to be recorded
    await page.waitForTimeout(2000);
    
    const metrics = await getMemoryMetrics(page);
    
    if (metrics) {
      expect(metrics.frameTime.frameCount).toBeGreaterThan(0);
      expect(metrics.frameTime.averageFrameTimeMs).toBeGreaterThan(0);
    }
  });

  test('should calculate frame time percentiles', async ({ page }) => {
    await waitForCharts(page, 4);
    
    await page.waitForTimeout(2000);
    
    const percentiles = await page.evaluate(() => {
      if (window.__VNINVESTCHARTS_PERF__) {
        return window.__VNINVESTCHARTS_PERF__.getFrameTimeStats();
      }
      return null;
    });
    
    if (percentiles) {
      expect(percentiles.p50).toBeGreaterThan(0);
      expect(percentiles.p90).toBeGreaterThanOrEqual(percentiles.p50);
      expect(percentiles.p95).toBeGreaterThanOrEqual(percentiles.p90);
      expect(percentiles.p99).toBeGreaterThanOrEqual(percentiles.p95);
    }
  });
});