// Product split from the pinned editor templates (MIT); first-view renderer labels.
import {bindRuntimeValue} from "../module-helpers.js";
export function installRenderingMessages(runtime2){let messages;bindRuntimeValue(runtime2,"SLIDE_RENDERER_MESSAGES",()=>messages);return()=>{messages={
      embed: (0, runtime2.formatMessage)({
        defaultMessage: "网页嵌入内容",
        id: "xayCilhvYm"
      }),
      embedTookFocus: (0, runtime2.formatMessage)({
        defaultMessage: "网页嵌入内容已禁用：它尝试获取键盘焦点",
        id: "u2yJI0yeHz"
      }),
      embedNavigated: (0, runtime2.formatMessage)({
        defaultMessage: "网页嵌入内容已禁用：它跳转到了其他页面",
        id: "xWQ5UwV1p7"
      }),
      embedFrame: (0, runtime2.formatMessage)({
        defaultMessage: "嵌入网页内容（沙箱隔离）",
        id: "+m2SEr/50b"
      }),
      video: (0, runtime2.formatMessage)({
        defaultMessage: "视频",
        id: "mmm4Aot3xj"
      }),
      videoControls: (alt) => alt ? (0, runtime2.formatMessage)({
        defaultMessage: "视频控件：{alt}",
        id: "O8juMLr6lg"
      }, {
        alt
      }) : (0, runtime2.formatMessage)({
        defaultMessage: "视频控制",
        id: "Bwyv83g6zb"
      }),
      videoFailed: (0, runtime2.formatMessage)({
        defaultMessage: "视频加载失败。",
        id: "RstTzmSLCo"
      }),
      emptyImage: (0, runtime2.formatMessage)({
        defaultMessage: "空白图片",
        id: "J3cAjvvJGb"
      }),
      image: (0, runtime2.formatMessage)({
        defaultMessage: "图片",
        id: "H8UnyFy+9Z"
      }),
      imageUnavailable: (0, runtime2.formatMessage)({
        defaultMessage: "此处无法显示图片",
        id: "J0oVoThTQx"
      }),
      missingAsset: (asset) => (0, runtime2.formatMessage)({
        defaultMessage: "缺少资源：{asset}",
        id: "qXe3R9Hf6K"
      }, {
        asset
      }),
      editableName: runtime2.accessibleNodeKindName,
      openLinkHint: (key) => (0, runtime2.formatMessage)({
        defaultMessage: "{key}+点击打开：",
        id: "bZ0rCO+6nT"
      }, {
        key
      }),
      selectBoxHint: (key) => (0, runtime2.formatMessage)({
        defaultMessage: "{key}+点击选择文本框",
        id: "NRaswYa4Yu"
      }, {
        key
      }),
      cellName: (cell) => (0, runtime2.formatMessage)({
        defaultMessage: "第 {row} 行，第 {column} 列",
        id: "jusA68ZCeY"
      }, {
        row: String(cell.r + 1),
        column: String(cell.c + 1)
      })
    };};}
