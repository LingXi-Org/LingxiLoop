// Adapted from Caho1/open-claude-ui (MIT), c1f923ae0051a871941b98a0e2e3183a545e6a85.
// Original mask/thresholds retained. See THIRD_PARTY_NOTICES.md and public/licenses/open-claude-ui.txt.
import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * ==============================================================================
 * Claude Design System (CDS) - ScrollFadeContainer.tsx
 * 
 * 逆向还原自官方 Claude Desktop / Web 边缘平滑渐变遮罩系统 (REA v6.5.0 取证):
 * - `frame-shell-chrome-CAw-tYzh.js`: --cds-scroll-fade-size (28px) / --cds-scroll-fade-top-raw / active flags
 * - `c6a992d55-sXiDGMFQ.css`: 7 档非线性 Alpha 渐变遮罩 (7-Stop Non-Linear Alpha Mask)
 * 
 * 核心视觉物理学:
 * 1. 官方 7 档非线性透明度遮罩 (7-Stop Non-Linear Alpha Mask):
 *    Claude 没有采用粗暴的双色透明切线，而是在 28px 羽化距离内精确采用 7 组非线性梯度采样：
 *    - 距离位置 (Stops): 0%, 15%, 30%, 45%, 60%, 75%, 87%, 100%
 *    - 实际 Alpha 序列: transparent -> #0000000d (.15) -> #00000026 (.30) -> #0000004d (.45)
 *      -> #00000080 (.60) -> #000000b3 (.75) -> #000000d9 (.87) -> #000 (1.0)
 *    紧密贴合 y ≈ x^1.5 幂律感知曲线，彻底消除现代高分辨率屏上的色阶断层 (Color Banding)。
 * 2. 动态滚动位置传感器 (Scroll State Sensor):
 *    - 触顶时 (`scrollTop <= 2`)：`--cds-scroll-fade-top = 0px`，顶边缘恢复完全清晰；
 *    - 滚入内容时：平滑激活 28px 羽化边缘；
 *    - 触底时 (`scrollTop + clientHeight >= scrollHeight - 2`)：`--cds-scroll-fade-bottom = 0px`。
 * 3. 垂直 (Vertical) 与水平 (Horizontal) 双轴自适应支持。
 * ==============================================================================
 */

export interface ScrollFadeContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  orientation?: 'vertical' | 'horizontal' | 'both';
  fadeSize?: number; // 默认 28px (官方常量 --cds-scroll-fade-size)
  className?: string;
  style?: React.CSSProperties;
}

