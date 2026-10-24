# Frozen before connecting the cache

Recorded after baseline run `01a16ca6-c879-7a3a-a9c7-65177e34b092` (1/1 passed,
19.11s; 22.15s total). Fixed host `0d1271a0cf92b22e01b456c7473f4e446027bd28`,
Node22.23.3, installed official engine0.12.0/e2e0.17.0, Chromium153,1280×900,DPR1.
All samples use the same synthetic API and real pinned renderer bytes. Clock
starts when opening an already saved/delivered fixture in the loaded app.
Generation/save/delivery and production timing remain **not measured**.

| Scenario | Before actual SVG paint ms | Before ready ms | Before control result from open ms | Fixed after budgets: paint / ready / control ms |
| --- | --- | --- | --- | --- |
| Normal cold static,2 samples |657.7,530.9|718.6,546.3|N/A|900 /950 /N/A|
| Normal cold interactive,2 samples |489.2,620.0|545.5,645.1|693.4,823.5|900 /950 /1150|
|300ms resource+state cold static,2 samples |1553.6,1749.6|1568.0,1762.0|N/A|1950 /2000 /N/A|
|300ms resource+state cold interactive,2 samples |1515.7,1398.3|1535.7,1416.7|1623.4,1538.3|1950 /2000 /2200|
|Warm new page,1 sample |1210.5|1192.8|1346.1|850 /850 /1050|
|Retained return,1 sample |58.1|14.6|100.5|180 /100 /300|
|Cold first visible of3,1 sample |1828.3|2055.8|2160.9|2400 /2600 /2800|

Warm new-page paint and ready must also fall at least25% from that measured
baseline, with **zero** new fixed-resource GETs/bytes; admission and the fresh
state GET must remain. Retained return must retain its frame ID, prior count1,
zero new resource GETs and zero SDK initialization. Ordinary new pages need one
SDK initialization and their own admission/state checks. Control save/result
latency must stay below100ms (baseline raw values11.1–25.8ms); opening-to-result
includes the harness's real native input scheduling, so report that separately.

Each normal/cold case starts a new document to clear volatile resource bytes.
The warm and retained cases stay in one document. The cold multi-card baseline
transferred18 resources,3,541,743 bytes and initialized3 SDKs; single pages
transferred6 resources,1,180,581 bytes and initialized1 SDK. These are observed
request paths; no future in-flight deduplication is assumed.

Bounds are acceptance targets, not observations. Report raw before/after values,
check material changes within those bounds, and explain any regression. These
small samples do not support production P50/P95. Preserve the failed initial
fixture selector run; it preceded this successful baseline and used a Playwright
pseudo-selector inside native querySelector, corrected without product changes.
