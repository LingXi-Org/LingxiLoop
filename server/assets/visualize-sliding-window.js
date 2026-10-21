(() => {
  const root = document.currentScript.previousElementSibling;
  const config = JSON.parse(root.querySelector('[data-window-config]').textContent);
  const row = root.querySelector('[data-window-row]');
  const packets = Array.from(root.querySelectorAll('[data-packet]'));
  const slider = root.querySelector('input');
  const next = root.querySelector('[data-window-next]');
  const play = root.querySelector('[data-window-play]');
  const reset = root.querySelector('[data-window-reset]');
  let base = 0, size = config.windowSize, inflight = false, timer = null;
  const end = () => Math.min(packets.length, base + size);
  const range = window.lingxiVisualize.bindRangeOverlay(row, root.querySelector('[data-window-outline]'), () => packets.slice(base, end()));
  function stop() {
    clearInterval(timer);
    timer = null;
    play.textContent = '自动播放';
    play.setAttribute('aria-pressed', 'false');
  }
  function render() {
    root.dataset.base = String(base);
    root.dataset.windowSize = String(size);
    for (const [index, packet] of packets.entries()) {
      const active = index >= base && index < end();
      const state = index < base ? 'acked' : active ? inflight ? 'inflight' : 'ready' : 'waiting';
      packet.dataset.inWindow = String(active);
      packet.dataset.packetState = state;
      packet.setAttribute('aria-label', `${index}：${{ acked: '已确认', inflight: '已发送未确认', ready: '窗口内可发送', waiting: '窗口外等待' }[state]}`);
    }
    root.querySelector('[data-window-size]').textContent = String(size);
    root.querySelector('[data-window-range]').textContent = base === packets.length ? '全部已确认' : `窗口 [base=${base}, ${end() - 1}]`;
    root.querySelector('[data-window-phase]').textContent = base === packets.length ? '传输完成' : inflight ? '等待确认；下一步确认本窗口' : '下一步发送本窗口';
    next.disabled = play.disabled = base === packets.length;
    if (base === packets.length) stop();
    // Synchronous after state/DOM updates: the next paint shares one range.
    range.update();
  }
  function advance() {
    if (base === packets.length) return;
    if (inflight) { base = end(); inflight = false; } else inflight = true;
    render();
  }
  next.addEventListener('click', advance);
  play.addEventListener('click', () => {
    if (timer !== null) { stop(); return; }
    play.textContent = '暂停';
    play.setAttribute('aria-pressed', 'true');
    timer = setInterval(advance, 700);
  });
  function restart() { stop(); base = 0; inflight = false; render(); }
  reset.addEventListener('click', restart);
  slider.addEventListener('input', () => { size = Number(slider.value); restart(); });
  window.addEventListener('pagehide', () => { stop(); range.destroy(); }, { once: true });
  render();
})();
