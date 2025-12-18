<p align="center">
  <img src="openscreen.png" alt="OpenScreen Logo" width="64" />
  <br />
	  <br />
  <a href="https://deepwiki.com/siddharthvaddem/openscreen">
    <img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki" />
  </a>
</p>

# <p align="center">OpenScreen</p>

<p align="center">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

<p align="center"><strong>OpenScreen 是 Screen Studio 的免费开源替代品。</strong></p>

如果你不想为 Screen Studio 每月支付 29 美元，但需要一个简单的工具来制作精美的产品演示和教程视频，这款免费应用就是为你准备的。OpenScreen 并未涵盖 Screen Studio 的所有功能，但已经能够满足基本需求！

Screen Studio 是一款出色的产品，这绝对不是一个 1:1 的克隆。OpenScreen 是一个更简洁的版本，为那些想要掌控一切且不想付费的用户提供基础功能。如果你需要所有高级功能，最好还是支持 Screen Studio（他们确实做得很棒）。但如果你只是想要一个免费（没有任何附加条件）且开源的工具，这个项目完全可以胜任！

OpenScreen 对个人和商业用途都是 100% 免费的。你可以使用、修改、分发它。（如果你愿意的话，请给个 star 支持一下！😁）

**⚠️ 免责声明：这是一个测试版本，可能存在一些 bug（但希望你能有良好的使用体验！）**

</p>
<p align="center">
	<img src="preview.png" alt="OpenScreen 应用预览" style="height: 320px; margin-right: 12px;" />
	<img src="preview2.png" alt="OpenScreen 应用预览 2" style="height: 320px; margin-right: 12px;" />
	<img src="preview3.png" alt="OpenScreen 应用预览 3" style="height: 320px; margin-right: 12px;" />
	<img src="preview4.png" alt="OpenScreen 应用预览 4" style="height: 320px; margin-right: 12px;" />

</p>
</p>

## 核心功能
- 录制整个屏幕或特定应用窗口
- 添加手动缩放（可自定义缩放深度）
- 自由定制缩放的持续时间和位置
- 裁剪视频录制以隐藏部分内容
- 选择壁纸、纯色、渐变或自定义图片作为背景
- 运动模糊效果，使平移和缩放更流畅
- 添加标注（文字、箭头、图片）
- 剪辑片段
- 以不同的宽高比和分辨率导出

## 安装

从 [GitHub Releases](https://github.com/fengjinyi98/openscreen/releases) 页面下载适合你平台的最新安装包。

### macOS

如果你遇到 macOS Gatekeeper 阻止应用运行的问题（因为应用没有开发者证书），可以在安装后运行以下终端命令来绕过：

```bash
xattr -rd com.apple.quarantine /Applications/Openscreen.app
```

运行此命令后，请前往 **系统偏好设置 > 安全性与隐私** 授予"屏幕录制"和"辅助功能"权限。授权完成后即可启动应用。

### Linux

从 releases 页面下载 `.AppImage` 文件。赋予执行权限后运行：

```bash
chmod +x Openscreen-Linux-*.AppImage
./Openscreen-Linux-*.AppImage
```

根据你的桌面环境，可能需要授予屏幕录制权限。

### Windows

从 releases 页面下载 `.exe` 安装程序，双击运行即可安装。

## 技术栈
- Electron
- React
- TypeScript
- Vite
- PixiJS
- dnd-timeline

---

_如果有任何问题，请提交 issue 🙏_

## 贡献

欢迎贡献！如果你想帮忙或查看当前正在进行的工作，请查看 open issues 和 [项目路线图](https://github.com/users/siddharthvaddem/projects/3) 来了解项目的当前方向并找到贡献的方式。

## 许可证

本项目采用 [MIT 许可证](./LICENSE)。使用本软件即表示你同意作者不对因使用本软件而产生的任何问题、损害或索赔承担责任。
