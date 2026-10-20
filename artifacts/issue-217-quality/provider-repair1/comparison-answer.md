```html
<style>
.viz-compare { font-family: inherit; color: var(--foreground); max-width: 720px; }
.viz-compare svg { width: 100%; height: auto; display: block; }
.viz-compare .axis { stroke: var(--border); stroke-width: 1; }
.viz-compare .tick-label { fill: var(--muted-foreground); font-size: 11px; }
.viz-compare .line-a { stroke: var(--viz-series-1); stroke-width: 2.5; fill: none; }
.viz-compare .line-b { stroke: var(--viz-series-2); stroke-width: 2.5; fill: none; }
.viz-compare .region-label { fill: var(--muted-foreground); font-size: 11px; }
.viz-compare .cross { stroke: var(--foreground); stroke-width: 1; stroke-dasharray: 4 3; }
.viz-compare .legend { font-size: 12px; fill: var(--foreground); }
</style>

<figure class="viz-compare" role="img" aria-label="每月成本对比折线图：甲方案100加2元每次，乙方案5元每次，交叉点约33.3次">
<svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">
  <!-- plot area: x from 70 to 600 (0..100 uses), y from 40 to 340 (0..600 yuan) -->
  <!-- gridlines -->
  <line class="axis" x1="70" y1="340" x2="600" y2="340"/>
  <line class="axis" x1="70" y1="40" x2="70" y2="340"/>
  <!-- y ticks: 0,150,300,450,600 -->
  <line class="axis" x1="66" y1="340" x2="70" y2="340"/>
  <text class="tick-label" x="62" y="344" text-anchor="end">0</text>
  <line class="axis" x1="66" y1="265" x2="70" y2="265"/>
  <text class="tick-label" x="62" y="269" text-anchor="end">150</text>
  <line class="axis" x1="66" y1="190" x2="70" y2="190"/>
  <text class="tick-label" x="62" y="194" text-anchor="end">300</text>
  <line class="axis" x1="66" y1="115" x2="70" y2="115"/>
  <text class="tick-label" x="62" y="119" text-anchor="end">450</text>
  <line class="axis" x1="66" y1="40" x2="70" y2="40"/>
  <text class="tick-label" x="62" y="44" text-anchor="end">600元</text>
  <!-- x ticks -->
  <text class="tick-label" x="70" y="358" text-anchor="middle">0</text>
  <line class="axis" x1="207.5" y1="340" x2="207.5" y2="344"/>
  <text class="tick-label" x="207.5" y="358" text-anchor="middle">25</text>
  <line class="axis" x1="345" y1="340" x2="345" y2="344"/>
  <text class="tick-label" x="345" y="358" text-anchor="middle">50</text>
  <line class="axis" x1="482.5" y1="340" x2="482.5" y2="344"/>
  <text class="tick-label" x="482.5" y="358" text-anchor="middle">75</text>
  <line class="axis" x1="600" y1="340" x2="600" y2="344"/>
  <text class="tick-label" x="600" y="358" text-anchor="middle">100次</text>
  <!-- cheaper-region shading: B cheaper until x=33.3 -->
  <rect x="70" y="40" width="212.7" height="300" fill="var(--viz-series-2)" opacity="0.07"/>
  <rect x="282.7" y="40" width="317.3" height="300" fill="var(--viz-series-1)" opacity="0.07"/>
  <text class="region-label" x="160" y="335">乙更便宜</text>
  <text class="region-label" x="450" y="335">甲更便宜</text>
  <!-- crossover: x = 100/3 ≈ 33.3 → px 282.7, y = 166.7 → py 253.3 -->
  <line class="cross" x1="282.7" y1="253.3" x2="282.7" y2="340"/>
  <line class="cross" x1="70" y1="253.3" x2="282.7" y2="253.3"/>
  <circle cx="282.7" cy="253.3" r="5" fill="var(--foreground)"/>
  <text class="tick-label" x="282.7" y="238" text-anchor="middle">交叉点 ≈ 33.3 次 / 约166.7元</text>
  <!-- lines -->
  <!-- A: y = 100 + 2x, 0..100 → (70,293.3)..(600,157.3)? scale: 300px / 600元 → y=340-0.5*cost -->
  <line class="line-a" x1="70" y1="290" x2="600" y2="40"/>
  <!-- A endpoints: cost 100 → py 290; cost 300 → py 190... 100+200=300 → 190. fix: (70,290)-(600,190) -->
  <line class="line-a" x1="70" y1="290" x2="600" y2="190"/>
  <!-- B: y = 5x, cost 0..500 → (70,340)-(600,90) -->
  <line class="line-b" x1="70" y1="340" x2="600" y2="90"/>
  <!-- legend -->
  <line class="line-a" x1="90" y1="58" x2="120" y2="58"/>
  <text class="legend" x="126" y="62">甲：100 + 2×次数</text>
  <line class="line-b" x1="90" y1="78" x2="120" y2="78"/>
  <text class="legend" x="126" y="82">乙：5×次数</text>
</svg>
</figure>
```