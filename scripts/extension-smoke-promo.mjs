import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function createPromoAsset(context, capturedAssetsPath) {
  const icon = await readFile(resolve('extension', 'public', 'icons', 'icon128.png'))
  const page = await context.newPage()
  await page.setViewportSize({ width: 440, height: 280 })
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;width:440px;height:280px;overflow:hidden;font-family:Inter,system-ui;color:white;background:#17181b}
    main{position:relative;width:100%;height:100%;display:flex;align-items:center;padding:38px;background:radial-gradient(circle at 82% 18%,#3b82f655,transparent 42%)}
    main:after{content:'';position:absolute;right:-45px;bottom:-90px;width:260px;height:260px;border:1px solid #ffffff26;border-radius:50%}
    img{width:82px;height:82px;border-radius:24px;box-shadow:0 18px 45px #0008}
    div{margin-left:24px}h1{margin:0 0 9px;font-size:27px;letter-spacing:-.6px}p{margin:0;color:#cbd0d9;font-size:15px;line-height:1.45}
  </style></head><body><main><img src="data:image/png;base64,${icon.toString('base64')}" alt=""><div><h1>OmniMail Float</h1><p>邮箱随页面而行<br>生成 · 填入 · 收件</p></div></main></body></html>`)
  await page.screenshot({
    path: resolve(capturedAssetsPath, 'promo-small-440x280.jpg'),
    type: 'jpeg', quality: 95,
  })
  await page.close()
}