export const ScrollFadeContainer = React.forwardRef<HTMLDivElement, ScrollFadeContainerProps>(({
  children,
  orientation = 'vertical',
  fadeSize = 28,
  className = '',
  style = {},
  onScroll,
  ...props
}, forwardedRef) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const setRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    if (typeof forwardedRef === 'function') return forwardedRef(el);
    if (forwardedRef) forwardedRef.current = el;
  }, [forwardedRef]);

  // 遮罩生效状态
  const [fadeTop, setFadeTop] = useState(0);
  const [fadeBottom, setFadeBottom] = useState(0);
  const [fadeLeft, setFadeLeft] = useState(0);
  const [fadeRight, setFadeRight] = useState(0);

  // 核心滚动边界检测
  const updateScrollFades = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (orientation === 'vertical' || orientation === 'both') {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const isAtTop = scrollTop <= 2;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 2;

      setFadeTop(isAtTop ? 0 : fadeSize);
      setFadeBottom(isAtBottom ? 0 : fadeSize);
    }

    if (orientation === 'horizontal' || orientation === 'both') {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const isAtLeft = scrollLeft <= 2;
      const isAtRight = scrollLeft + clientWidth >= scrollWidth - 2;

      setFadeLeft(isAtLeft ? 0 : fadeSize);
      setFadeRight(isAtRight ? 0 : fadeSize);
    }
  }, [orientation, fadeSize]);

  useEffect(() => {
    updateScrollFades();
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(updateScrollFades);
    ro.observe(el);
    // A fixed viewport does not resize when a streamed answer/image grows.
    const observeContent = () => {
      ro.disconnect();
      ro.observe(el);
      for (const child of el.children) ro.observe(child);
      updateScrollFades();
    };
    observeContent();
    const mo = new MutationObserver(observeContent);
    mo.observe(el, { childList: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [updateScrollFades]);

  // 构建反编译自 Claude 的精密 7-Stop 渐变 Mask 规则 (REA 取证自 c6a992d55-sXiDGMFQ.css)
  const maskStyle = React.useMemo(() => {
    if (orientation === 'vertical') {
      const vGradient = `linear-gradient(to bottom,
        transparent,
        #0000000d calc(var(--cds-scroll-fade-top) * 0.15),
        #00000026 calc(var(--cds-scroll-fade-top) * 0.3),
        #0000004d calc(var(--cds-scroll-fade-top) * 0.45),
        #00000080 calc(var(--cds-scroll-fade-top) * 0.6),
        #000000b3 calc(var(--cds-scroll-fade-top) * 0.75),
        #000000d9 calc(var(--cds-scroll-fade-top) * 0.87),
        #000 var(--cds-scroll-fade-top),
        #000 calc(100% - var(--cds-scroll-fade-bottom)),
        #000000d9 calc(100% - var(--cds-scroll-fade-bottom) * 0.87),
        #000000b3 calc(100% - var(--cds-scroll-fade-bottom) * 0.75),
        #00000080 calc(100% - var(--cds-scroll-fade-bottom) * 0.6),
        #0000004d calc(100% - var(--cds-scroll-fade-bottom) * 0.45),
        #00000026 calc(100% - var(--cds-scroll-fade-bottom) * 0.3),
        #0000000d calc(100% - var(--cds-scroll-fade-bottom) * 0.15),
        transparent)`;

      return {
        maskImage: vGradient,
        WebkitMaskImage: vGradient,
      };
    }

    if (orientation === 'horizontal') {
      const hGradient = `linear-gradient(to right,
        transparent,
        #0000000d calc(var(--cds-scroll-fade-left) * 0.15),
        #00000026 calc(var(--cds-scroll-fade-left) * 0.3),
        #0000004d calc(var(--cds-scroll-fade-left) * 0.45),
        #00000080 calc(var(--cds-scroll-fade-left) * 0.6),
        #000000b3 calc(var(--cds-scroll-fade-left) * 0.75),
        #000000d9 calc(var(--cds-scroll-fade-left) * 0.87),
        #000 var(--cds-scroll-fade-left),
        #000 calc(100% - var(--cds-scroll-fade-right)),
        #000000d9 calc(100% - var(--cds-scroll-fade-right) * 0.87),
        #000000b3 calc(100% - var(--cds-scroll-fade-right) * 0.75),
        #00000080 calc(100% - var(--cds-scroll-fade-right) * 0.6),
        #0000004d calc(100% - var(--cds-scroll-fade-right) * 0.45),
        #00000026 calc(100% - var(--cds-scroll-fade-right) * 0.3),
        #0000000d calc(100% - var(--cds-scroll-fade-right) * 0.15),
        transparent)`;

      return {
        maskImage: hGradient,
        WebkitMaskImage: hGradient,
      };
    }

    return {};
  }, [orientation]);

  return (
    <div
      {...props}
      ref={setRef}
      onScroll={(event) => { updateScrollFades(); onScroll?.(event); }}
      data-cds-scroll-fade={orientation}
      className={`relative overflow-auto motion-safe:transition-[mask-image] motion-safe:duration-150 ${className}`}
      style={
        {
          ...style,
          ...maskStyle,
          '--cds-scroll-fade-size': `${fadeSize}px`,
          '--cds-scroll-fade-top': `${fadeTop}px`,
          '--cds-scroll-fade-bottom': `${fadeBottom}px`,
          '--cds-scroll-fade-left': `${fadeLeft}px`,
          '--cds-scroll-fade-right': `${fadeRight}px`,
        } as React.CSSProperties & Record<`--${string}`, string>
      }
    >
      {children}
    </div>
  );
});
ScrollFadeContainer.displayName = 'ScrollFadeContainer';

