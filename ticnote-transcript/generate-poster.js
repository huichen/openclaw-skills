const { chromium } = require('playwright');
const path = require('path');

/**
 * 金句海报生成脚本
 * @param {string} inputHtml - 输入 HTML 文件路径
 * @param {string} outputPath - 输出图片路径
 * @param {number} width - 视口宽度（默认 600）
 * @param {number} scale - 渲染倍率（默认 3）
 */
async function generatePoster(inputHtml, outputPath, width = 600, scale = 3) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: width, height: 150 },
    deviceScaleFactor: scale
  });
  
  await page.goto(`file://${inputHtml}`, {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  
  // 等待页面完全渲染
  await page.waitForTimeout(1000);
  
  // 获取完整页面高度
  const height = await page.evaluate(() => {
    return document.documentElement.scrollHeight;
  });
  
  // 重新设置视口为完整高度
  await page.setViewportSize({ width: width, height: height });
  
  // 截图
  await page.screenshot({
    path: outputPath,
    type: 'png',
    fullPage: true
  });
  
  await browser.close();
  console.log(`海报生成完成：${outputPath}`);
  console.log(`图片尺寸：${width * scale} x ${height * scale} px`);
}

// 命令行调用
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputHtml = args[0] || path.join('/tmp', 'ticnote-poster.html');
  const outputPath = args[1] || path.join('/tmp', 'ticnote-poster.png');
  const width = parseInt(args[2]) || 600;
  const scale = parseInt(args[3]) || 3;
  
  generatePoster(inputHtml, outputPath, width, scale).catch(console.error);
}

module.exports = { generatePoster };
