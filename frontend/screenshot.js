import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage();
  
  // Set viewport to a standard desktop width
  await page.setViewportSize({ width: 1280, height: 800 });

  // Hard reload to pick up latest HMR changes
  await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  // Wait for 2 seconds for content/animations to settle
  console.log('Waiting for page load and animations...');
  await page.waitForTimeout(2000);

  const imgStatus = await page.evaluate(() => {
    const img = document.querySelector('img');
    if (!img) return 'No image element found at all';
    return {
      src: img.src,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      outerHTML: img.outerHTML,
      computedStyle: window.getComputedStyle(img).cssText
    };
  });
  console.log('Image status:', imgStatus);

  // Take screenshot
  console.log('Capturing screenshot...');
  await page.screenshot({ path: 'c:/Users/HP/Desktop/gitfriend/frontend/final_dashboard.png' });

  console.log('Done!');
  await browser.close();
}

run().catch(console.error);
