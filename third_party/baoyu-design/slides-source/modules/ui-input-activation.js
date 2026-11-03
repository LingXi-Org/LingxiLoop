// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
// Upstream UiVideoPlaybackActions without its video actions: shared labels and keyboard/pointer activation.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiInputActivation(runtime2) {
  var SHAPE_KIND_LABELS, shapeKindLabel = (kind) => SHAPE_KIND_LABELS[kind], SLIDE_ICON_LABELS, slideIconLabel = (name) => SLIDE_ICON_LABELS[name], TEXT_ROLE_LABELS, textRoleLabel = (role) => TEXT_ROLE_LABELS[role], TEXT_ROLE_WORDS, typographyStyleName = (style) => style.source === "system" || style.id === runtime2.CUSTOM_TYPOGRAPHY_STYLE_ID ? style.name : textRoleLabel(style.role), typographyStyleWord = (style) => style.source === "system" ? style.name.toLowerCase() : TEXT_ROLE_WORDS[style.role], FONT_FACE_WORDS;
  function typographyFaceLabel(node, theme) {
    let face = (0, runtime2.nodeTypographyFace)(node, theme);
    return face.word ? FONT_FACE_WORDS[face.face] : face.face;
  }
  function typographyLabel(node, theme) {
    return (0, runtime2.formatMessage)({
      defaultMessage: "{face} · {size}",
      id: "f2grqU071S"
    }, {
      face: typographyFaceLabel(node, theme),
      size: (0, runtime2.nodeTypographyFace)(node, theme).size
    });
  }
  var FONT_WEIGHT_LABELS, ITALIC_FONT_WEIGHT_LABELS;
  function fontVariantLabel(weight, italic) {
    return (italic ? ITALIC_FONT_WEIGHT_LABELS : FONT_WEIGHT_LABELS)[(0, runtime2.normalizeFontWeight)(weight)] ?? String(weight) + (italic ? " italic" : "");
  }
  function isKeyboardOrPrimaryActivation(event) {
    return event.detail === 0 || event.buttons === 1 || event.nativeEvent?.mozInputSource === 0;
  }
  return bindRuntimeValue(runtime2, "SHAPE_KIND_LABELS", () => SHAPE_KIND_LABELS, (value) => {
    SHAPE_KIND_LABELS = value;
  }), bindRuntimeValue(runtime2, "shapeKindLabel", () => shapeKindLabel), bindRuntimeValue(runtime2, "SLIDE_ICON_LABELS", () => SLIDE_ICON_LABELS, (value) => {
    SLIDE_ICON_LABELS = value;
  }), bindRuntimeValue(runtime2, "slideIconLabel", () => slideIconLabel), bindRuntimeValue(runtime2, "TEXT_ROLE_LABELS", () => TEXT_ROLE_LABELS, (value) => {
    TEXT_ROLE_LABELS = value;
  }), bindRuntimeValue(runtime2, "textRoleLabel", () => textRoleLabel), bindRuntimeValue(runtime2, "TEXT_ROLE_WORDS", () => TEXT_ROLE_WORDS, (value) => {
    TEXT_ROLE_WORDS = value;
  }), bindRuntimeValue(runtime2, "typographyStyleName", () => typographyStyleName), bindRuntimeValue(runtime2, "typographyStyleWord", () => typographyStyleWord), bindRuntimeValue(runtime2, "FONT_FACE_WORDS", () => FONT_FACE_WORDS, (value) => {
    FONT_FACE_WORDS = value;
  }), bindRuntimeValue(runtime2, "typographyFaceLabel", () => typographyFaceLabel), bindRuntimeValue(runtime2, "typographyLabel", () => typographyLabel), bindRuntimeValue(runtime2, "FONT_WEIGHT_LABELS", () => FONT_WEIGHT_LABELS, (value) => {
    FONT_WEIGHT_LABELS = value;
  }), bindRuntimeValue(runtime2, "ITALIC_FONT_WEIGHT_LABELS", () => ITALIC_FONT_WEIGHT_LABELS, (value) => {
    ITALIC_FONT_WEIGHT_LABELS = value;
  }), bindRuntimeValue(runtime2, "fontVariantLabel", () => fontVariantLabel), bindRuntimeValue(runtime2, "isKeyboardOrPrimaryActivation", () => isKeyboardOrPrimaryActivation), () => {
    (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeTypographyInference)(), (0, runtime2.initializeModelSelection)(), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPropertyLabels)(), SHAPE_KIND_LABELS = {
      rect: (0, runtime2.formatMessage)({
        defaultMessage: "矩形",
        id: "LVVLWnZyI7"
      }),
      rounded: (0, runtime2.formatMessage)({
        defaultMessage: "圆角矩形",
        id: "iL10J+goqK"
      }),
      ellipse: (0, runtime2.formatMessage)({
        defaultMessage: "椭圆",
        id: "SCoZLDf576"
      }),
      diamond: (0, runtime2.formatMessage)({
        defaultMessage: "菱形（判断）",
        id: "o3yREXgxHR"
      }),
      "arrow-right": (0, runtime2.formatMessage)({
        defaultMessage: "右箭头",
        id: "OdIUFjzuEN"
      }),
      "arrow-left": (0, runtime2.formatMessage)({
        defaultMessage: "左箭头",
        id: "xpewKigTti"
      }),
      "arrow-up": (0, runtime2.formatMessage)({
        defaultMessage: "上箭头",
        id: "EXLOm7Vm4X"
      }),
      "arrow-down": (0, runtime2.formatMessage)({
        defaultMessage: "下箭头",
        id: "36yU3ZFMbU"
      }),
      line: (0, runtime2.formatMessage)({
        defaultMessage: "线条",
        id: "UxWFsZcZ5o"
      }),
      connector: (0, runtime2.formatMessage)({
        defaultMessage: "连接线",
        id: "VUUfUulY23"
      })
    }, SLIDE_ICON_LABELS = {
      Ant: (0, runtime2.formatMessage)({
        defaultMessage: "蚂蚁",
        id: "7FY4oinvB4"
      }),
      Activity: (0, runtime2.formatMessage)({
        defaultMessage: "活动",
        id: "lFfIJ5uWyR"
      }),
      Book: (0, runtime2.formatMessage)({
        defaultMessage: "书籍体",
        id: "s46Xo7Owjr"
      }),
      Chart: (0, runtime2.formatMessage)({
        defaultMessage: "图表",
        id: "k7ZtNVXoG5"
      }),
      Chat: (0, runtime2.formatMessage)({
        defaultMessage: "对话",
        id: "pkR4Yu8Q0W"
      }),
      Check: (0, runtime2.formatMessage)({
        defaultMessage: "对勾",
        id: "10Rl5nSyvl"
      }),
      CheckCircle: (0, runtime2.formatMessage)({
        defaultMessage: "圆形对勾",
        id: "QYH7+v+wer"
      }),
      Clock: (0, runtime2.formatMessage)({
        defaultMessage: "时钟",
        id: "0uOvIe9dFa"
      }),
      Cloud: (0, runtime2.formatMessage)({
        defaultMessage: "云",
        id: "G1V/WE84hT"
      }),
      Code: (0, runtime2.formatMessage)({
        defaultMessage: "代码",
        id: "8XxyKxPaFa"
      }),
      Database: (0, runtime2.formatMessage)({
        defaultMessage: "数据库",
        id: "o/8wVC4UNl"
      }),
      Globe: (0, runtime2.formatMessage)({
        defaultMessage: "地球",
        id: "iTDy9eYPao"
      }),
      GraduationCap: (0, runtime2.formatMessage)({
        defaultMessage: "学位帽",
        id: "uNy/UL9DM7"
      }),
      Home: (0, runtime2.formatMessage)({
        defaultMessage: "主页",
        id: "6pVMQf+J51"
      }),
      Key: (0, runtime2.formatMessage)({
        defaultMessage: "钥匙",
        id: "s7EFIB3lh9"
      }),
      Lightbulb: (0, runtime2.formatMessage)({
        defaultMessage: "灯泡",
        id: "KSs2Mi+Cnp"
      }),
      Lightning: (0, runtime2.formatMessage)({
        defaultMessage: "闪电",
        id: "G0MR6+jpBf"
      }),
      Link: (0, runtime2.formatMessage)({
        defaultMessage: "链接",
        id: "V9AzG1YHOk"
      }),
      Lock: (0, runtime2.formatMessage)({
        defaultMessage: "锁",
        id: "RiRqSGvW9X"
      }),
      Owl: (0, runtime2.formatMessage)({
        defaultMessage: "猫头鹰",
        id: "6vXKxDbXaS"
      }),
      PaperPlane: (0, runtime2.formatMessage)({
        defaultMessage: "纸飞机",
        id: "5GWs94IhdD"
      }),
      Play: (0, runtime2.formatMessage)({
        defaultMessage: "播放",
        id: "fo/Y5Bu5Zd"
      }),
      Search: (0, runtime2.formatMessage)({
        defaultMessage: "搜索",
        id: "RvwEj+OFEY"
      }),
      Settings: (0, runtime2.formatMessage)({
        defaultMessage: "设置",
        id: "6MB9CmYVAU"
      }),
      Star: (0, runtime2.formatMessage)({
        defaultMessage: "星形",
        id: "2hG6FW7WoK"
      }),
      ThumbsUp: (0, runtime2.formatMessage)({
        defaultMessage: "点赞",
        id: "7NmBUmVYdA"
      }),
      Tool: (0, runtime2.formatMessage)({
        defaultMessage: "工具",
        id: "uSqVbEs3Ii"
      }),
      Trust: (0, runtime2.formatMessage)({
        defaultMessage: "信任",
        id: "0akbSxWbZx"
      }),
      Users: (0, runtime2.formatMessage)({
        defaultMessage: "用户",
        id: "ExJwk/CnDV"
      }),
      Verified: (0, runtime2.formatMessage)({
        defaultMessage: "已验证",
        id: "SvuFi7tAie"
      }),
      Warning: (0, runtime2.formatMessage)({
        defaultMessage: "警告",
        id: "ydnmf6Vbyj"
      }),
      Wrench: (0, runtime2.formatMessage)({
        defaultMessage: "扳手",
        id: "Ab77JH9OV+"
      })
    }, TEXT_ROLE_LABELS = {
      display: (0, runtime2.formatMessage)({
        defaultMessage: "大标题",
        id: "ydergITsaV"
      }),
      h1: (0, runtime2.formatMessage)({
        defaultMessage: "一级标题",
        id: "PHlWwv6OeX"
      }),
      h2: (0, runtime2.formatMessage)({
        defaultMessage: "二级标题",
        id: "T8lBsM/OTZ"
      }),
      h3: (0, runtime2.formatMessage)({
        defaultMessage: "三级标题",
        id: "kftNMYALui"
      }),
      lead: (0, runtime2.formatMessage)({
        defaultMessage: "导语",
        id: "AoGLAZoVWS"
      }),
      eyebrow: (0, runtime2.formatMessage)({
        defaultMessage: "眉题",
        id: "i+hSnDfDix"
      }),
      body: (0, runtime2.formatMessage)({
        defaultMessage: "正文",
        id: "dGEV0Om+y+"
      }),
      caption: (0, runtime2.formatMessage)({
        defaultMessage: "说明文字",
        id: "Iw5GGc5WO9"
      })
    }, TEXT_ROLE_WORDS = {
      display: (0, runtime2.formatMessage)({
        defaultMessage: "大标题",
        id: "YK98NvS1pU"
      }),
      h1: (0, runtime2.formatMessage)({
        defaultMessage: "一级标题",
        id: "pfQBK0TLBo"
      }),
      h2: (0, runtime2.formatMessage)({
        defaultMessage: "二级标题",
        id: "bILUV+DRYE"
      }),
      h3: (0, runtime2.formatMessage)({
        defaultMessage: "三级标题",
        id: "U/ApUpuBw3"
      }),
      lead: (0, runtime2.formatMessage)({
        defaultMessage: "导语",
        id: "Mn4moO763u"
      }),
      eyebrow: (0, runtime2.formatMessage)({
        defaultMessage: "眉题",
        id: "cydYbSD/Zg"
      }),
      body: (0, runtime2.formatMessage)({
        defaultMessage: "正文",
        id: "RrijRRhJH8"
      }),
      caption: (0, runtime2.formatMessage)({
        defaultMessage: "说明文字",
        id: "5xeO135JGG"
      })
    }, FONT_FACE_WORDS = {
      System: (0, runtime2.formatMessage)({
        defaultMessage: "系统",
        id: "CIxl65W4R/"
      }),
      Serif: (0, runtime2.formatMessage)({
        defaultMessage: "衬线字体",
        id: "+uRLcEDivj"
      }),
      Sans: (0, runtime2.formatMessage)({
        defaultMessage: "无衬线",
        id: "f4kvw+/7ms"
      }),
      Mono: (0, runtime2.formatMessage)({
        defaultMessage: "等宽",
        id: "O3Gmt8o1o1"
      })
    }, FONT_WEIGHT_LABELS = {
      100: (0, runtime2.formatMessage)({
        defaultMessage: "极细",
        id: "eFXTcx19hl"
      }),
      200: (0, runtime2.formatMessage)({
        defaultMessage: "特细",
        id: "Hppp4nMVMv"
      }),
      300: (0, runtime2.formatMessage)({
        defaultMessage: "细体",
        id: "HqhbVFwfmS"
      }),
      400: (0, runtime2.formatMessage)({
        defaultMessage: "常规",
        id: "Jy1wZnpbXy"
      }),
      500: (0, runtime2.formatMessage)({
        defaultMessage: "中等",
        id: "Va5Buxgawg"
      }),
      600: (0, runtime2.formatMessage)({
        defaultMessage: "半粗",
        id: "Wadmn3nTTQ"
      }),
      700: (0, runtime2.formatMessage)({
        defaultMessage: "加粗",
        id: "yhriHyWlK+"
      }),
      800: (0, runtime2.formatMessage)({
        defaultMessage: "特粗",
        id: "qvF9URcCnz"
      }),
      900: (0, runtime2.formatMessage)({
        defaultMessage: "黑体",
        id: "KOguWAstpl"
      })
    }, ITALIC_FONT_WEIGHT_LABELS = {
      100: (0, runtime2.formatMessage)({
        defaultMessage: "极细斜体",
        id: "G2KsQUmWVA"
      }),
      200: (0, runtime2.formatMessage)({
        defaultMessage: "特细斜体",
        id: "d8cGz962q6"
      }),
      300: (0, runtime2.formatMessage)({
        defaultMessage: "细斜体",
        id: "4Myd+FKqVD"
      }),
      400: (0, runtime2.formatMessage)({
        defaultMessage: "斜体",
        id: "eLhIiC5/4p"
      }),
      500: (0, runtime2.formatMessage)({
        defaultMessage: "中等斜体",
        id: "i6r06LpyJr"
      }),
      600: (0, runtime2.formatMessage)({
        defaultMessage: "半粗斜体",
        id: "OGFA+Y1ueq"
      }),
      700: (0, runtime2.formatMessage)({
        defaultMessage: "粗斜体",
        id: "i4CwHelvBg"
      }),
      800: (0, runtime2.formatMessage)({
        defaultMessage: "特粗斜体",
        id: "TbrxycvSI6"
      }),
      900: (0, runtime2.formatMessage)({
        defaultMessage: "黑斜体",
        id: "Q9zcitJq9Z"
      })
    };
  };
}
export {
  installUiInputActivation
};
