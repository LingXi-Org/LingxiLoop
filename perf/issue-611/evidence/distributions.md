# Measured distributions

Times are milliseconds. Quantiles use nearest rank; each arm has ten samples.

## design

| Scenario | Arm | Visible p50 / p75 / p95 | Usable p50 / p75 / p95 | Wire bytes p50 | Requests / transferred p50 |
|---|---|---:|---:|---:|---:|
| cold | baseline | 13076 / 13127 / 13484 | 13245 / 13283 / 13696 | 2,901,431 | 12 / 11 |
| cold | candidate | 6542 / 6749 / 7064 | 6724 / 6933 / 7446 | 2,446,667 | 14 / 12 |
| reopen | baseline | 140 / 151 / 317 | 197 / 208 / 366 | 0 | 0 / 0 |
| reopen | candidate | 135 / 150 / 180 | 196 / 207 / 249 | 0 | 0 / 0 |
| warm | baseline | 12691 / 12909 / 13237 | 12841 / 13070 / 13437 | 2,898,064 | 11 / 10 |
| warm | candidate | 1066 / 1140 / 1223 | 1183 / 1283 / 1342 | 6,467 | 13 / 7 |
| refresh | baseline | 13128 / 13306 / 13909 | 13288 / 13541 / 14146 | 2,898,395 | 12 / 11 |
| refresh | candidate | 1379 / 1434 / 1460 | 1507 / 1588 / 2822 | 6,798 | 14 / 8 |

## visualize

| Scenario | Arm | Visible p50 / p75 / p95 | Usable p50 / p75 / p95 | Wire bytes p50 | Requests / transferred p50 |
|---|---|---:|---:|---:|---:|
| cold | baseline | 1399 / 1552 / 1762 | 1566 / 1807 / 1955 | 426,301 | 8 / 8 |
| cold | candidate | 1370 / 1455 / 1652 | 1544 / 1620 / 1820 | 426,301 | 8 / 8 |
| reopen | baseline | 56 / 62 / 64 | 214 / 219 / 291 | 396 | 1 / 1 |
| reopen | candidate | 60 / 66 / 122 | 220 / 233 / 291 | 396 | 1 / 1 |
| warm | baseline | 356 / 422 / 574 | 506 / 570 / 722 | 2,736 | 4 / 4 |
| warm | candidate | 364 / 428 / 1004 | 513 / 580 / 1246 | 2,736 | 4 / 4 |
| refresh | baseline | 482 / 505 / 1145 | 643 / 729 / 1281 | 2,808 | 8 / 4 |
| refresh | candidate | 474 / 498 / 678 | 640 / 652 / 925 | 2,807 | 8 / 4 |

`requestStarts` includes cached requests and unfinished event streams. Wire bytes include response headers and only completed responses before usability. Host CPU/heap is diagnostic, not whole-browser CPU/retained memory; raw frame long-task lists are cumulative on reopen.
