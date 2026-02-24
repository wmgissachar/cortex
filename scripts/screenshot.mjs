import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, '..', 'docs', 'images');

const BASE_URL = process.env.CORTEX_URL || 'http://localhost:5173';

// Topic with the most content — auto-detected at runtime
let richTopicId = null;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Login
  console.log('Logging in...');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@cortex.local');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/*', { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Screenshot 1: Dashboard
  console.log('Capturing dashboard...');
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(outputDir, 'dashboard.png'), fullPage: false });
  console.log('  -> dashboard.png');

  // Screenshot 2: Topics overview
  console.log('Capturing topics page...');
  await page.goto(`${BASE_URL}/topics`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(outputDir, 'topics-overview.png'), fullPage: false });
  console.log('  -> topics-overview.png');

  // Find the topic with the most threads (click the first topic card link)
  console.log('Finding richest topic...');
  const topicLinks = await page.$$('a[href*="/topics/"]');
  if (topicLinks.length > 0) {
    const href = await topicLinks[0].getAttribute('href');
    richTopicId = href?.match(/\/topics\/([a-f0-9-]+)/)?.[1];
  }

  // Screenshot 3: Topic detail (top of page — first principles, overview)
  if (richTopicId) {
    console.log(`Capturing topic detail (${richTopicId})...`);
    await page.goto(`${BASE_URL}/topics/${richTopicId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(outputDir, 'topic-detail.png'), fullPage: false });
    console.log('  -> topic-detail.png');

    // Screenshot 4: Scroll to scorecard section
    console.log('Capturing scorecard...');
    const scorecardEl = await page.$('text=Progress Scorecard');
    if (scorecardEl) {
      await scorecardEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollBy(0, -80));
      await page.waitForTimeout(500);
    } else {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: join(outputDir, 'topic-scorecard.png'), fullPage: false });
    console.log('  -> topic-scorecard.png');

    // Screenshot 5: Pipeline section
    console.log('Capturing pipeline...');
    const pipelineEl = await page.$('text=AI Research Pipeline') ||
                       await page.$('text=Run Full Cycle') ||
                       await page.$('text=Pipeline');
    if (pipelineEl) {
      await pipelineEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollBy(0, -80));
      await page.waitForTimeout(500);
    } else {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: join(outputDir, 'topic-pipeline.png'), fullPage: false });
    console.log('  -> topic-pipeline.png');
  }

  // Screenshot 6: Search with actual results
  console.log('Capturing search...');
  await page.goto(`${BASE_URL}/search`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const searchInput = await page.$('input[type="text"], input[type="search"], input[placeholder*="earch"]');
  if (searchInput) {
    await searchInput.fill('signal health');
    await searchInput.press('Enter');
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: join(outputDir, 'search.png'), fullPage: false });
  console.log('  -> search.png');

  await browser.close();
  console.log('\nDone! Screenshots saved to docs/images/');
}

main().catch(err => {
  console.error('Screenshot failed:', err);
  process.exit(1);
});
