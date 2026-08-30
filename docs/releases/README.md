# 版本发布说明

OmniMail Web、OmniMail Float 浏览器扩展与 OmniMail Android 使用互不影响的
独立版本和发布说明：

```text
docs/releases/web/vX.Y.Z.md
docs/releases/float/float-vX.Y.Z.md
docs/releases/android/android-vX.Y.Z.md
```

发布网站版本时：

1. 复制 [`web/TEMPLATE.md`](./web/TEMPLATE.md) 为 `web/vX.Y.Z.md`。
2. 将 `package.json`、`package-lock.json` 及根包版本更新为 `X.Y.Z`。
3. 创建并推送 `vX.Y.Z` Tag；该版本号只对应 Web。

发布 Float 版本时：

1. 复制 [`float/TEMPLATE.md`](./float/TEMPLATE.md) 为
   `float/float-vX.Y.Z.md`。
2. 将 `extension/public/manifest.json` 的版本更新为 `X.Y.Z`。
3. 创建并推送 `float-vX.Y.Z` Tag；该版本号不需要与 Web 或 Android 相同。

发布 Android 版本时：

1. 复制 [`android/TEMPLATE.md`](./android/TEMPLATE.md) 为
   `android/android-vX.Y.Z.md`。
2. 创建并推送 `android-vX.Y.Z` Tag；该版本号只对应 Android。

三条 Release Action 只读取各自目录中与 Tag 同名的文件。文件缺失或内容为空时，
对应发布会直接失败；验证通过后，该文件会原样用作 GitHub Release 正文。

Float 与 Android Release 会标记为非 Latest，确保 `/releases/latest` 始终代表可供
Web 版本检查使用的网站版本。

[`CHANGELOG.md`](../../CHANGELOG.md) 保留现有的聚合版本历史，不再作为 Release Action
的发布日志来源。
