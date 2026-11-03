// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryExportNoteMessages(runtime2) {
  var formatConjunctionList, formatShortConjunctionList, formatNarrowList, altTextOrPlaceholder, exportTargetMessageValues;
  function fontLeftOutMessage(why, afterOthers, values) {
    switch (why) {
      case "heldBack":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（出于许可原因）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "wm+FOdD9cs"
        }, values);
      case "noLists":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（无法检查其许可，重新导出可能解决）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "etDwVD7Evz"
        }, values);
      case "budget":
        return afterOthers ? (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（嵌入使用更多文字的字体后已没有空间）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "+mtzNgTC0U"
        }, values) : (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（嵌入后文件会过大）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "NZ0UcIpatp"
        }, values);
      case "send":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（嵌入后文件会过大，无法以此方式导出；文稿“下载”菜单中的“PowerPoint，当前字体”可保留字体）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "Lxnr9nTF9G"
        }, values);
      case "licence":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（其许可不允许嵌入）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "ZbRhYbjH0I"
        }, values);
      case "variable":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（Google Fonts 以可变字体提供，此文件无法包含）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "rydvRVH20w"
        }, values);
      case "format":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（其格式不受 PowerPoint 嵌入支持）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "jncWuHjuN9"
        }, values);
      case "unpack":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（无法读取字体文件）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "7BYs3T6LCq"
        }, values);
      case "decoder":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（此页面无法启动字体解包程序，重新加载页面可能解决）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "UPPEqGrRGG"
        }, values);
      case "fetch":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未嵌入此文件（无法从 Google Fonts 下载）；在未安装该字体的电脑上，相关文字将以替代字体显示",
          id: "Em+23e8LAK"
        }, values);
    }
  }
  function exportNoteMessage(note) {
    if (typeof note == "string")
      return note;
    switch (note.code) {
      case "fonts_unavailable":
        return (0, runtime2.formatMessage)({
          defaultMessage: "无法获取某个网页字体；部分文字使用后备字体",
          id: "Q8oUXzBfKd"
        });
      case "fonts_over_budget_drawn":
        return (0, runtime2.formatMessage)({
          defaultMessage: "幻灯片使用的网页字体过大，无法完整包含；部分文字使用后备字体",
          id: "yuUDMh37eC"
        });
      case "linked_font_unfetched":
        return (0, runtime2.formatMessage)({
          defaultMessage: "无法获取某个链接的网页字体；相关文字将以后备字体导出",
          id: "Rw/FUXixbV"
        });
      case "typeface_file_unfetched":
        return (0, runtime2.formatMessage)({
          defaultMessage: "无法获取某个字体文件；相关文字将以后备字体导出",
          id: "TJsFuJMexc"
        });
      case "image_undecoded":
        return (0, runtime2.formatMessage)({
          defaultMessage: "某张图片解码失败，在导出文件中可能显示为空白",
          id: "qcNq7LXrvW"
        });
      case "embed_placeholder":
        return (0, runtime2.formatMessage)({
          defaultMessage: "某个网页嵌入无法渲染，已导出为占位图",
          id: "OariCUkvmk"
        });
      case "fonts_not_packed":
        return (0, runtime2.formatMessage)({
          defaultMessage: "某个网页字体无法包含在文件中；相关文字仅在联网时保留该字体",
          id: "LkhF05qBNn"
        });
      case "fonts_over_budget_linked":
        return (0, runtime2.formatMessage)({
          defaultMessage: "部分网页字体过大，无法包含在文件中；相关文字仅在联网时保留这些字体",
          id: "GDCcsw1Xot"
        });
      case "fonts_late": {
        let values = {
          n: note.families.length,
          fonts: formatConjunctionList(note.families)
        };
        return note.how === "drawn" ? (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未能及时加载，部分文字可能以替代字体绘制或超出文本框",
          id: "iH7oBDRlC9"
        }, values) : (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未能及时加载；部分文字按替代字体排版，可能与文本框不完全吻合",
          id: "bNTsEo8xLo"
        }, values);
      }
      case "fonts_missing": {
        let values = {
          n: note.families.length,
          fonts: formatConjunctionList(note.families)
        };
        return note.how === "drawn" ? (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 不可用，相关文字以替代字体绘制，可能超出文本框",
          id: "krtwrpLLk4"
        }, values) : (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 不可用；相关文字按替代字体排版，可能与文本框不完全吻合",
          id: "fYn24AIvU+"
        }, values);
      }
      case "text_past_limit":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{page, select, notes {第 {slide} 页的备注页：超过 50,000 个字符的文字仅存在于图片中，无法选择、复制或搜索。} other {第 {slide} 页：超过 50,000 个字符的文字仅存在于图片中，无法选择、复制或搜索。}}",
          id: "GG5rNMYO/C"
        }, {
          page: note.notesPage === !0 ? "notes" : "slide",
          slide: String(note.slide)
        });
      case "text_unread":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{page, select, notes {第 {slide} 页的备注页：无法读取其文字，因此该页仅为图片，其中内容无法选择、复制或搜索。} other {第 {slide} 页：无法读取其文字，因此该页仅为图片，其中内容无法选择、复制或搜索。}}",
          id: "Nyr8w+D19y"
        }, {
          page: note.notesPage === !0 ? "notes" : "slide",
          slide: String(note.slide)
        });
      case "pictures_reduced":
        return (0, runtime2.formatMessage)({
          defaultMessage: "已缩小 {count} 张图片以符合 {mb} MB 导出上限",
          id: "HmOvHQVK4T"
        }, {
          n: note.n,
          count: String(note.n),
          mb: String(note.mb)
        });
      case "text_image_fill_plain":
        return (0, runtime2.formatMessage)({
          defaultMessage: "图片填充的文字已按纯色导出（PowerPoint 文字不支持图片填充）（第 {slide} 页）",
          id: "2+GCpgN4ls"
        }, {
          slide: String(note.slide)
        });
      case "text_gradient_plain":
        return (0, runtime2.formatMessage)({
          defaultMessage: "文字渐变已按纯色导出（PPTX 导出无法转换某个色标颜色）（第 {slide} 页）",
          id: "tBV8HPR1OF"
        }, {
          slide: String(note.slide)
        });
      case "text_gradient_radial":
        return (0, runtime2.formatMessage)({
          defaultMessage: "径向文字渐变已导出为线性渐变（PowerPoint 文字渐变只能是线性）（第 {slide} 页）",
          id: "Q5T8fV0w3w"
        }, {
          slide: String(note.slide)
        });
      case "text_gradient_repeating":
        return (0, runtime2.formatMessage)({
          defaultMessage: "重复的文字渐变已导出为一段拉伸的渐变（PPTX 渐变不支持重复）（第 {slide} 页）",
          id: "UWhdfmS4nT"
        }, {
          slide: String(note.slide)
        });
      case "text_gradient_runs":
        return (0, runtime2.formatMessage)({
          defaultMessage: "带样式片段或列表行的渐变文字：PowerPoint 会在每个片段中重新开始渐变，因此效果略有不同（第 {slide} 页）",
          id: "3GJurrhVVC"
        }, {
          slide: String(note.slide)
        });
      case "title_plain_box":
        return (0, runtime2.formatMessage)({
          defaultMessage: "覆盖在文本框上的标题已改为普通文本框（第 {slide} 页）",
          id: "oW9x0xrplX"
        }, {
          slide: String(note.slide)
        });
      case "text_and_box_apart":
        return (0, runtime2.formatMessage)({
          defaultMessage: "文字及其文本框导出为两个对象，而不是一个（第 {slide} 页）",
          id: "KMwhR6nK4b"
        }, {
          slide: String(note.slide)
        });
      case "text_not_written":
        return (0, runtime2.formatMessage)({
          defaultMessage: "某个文本框无法写入文件，已缺失（第 {slide} 页）",
          id: "FNg4/2NiEv"
        }, {
          slide: String(note.slide)
        });
      case "image_missing_asset":
        return (0, runtime2.formatMessage)({
          defaultMessage: "已跳过图片（缺少资源）：{alt}",
          id: "jCzabJnuZG"
        }, {
          alt: altTextOrPlaceholder(note.alt)
        });
      case "svg_unrasterized":
        return (0, runtime2.formatMessage)({
          defaultMessage: "已跳过 SVG 图片（无法为 PowerPoint 栅格化）：{alt}",
          id: "wHiFNb0Q21"
        }, {
          alt: altTextOrPlaceholder(note.alt)
        });
      case "image_fit_stretched":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{fit} 已按拉伸导出，无法获取原始尺寸：{alt}",
          id: "HtFfFQ4eGt"
        }, {
          fit: note.fit,
          alt: altTextOrPlaceholder(note.alt)
        });
      case "picture_border_straight":
        return (0, runtime2.formatMessage)({
          defaultMessage: "圆角或裁切角图片上四边不一致的边框已导出为直线：{alt}",
          id: "owaQeEu+Ym"
        }, {
          alt: altTextOrPlaceholder(note.alt)
        });
      case "image_not_written":
        return (0, runtime2.formatMessage)({
          defaultMessage: "某张图片无法写入文件，已缺失：{alt}",
          id: "IxjwP1Z70w"
        }, {
          alt: altTextOrPlaceholder(note.alt)
        });
      case "picture_border_not_written":
        return (0, runtime2.formatMessage)({
          defaultMessage: "无法将图片边框写入文件：{alt}",
          id: "+f3vhb6u22"
        }, {
          alt: altTextOrPlaceholder(note.alt)
        });
      case "border_currentcolor":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{what, select, image {已跳过图片边框（PPTX 导出无法转换 currentcolor）：{alt}} other {已跳过框边框（PPTX 导出无法转换 currentcolor）（第 {slide} 页）}}",
          id: "M8Etwgfn4j"
        }, exportTargetMessageValues(note));
      case "border_color":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{what, select, image {已跳过图片边框（PPTX 导出无法转换颜色“{color}”）：{alt}} other {已跳过框边框（PPTX 导出无法转换颜色“{color}”）（第 {slide} 页）}}",
          id: "mvrf1XdjX2"
        }, {
          ...exportTargetMessageValues(note),
          color: note.color
        });
      case "border_double":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{what, select, image {双线边框已导出为实线（PPTX 线条没有双线样式）：{alt}} other {双线边框已导出为实线（PPTX 线条没有双线样式）（第 {slide} 页）}}",
          id: "yyB3E5z0RK"
        }, exportTargetMessageValues(note));
      case "shadow_inset":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{what, select, image {已跳过图片内阴影（PPTX 形状仅支持外阴影）：{alt}} other {已跳过框内阴影（PPTX 形状仅支持外阴影）（第 {slide} 页）}}",
          id: "jotxa33TYj"
        }, exportTargetMessageValues(note));
      case "shadow_color":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{what, select, image {已跳过图片阴影（PPTX 导出无法转换颜色“{color}”）：{alt}} other {已跳过框阴影（PPTX 导出无法转换颜色“{color}”）（第 {slide} 页）}}",
          id: "qeVEq3A9p5"
        }, {
          ...exportTargetMessageValues(note),
          color: note.color
        });
      case "box_blend":
        return (0, runtime2.formatMessage)({
          defaultMessage: "已跳过框绘制（mix-blend-mode {blend} 在 PowerPoint 中没有对应效果）（第 {slide} 页）",
          id: "M9KV1y5/K/"
        }, {
          blend: note.blend,
          slide: String(note.slide)
        });
      case "box_gradient_repeating":
        return (0, runtime2.formatMessage)({
          defaultMessage: "重复的框渐变已导出为一段拉伸的渐变（PPTX 渐变不支持重复）（第 {slide} 页）",
          id: "ZPE1coXI/O"
        }, {
          slide: String(note.slide)
        });
      case "box_gradient_extent":
        return (0, runtime2.formatMessage)({
          defaultMessage: "径向渐变的 {extent} 尺寸在 PowerPoint 中不会保留（第 {slide} 页）",
          id: "S1wluCFrMI"
        }, {
          extent: note.extent,
          slide: String(note.slide)
        });
      case "box_gradient_skipped":
        return (0, runtime2.formatMessage)({
          defaultMessage: "已跳过框渐变（PPTX 导出无法转换某个色标颜色）（第 {slide} 页）",
          id: "1vMvl9lZrO"
        }, {
          slide: String(note.slide)
        });
      case "box_fill_color":
        return (0, runtime2.formatMessage)({
          defaultMessage: "已跳过框填充（PPTX 导出无法转换颜色“{color}”）（第 {slide} 页）",
          id: "hRSU2uo3hB"
        }, {
          color: note.color,
          slide: String(note.slide)
        });
      case "box_shadow_nothing":
        return (0, runtime2.formatMessage)({
          defaultMessage: "已跳过框阴影（没有可投射阴影的填充或轮廓）（第 {slide} 页）",
          id: "2tm+0pPWbV"
        }, {
          slide: String(note.slide)
        });
      case "box_border_straight":
        return (0, runtime2.formatMessage)({
          defaultMessage: "圆角或裁切角框上四边不一致的虚线或点线边框已导出为直线（第 {slide} 页）",
          id: "Nbh28htHtl"
        }, {
          slide: String(note.slide)
        });
      case "box_not_written":
        return (0, runtime2.formatMessage)({
          defaultMessage: "某个框无法写入文件（第 {slide} 页）",
          id: "jO629cskkU"
        }, {
          slide: String(note.slide)
        });
      case "box_border_not_written":
        return (0, runtime2.formatMessage)({
          defaultMessage: "无法将框边框写入文件（第 {slide} 页）",
          id: "IUF+hgEBLa"
        }, {
          slide: String(note.slide)
        });
      case "table_empty":
        return (0, runtime2.formatMessage)({
          defaultMessage: "已跳过表格（截断后没有行）",
          id: "QPZMIxuVez"
        });
      case "table_rotated":
        return (0, runtime2.formatMessage)({
          defaultMessage: "旋转的表格已按未旋转导出（PPTX 表格不支持旋转）",
          id: "caSh+BWzum"
        });
      case "table_negative":
        return (0, runtime2.formatMessage)({
          defaultMessage: "位于负坐标的表格已导出并限制在幻灯片边缘",
          id: "gi5ErA6YZP"
        });
      case "table_not_written":
        return (0, runtime2.formatMessage)({
          defaultMessage: "某个表格无法写入文件，已缺失（第 {slide} 页）",
          id: "8/dWkvZbgx"
        }, {
          slide: String(note.slide)
        });
      case "font_left_out":
        return fontLeftOutMessage(note.why, note.afterOthers === !0, {
          n: note.families.length,
          fonts: formatShortConjunctionList(note.families)
        });
      case "font_partly_carried":
        return (0, runtime2.formatMessage)({
          defaultMessage: "此文件仅为文稿中的部分字符包含字体 {family}；在未安装 {family} 的电脑上，其余字符以替代字体显示",
          id: "AgZvJnMSLl"
        }, {
          family: note.family
        });
      case "font_styles_missing":
        return (0, runtime2.formatMessage)({
          defaultMessage: "此文件未包含字体 {family} 的全部样式；在未安装 {family} 的电脑上，部分文字（如粗体或斜体）可能以替代字体显示",
          id: "+BpK7GMb4d"
        }, {
          family: note.family
        });
      case "font_other_name":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {family} 以另一个名称（“{name}”）包含在此文件中，PowerPoint 可能不会将其用于设为 {family} 的文字；这些文字会以替代字体显示",
          id: "2mgnKC9eyF"
        }, {
          family: note.family,
          name: note.name
        });
      case "font_swapped":
        return note.reader === "google" ? (0, runtime2.formatMessage)({
          defaultMessage: "Google 幻灯片没有字体 {family}，因此显示为 {standIn}",
          id: "cppt4Jwe1w"
        }, {
          family: note.family,
          standIn: note.standIn
        }) : (0, runtime2.formatMessage)({
          defaultMessage: "并非每台电脑都有 {family}，因此此文件改用 {standIn}",
          id: "OrVBnRrZHH"
        }, {
          family: note.family,
          standIn: note.standIn
        });
      case "fonts_not_everywhere": {
        let values = {
          n: note.families.length,
          fonts: formatShortConjunctionList(note.families)
        };
        return (0, runtime2.formatMessage)({
          defaultMessage: "并非每台电脑都有字体 {fonts}，因此在没有该字体的电脑上此文件可能显示不同；基础字体版 PowerPoint 和 PDF 在任何地方看起来都一样",
          id: "6KgzXPbH3Z"
        }, values);
      }
      case "fonts_unloaded": {
        let families = note.standIns.map(([family]) => family), basics = [...new Set(note.standIns.flatMap(([, faces]) => faces))];
        if (families.length === 1 || basics.length === 1)
          return (0, runtime2.formatMessage)({
            defaultMessage: "字体 {fonts} 未在此页面加载，因此此文件改用 {basics}；如需重试，请稍后重新导出或重新加载页面",
            id: "fpEMHhxe4X"
          }, {
            n: families.length,
            fonts: formatConjunctionList(families),
            basics: formatConjunctionList(basics)
          });
        let pairTexts = note.standIns.map(([family, faces]) => (0, runtime2.formatMessage)({
          defaultMessage: "{family}（{faces}）",
          id: "xP7D1oZ078"
        }, {
          family,
          faces: formatConjunctionList(faces)
        })), pairs = (0, runtime2.formatMessage)({
          defaultMessage: "{rest}和{last}",
          id: "HXMPO4JWuc"
        }, {
          rest: pairTexts.slice(0, -1).reduce((rest, next) => (0, runtime2.formatMessage)({
            defaultMessage: "{rest}、{next}",
            id: "bvdpaB8mu4"
          }, {
            rest,
            next
          })),
          last: pairTexts[pairTexts.length - 1]
        });
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 未在此页面加载，因此此文件替换了 {pairs}；如需重试，请稍后重新导出或重新加载页面",
          id: "Z+hZIebLGr"
        }, {
          fonts: formatConjunctionList(families),
          pairs
        });
      }
      case "backdrops_smaller":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{scale, select, half {为减小文件大小，幻灯片背景以一半分辨率保存} other {为减小文件大小，幻灯片背景以四分之一分辨率保存}}",
          id: "1Uc/t2BeME"
        }, {
          scale: note.scale
        });
      case "backdrops_missed": {
        let shown = note.slides.slice(0, 3).map(String), slides = note.slides.length > 3 ? formatConjunctionList([
          ...shown,
          (0, runtime2.formatMessage)({
            defaultMessage: "另外 {n} 个",
            id: "GpS8hiKat/"
          }, {
            n: note.slides.length - 3
          })
        ]) : formatNarrowList(shown);
        return (0, runtime2.formatMessage)({
          defaultMessage: "第 {slides} 页的渐变背景未保存为图片，因此在文件中可能显示不同",
          id: "IVqAcSGS42"
        }, {
          n: note.slides.length,
          slides
        });
      }
      case "fonts_license_check":
        return (0, runtime2.formatMessage)({
          defaultMessage: "字体 {fonts} 已嵌入此文件；转发文件前请检查其许可",
          id: "bcFontsLicenseCheck"
        }, {
          n: note.families.length,
          fonts: formatConjunctionList(note.families)
        });
      case "font_only_deck_characters":
        return (0, runtime2.formatMessage)({
          defaultMessage: "此文件中的字体 {family} 仅包含此文稿用到的字符；之后添加的文字可能以替代字体显示",
          id: "bcFontDeckCharacters"
        }, {
          family: note.family
        });
      case "fonts_held_back":
        return (0, runtime2.formatMessage)({
          defaultMessage: "出于许可原因，字体 {fonts} 未包含在文件中；相关文字仅在联网时保留该字体",
          id: "hqBAi1Ziam"
        }, {
          n: note.families.length,
          fonts: formatConjunctionList(note.families)
        });
    }
  }
  return bindRuntimeValue(runtime2, "formatConjunctionList", () => formatConjunctionList, (value) => {
    formatConjunctionList = value;
  }), bindRuntimeValue(runtime2, "formatShortConjunctionList", () => formatShortConjunctionList, (value) => {
    formatShortConjunctionList = value;
  }), bindRuntimeValue(runtime2, "formatNarrowList", () => formatNarrowList, (value) => {
    formatNarrowList = value;
  }), bindRuntimeValue(runtime2, "fontLeftOutMessage", () => fontLeftOutMessage), bindRuntimeValue(runtime2, "altTextOrPlaceholder", () => altTextOrPlaceholder, (value) => {
    altTextOrPlaceholder = value;
  }), bindRuntimeValue(runtime2, "exportTargetMessageValues", () => exportTargetMessageValues, (value) => {
    exportTargetMessageValues = value;
  }), bindRuntimeValue(runtime2, "exportNoteMessage", () => exportNoteMessage), () => {
    formatConjunctionList = (items) => new Intl.ListFormat((0, runtime2.intlLocale)("ListFormat", "en-GB"), {
      type: "conjunction"
    }).format(items), formatShortConjunctionList = (items) => formatConjunctionList(items.length > 4 ? [
      ...items.slice(0, 3),
      (0, runtime2.formatMessage)({
        defaultMessage: "另外 {n} 个",
        id: "vyKHHF+I0w"
      }, {
        n: items.length - 3
      })
    ] : items), formatNarrowList = (items) => new Intl.ListFormat((0, runtime2.intlLocale)("ListFormat", "en-GB"), {
      type: "conjunction",
      style: "narrow"
    }).format(items), altTextOrPlaceholder = (alt) => alt || (0, runtime2.formatMessage)({
      defaultMessage: "（无替代文字）",
      id: "44JQTltzk5"
    }), exportTargetMessageValues = (target) => ({
      what: target.what,
      alt: target.what === "image" ? altTextOrPlaceholder(target.alt) : "",
      slide: target.what === "box" ? String(target.slide) : ""
    });
  };
}
export {
  installDeliveryExportNoteMessages
};
