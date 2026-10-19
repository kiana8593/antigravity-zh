# 参与贡献

新增翻译时，请为词条指定可靠的控件范围，测试聊天、代码、文件名、项目名和模型名不会被误译。不要采用全页面无差别替换。

提交前运行：

```powershell
npm ci --ignore-scripts
npm test
npm run privacy
```

请使用 GitHub 的隐私邮箱提交。可在 GitHub 的 Settings → Emails 中查找自己的 `users.noreply.github.com` 地址，并仅为此仓库配置：

```powershell
git config user.email "你的 GitHub 隐私邮箱"
```

不要提交本机安装文件、原始备份、日志、截图、凭据或含个人信息的路径。公开反馈请先遮盖账号、邮箱、用户名、路径和对话内容。

`main` 保存发布版本，`dev` 用于开发。首次公开前的开发历史已重写；请从公开仓库重新克隆，避免将旧历史重新引入。
