---
description: H5 互动页面兼容性审查与修复（Chrome 59 / iPad / 安卓Pad / 小屏幕）
---

# H5 兼容性审查与修复工作流

本工作流对 H5 互动页面项目执行全面兼容性审查，覆盖 Chrome 59、iPad、安卓 Pad、小屏幕手机。

## 前提条件
- 项目为原生 HTML/CSS/JS 三件套（无构建工具）
- 目标兼容 Chrome 59+（嵌入式 WebView 场景）
- 项目已有本地开发服务器可访问

---

## Step 1：识别项目文件

找到项目中的 HTML、CSS、JS 主文件。通常为：
- `index.html`
- `style.css`（或 `*.css`）
- `script.js`（或 `*.js`）

## Step 2：JavaScript 致命语法扫描

用 grep 搜索以下 Chrome 59 不支持的语法，**任何命中都是致命问题**：

// turbo
```
grep -n '\.\.\.' *.js          # 对象展开运算符（Chrome 60+）
```
// turbo
```
grep -n '\?\.' *.js            # 可选链（Chrome 80+）
```
// turbo
```
grep -n '??' *.js              # 空值合并（Chrome 80+）
```
// turbo
```
grep -n 'import ' *.js         # ES Modules（Chrome 61+）
```
// turbo
```
grep -n 'globalThis' *.js      # globalThis（Chrome 71+）
```

**修复规则：**
- `...obj` → `Object.assign(target, source)`
- `?.` → `&& 短路`（如 `a?.b` → `a && a.b`）
- `??` → `||`
- `import/export` → IIFE 闭包
- `globalThis` → `window`

## Step 3：CSS 兼容性扫描

// turbo
```
grep -n 'gap:' *.css           # flexbox gap（Chrome 84+）
```
// turbo
```
grep -n 'clamp\|max(\|min(' *.css  # CSS 函数（Chrome 79+）
```

**修复规则：**
- `gap: Xpx` → 子元素 `margin` 替代
- `clamp()`/`max()`/`min()` → `@media` 查询 + 固定值覆盖

## Step 4：触控兼容检查

检查以下项是否已设置：

// turbo
```
grep -n 'touch-action' *.css   # 拖拽区域是否阻止系统手势
```
// turbo
```
grep -n 'passive' *.js         # addEventListener passive 参数
```
// turbo
```
grep -n 'viewport-fit' *.html  # 刘海屏适配
```

**缺失时添加：**
- 拖拽区域 CSS：`touch-action: none; -ms-touch-action: none;`
- JS：添加 passive 特性检测代码块（见下方模板）
- HTML viewport：添加 `viewport-fit=cover`

### Passive 特性检测模板（缺失时添加到事件绑定前）：

```javascript
var supportsPassive = false;
try {
    var opts = Object.defineProperty({}, 'passive', {
        get: function() { supportsPassive = true; }
    });
    window.addEventListener('testPassive', null, opts);
    window.removeEventListener('testPassive', null, opts);
} catch (e) {}
var passiveFalse = supportsPassive ? { passive: false } : false;
```

## Step 5：小屏幕适配检查

检查关键 UI 元素是否有最小尺寸保底：

// turbo
```
grep -n '@media' *.css          # 是否有小屏幕媒体查询
```

**需要确保的下限值（通过 @media 保底）：**

| 元素 | 最小值 | 触发条件 |
|------|--------|----------|
| 按钮字号 | 14px | `max-width: 480px` |
| 正文字号 | 10px | `max-width: 480px` |
| 按钮触控区 | 44px 高度 | `pointer: coarse` |
| 控制按钮 | 36×36px | `max-width: 480px` |

若缺少，添加 `@media (max-width: 480px), (max-height: 480px)` 和 `@media (pointer: coarse)` 规则。

## Step 6：overflow 裁切检查

// turbo
```
grep -n 'overflow' *.css        # 检查是否有隐式裁切
```

如果有子元素通过 `position: absolute` 超出父容器（如按钮在 stage 下方），确保父容器设置 `overflow: visible`。

## Step 7：浏览器验证

启动本地服务器后，用浏览器工具在以下尺寸下截图验证：

1. **iPhone SE**：320×568 — 检查文字/按钮是否太小
2. **iPad**：768×1024 — 检查横竖屏布局
3. **安卓 Pad**：1280×800 — 检查桌面级布局
4. 打开浏览器 Console，确认无 JS 报错

## Step 8：生成审查报告

将发现的问题整理为表格，按严重度分类：

| 严重度 | 文件 | 行号 | 问题 | 修复方案 |
|--------|------|------|------|----------|
| 🔴 致命 | | | | |
| 🟡 中等 | | | | |
| 🟢 建议 | | | | |

修复所有致命和中等问题后，重新执行 Step 7 验证。
