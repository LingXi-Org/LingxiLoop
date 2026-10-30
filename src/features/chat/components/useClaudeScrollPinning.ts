/**
 * Adapted from Caho1/open-claude-ui, MIT, commit
 * c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/useClaudeScrollPinning.ts.
 * See public/licenses/open-claude-ui.txt and THIRD_PARTY_NOTICES.md.
 * 维度一：流式大文本输出与滚动视口物理学
 * 逆向还原自 Claude Desktop: ca2ef848d-Dz47ULRM.js
 * 
 * 核心特性：
 * 1. 150ms 用户输入冷却窗口 (performance.now() - lastUserInputAt > 150)
 * 2. 40px 底部容差与图钉锁定
 * 3. 35vh 底部缓冲区 (--chat-extra-space)
 * 4. behavior: "auto" 防抖非平滑瞬时对齐
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export function useClaudeScrollPinning(dependencies: readonly unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPinned, setIsPinned] = useState(true);
  const [showJumpControl, setShowJumpControl] = useState(false);
  const lastUserInputAt = useRef(-Infinity);
  // Refs make input/selection intent effective before React's next render.
  const pinnedRef = useRef(true);
  const readingLock = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const programmaticScroll = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (programmaticScroll.current !== null) {
      const expected = programmaticScroll.current;
      programmaticScroll.current = null;
      if (Math.abs(el.scrollTop - expected) <= 2) return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // 40px 底部边缘吸附容差
    const pinned = !readingLock.current && distanceFromBottom <= 40;
    pinnedRef.current = pinned;
    setIsPinned(pinned);
    // 离开底部超过 120px 时显示“跳至最新”悬浮按钮
    setShowJumpControl(distanceFromBottom > 120);
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    clearTimeout(cooldownTimer.current);
    readingLock.current = false;
    pinnedRef.current = true;
    lastUserInputAt.current = -Infinity;
    programmaticScroll.current = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto'
    });
    setIsPinned(true);
    setShowJumpControl(false);
  }, []);

  const followGrowth = useCallback(() => {
    // 150ms 冷却保护窗口：用户刚触摸/滚轮时不抢夺视口
    if (performance.now() - lastUserInputAt.current <= 150) return;
    if (pinnedRef.current) {
      scrollToBottom(false);
    } else {
      const el = containerRef.current;
      if (el) setShowJumpControl(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
    }
  }, [scrollToBottom]);

  // 用户主动滚轮、触摸、键盘输入时立即释放锁定
  const markUserInput = useCallback(() => {
    lastUserInputAt.current = performance.now();
    programmaticScroll.current = null;
    readingLock.current = false;
    pinnedRef.current = false;
    setIsPinned(false);
    clearTimeout(cooldownTimer.current);
    const el = containerRef.current;
    const inputTop = el?.scrollTop;
    const wasAtBottom = el && el.scrollHeight - el.scrollTop - el.clientHeight <= 40;
    cooldownTimer.current = setTimeout(() => {
      // End/wheel-down/touch at the bottom may emit no scroll event. If the
      // reader hasn't moved, restore following even if tokens grew meanwhile.
      if (!readingLock.current && wasAtBottom && el.scrollTop === inputTop) {
        pinnedRef.current = true;
        setIsPinned(true);
      } else {
        handleScroll();
      }
      followGrowth();
    }, 151);
  }, [followGrowth, handleScroll]);

  // Selection, disclosures and explicit navigation stay paused until a scroll
  // gesture or the jump control; a layout/anchor correction must not resume them.
  const pauseFollowing = useCallback(() => {
    markUserInput();
    readingLock.current = true;
  }, [markUserInput]);

  // The message column changes independently of thread chrome during streaming.
  // Observe both it and the viewport (images, math, details and window resize).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(followGrowth);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [followGrowth]);

  // New conversation/thread scopes start pinned; ordinary content growth uses
  // the observer above, without subscribing the whole thread to every token.
  useEffect(() => {
    scrollToBottom(false);
    return () => clearTimeout(cooldownTimer.current);
  }, dependencies);

  return {
    containerRef,
    isPinned,
    showJumpControl,
    markUserInput,
    pauseFollowing,
    handleScroll,
    scrollToBottom
  };
}

