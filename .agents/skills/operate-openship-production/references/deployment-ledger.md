# OpenShip deployment ledger

The historical ledger began with 72 live API records on 2026-09-02 and was extended through the first-release reset on 2026-09-03. With explicit authorization, the debugging histories for the six LingxiLoop projects were removed from live OpenShip after a management-database backup; older `Active` markers below now exist only in this audit record and the backup, not as live rollback targets. Timestamps are UTC unless stated otherwise.

The conversation also contained `dep_hTwrgkuYccZOs8QT`, but OpenShip returned `NOT_FOUND`; it was a mistyped/nonexistent ID and is not part of the 72-record ledger. Raw-session truncation also produced the partial strings `dep_LGTbj5TasJJbtAu` and `dep_g9i`; their complete real IDs are `dep_LGTbj5TasJJbtAu3` and `dep_g9ieyTk2UUOOcWZi` below.

## 2026-09-03 normalized full release — current active

All six deployments are `ready` at manifest commit `df724bc4228af374bd8b82e8e9b24a887b45286e`, use the complete five-image tag `99f2e43cbba78b2ba01dbb9064e0339eac6aad67`, and display the same OpenShip version.

| Project | Deployment | Version |
| --- | --- | ---: |
| `lingxiloop-core-state` | `dep_iT9yKagEJZx5c7Kk` | 2 |
| `lingxiloop-app-a` | `dep_76nu6qPPVvEpHVLg` | 2 |
| `lingxiloop-agent-os-a` | `dep_T4c4yznrw7z_g3D4` | 2 |
| `lingxiloop-app-b` | `dep_OKH5Ee2REEGuftcD` | 2 |
| `lingxiloop-knowledge-agent` | `dep_jLGk3jFOk99ykWkm` | 2 |
| `lingxiloop-agent-os-b` | `dep_T-G8p8aSNq4nvdY6` | 2 |

The retained version-1 baseline was manifest commit `99f2e43cbba78b2ba01dbb9064e0339eac6aad67`: core `dep_pqbaWTDw-aTzDqZx`, app-a `dep_ioxWXXKuxE3CDrjj`, agent-a `dep_coTKLKTog3ElJtMp`, app-b `dep_B2l8n31CH1vGauBN`, knowledge `dep_0e5mHC5ZRkkvAcqI`, and agent-b `dep_dnSWx6ddYkl6oN_O`. The preceding debugging records were removed only after copying the 57 MB PGlite directory to `/root/.openship/backups/20260903T1230-openship-pglite`.

Manual workflow `33715749321` rebuilt all five images, committed their pins as `df724bc...`, and proved that the corrected manifest-commit idempotency key creates six distinct deployments even when the source commit has been released before.

## Historical first-release records

Knowledge refreshes `dep_eiMcQJR2WmVl-Hmh`, `dep_1ZwHHKT8QRYgUKrE`, `dep_qkKchykS23YHND6y`, and `dep_MOvkcixxvGaZJTBw` were intermediate ready deployments while the stale service environment was reconciled; `dep_Kc4eqjfeLBSUYFly` is final.

The immediately preceding partial-cohort fanout at commit `761b59402fc4679ee06812a7a3997d16c5616db8` created core `dep_rQzT7dYyhORVSr8k`, app-a `dep_uV9cdt06eMP4uivL`, agent-a `dep_5q58DsNj1e7WwLdB`, app-b `dep_sFFIqqVzFcCz5Wks`, knowledge `dep_WJvuHMm_aVFZgbyq`, and agent-b `dep_a2QhnT4OwmTnvOkK`. It is historical because only Server and AgentOS images existed for its proposed image cohort.

## 2026-09-02T17:07Z signed CD fanout

Workflow `33658014092` promoted source `524beb46a0a39be3c69c1cd2451b53c35f45dcc6`, committed manifest `0460841394302f76d679aebc5353cff5ce2b13de`, and created the following six deployments; all reached `ready`:

| Project | Deployment |
| --- | --- |
| `lingxiloop-core-state` | `dep_GeAUdSVpldW6LNRD` |
| `lingxiloop-app-a` | `dep_qlKP1V0lMh0yjsXH` |
| `lingxiloop-agent-os-a` | `dep_C0ox7Sw407lONBtY` |
| `lingxiloop-app-b` | `dep_yOM4BtA2YvqjUPic` |
| `lingxiloop-knowledge-agent` | `dep_UiPZycPWNjbjpHAR` |
| `lingxiloop-agent-os-b` | `dep_ck_23dItvF6bMiLy` |

These records prove the release hook fanout. Service-row drift still left WuKongIM on `ed4d749c...` and API-A, Open Notebook, and Gateway on `53572c0e...`; do not treat project `ready` as proof that every service accepted the manifest image.

## lingxiloop-app-b

| Created UTC | Deployment | State | Version | Commit | Active |
| --- | --- | --- | ---: | --- | --- |
| 2026-09-02T09:15:25.760Z | `dep_R960GmuHe-jmzc6K` | ready | 12 | `347a4dfdde6ab751dfe16cd4195df0c1dcb2e6d0` | yes |
| 2026-09-02T08:34:33.058Z | `dep_U72S08mMAro7bKm0` | ready | 12 | `347a4dfdde6ab751dfe16cd4195df0c1dcb2e6d0` |  |
| 2026-09-02T07:21:35.946Z | `dep_LGTbj5TasJJbtAu3` | ready | 11 | `4ba9116c2f9eed26eb863218f9f1e6eda67fe23f` |  |
| 2026-09-02T05:24:58.437Z | `dep_tHsu1PGPzxmRAVuy` | failed | — | `cbe81c0173c4a16d86e23a64d8194e69fe9f162e` |  |
| 2026-09-02T05:22:43.502Z | `dep_PIzP3h_8Td1rIENx` | failed | — | `cbe81c0173c4a16d86e23a64d8194e69fe9f162e` |  |
| 2026-09-02T05:05:46.153Z | `dep_HAjNCNBdJdihQCeI` | cancelled | — | `e409455157529a2cfe2d1bf4cfefd0cfb6fe4f29` |  |
| 2026-09-02T04:58:40.192Z | `dep_zgC4ddpChIrjmZsK` | cancelled | — | `e9d82fc7feab6b97f8210c0e61af646e5fd2d4d3` |  |
| 2026-09-02T04:54:30.752Z | `dep_zfIEv5ykBfszedOL` | cancelled | — | `e9d82fc7feab6b97f8210c0e61af646e5fd2d4d3` |  |
| 2026-09-02T02:46:21.730Z | `dep_6zyGSl_WN9ysi6ia` | ready | 10 | `3d608b9e8e4bfb90203e1770029bda3b14b9f8ec` |  |
| 2026-09-02T02:09:47.830Z | `dep_NPWGuQJ_1iFh3Yke` | ready | 9 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-02T02:06:54.147Z | `dep_dwMdyISXgBmGIQ4R` | ready | 9 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-02T01:22:10.340Z | `dep_recnf2750TtnL7ok` | ready | 8 | — |  |
| 2026-09-02T01:16:46.400Z | `dep_2Hfeau8f9zplsesM` | ready | 7 | — |  |
| 2026-09-01T17:16:05.953Z | `dep_p8SsTmwhbbVAFpv1` | ready | 6 | — |  |
| 2026-09-01T17:02:15.191Z | `dep_l78NUIOiP7mR-lnl` | ready | 5 | — |  |
| 2026-09-01T15:49:14.034Z | `dep_Won2DW5wdiTWVRCi` | ready | 4 | — |  |
| 2026-09-01T14:45:57.020Z | `dep_9mc7D-pKN5A2eCcm` | ready | 3 | — |  |
| 2026-09-01T13:37:39.034Z | `dep_tyhDLQBT-v8kbQE9` | ready | 2 | — |  |
| 2026-09-01T13:19:05.405Z | `dep_kQQJ8pyr1hXjRISt` | ready | 1 | `65b1f75a783553d612ba2e2186683ce330f39e77` |  |

## lingxilit-shanghai-b

| Created UTC | Deployment | State | Version | Commit | Active |
| --- | --- | --- | ---: | --- | --- |
| 2026-09-02T09:02:27.797Z | `dep_mFw8ULd3cELQsl8n` | ready | 1 | `986b6d2c717d9b0cb3e1c9e9e66db70ac8a6956f` | yes |
| 2026-09-01T16:13:31.799Z | `dep_T4P5UgIYyta9PwHN` | failed | — | `986b6d2c717d9b0cb3e1c9e9e66db70ac8a6956f` |  |
| 2026-09-01T16:07:38.127Z | `dep_3XI7oVWiWhDeg9j6` | cancelled | — | `986b6d2c717d9b0cb3e1c9e9e66db70ac8a6956f` |  |
| 2026-09-01T16:01:28.138Z | `dep_HNzVVtTouANHtR50` | failed | — | `986b6d2c717d9b0cb3e1c9e9e66db70ac8a6956f` |  |
| 2026-09-01T16:00:45.884Z | `dep_2EtvphZto9Ewc_ed` | failed | — | — |  |
| 2026-09-01T15:54:53.142Z | `dep_g9ieyTk2UUOOcWZi` | cancelled | — | — |  |

## lingxiloop-agent-os-a

| Created UTC | Deployment | State | Version | Commit | Active |
| --- | --- | --- | ---: | --- | --- |
| 2026-09-02T08:56:47.098Z | `dep_0R0T0m83Vv2lE29J` | ready | 1 | `347a4dfdde6ab751dfe16cd4195df0c1dcb2e6d0` | yes |

## lingxiloop-agent-os-b

| Created UTC | Deployment | State | Version | Commit | Active |
| --- | --- | --- | ---: | --- | --- |
| 2026-09-02T08:56:39.239Z | `dep_UDLZKZ91Wijn0YOO` | ready | 1 | `347a4dfdde6ab751dfe16cd4195df0c1dcb2e6d0` | yes |

## lingxiloop-knowledge-agent

| Created UTC | Deployment | State | Version | Commit | Active |
| --- | --- | --- | ---: | --- | --- |
| 2026-09-02T08:54:32.710Z | `dep_WeDKAiQ_pa6Pr_gl` | ready | 14 | `347a4dfdde6ab751dfe16cd4195df0c1dcb2e6d0` | yes |
| 2026-09-02T02:27:43.866Z | `dep_2LkBFmKy_igPr65n` | ready | 13 | `3d608b9e8e4bfb90203e1770029bda3b14b9f8ec` |  |
| 2026-09-02T02:21:52.270Z | `dep_z7qzIyy3ldVBlfKF` | ready | 12 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-02T02:19:09.978Z | `dep_S1TNvw2qJgL8M0jd` | ready | 12 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-02T02:15:56.126Z | `dep_oYJaNwIlKcq5uAKo` | ready | 12 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-02T02:11:47.242Z | `dep_57OUAOCtz7PdlrdX` | ready | 12 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-02T01:17:59.768Z | `dep_ytB-xVWuPCmYzXcM` | ready | 11 | — |  |
| 2026-09-01T23:48:14.922Z | `dep_1JFaTXqV7L65l6LH` | ready | 10 | — |  |
| 2026-09-01T23:47:30.771Z | `dep_tne3QPIsOFUdxKRS` | ready | 9 | — |  |
| 2026-09-01T17:52:57.241Z | `dep_vZTBaRkMBNix1sUh` | ready | 8 | — |  |
| 2026-09-01T17:02:20.145Z | `dep_CZNmRbGUEP8XxZwv` | ready | 7 | — |  |
| 2026-09-01T15:49:19.861Z | `dep_b3Eqp0lITvnww3Ll` | ready | 6 | — |  |
| 2026-09-01T14:47:06.485Z | `dep_ugArmEMbyIOE-Ybu` | ready | 5 | — |  |
| 2026-09-01T13:46:19.348Z | `dep_8VbUgMP9f0GyLvuc` | ready | 4 | — |  |
| 2026-09-01T13:44:47.533Z | `dep_OiDokGL4VDh2tRHd` | ready | 3 | — |  |
| 2026-09-01T13:39:13.045Z | `dep_oHrdSCE71V0i0JLW` | ready | 2 | — |  |
| 2026-09-01T13:17:08.146Z | `dep_ayuhyibJQ9-u53a-` | ready | 1 | `65b1f75a783553d612ba2e2186683ce330f39e77` |  |

## lingxiloop-app-a

| Created UTC | Deployment | State | Version | Commit | Active |
| --- | --- | --- | ---: | --- | --- |
| 2026-09-02T08:52:29.880Z | `dep_cEzO6pQ8mWGDuPYa` | ready | 7 | `347a4dfdde6ab751dfe16cd4195df0c1dcb2e6d0` | yes |
| 2026-09-02T08:51:17.065Z | `dep_H8Arnc-3HFx4uJ05` | ready | 7 | `347a4dfdde6ab751dfe16cd4195df0c1dcb2e6d0` |  |
| 2026-09-02T08:49:33.952Z | `dep_cB3yTARc9rs8FtLn` | ready | 7 | `347a4dfdde6ab751dfe16cd4195df0c1dcb2e6d0` |  |
| 2026-09-02T04:50:48.543Z | `dep_eH51BFdyC141kPnO` | cancelled | 7 | `96dca53f629a7d0336fbe4f8a0f73540cca12fca` |  |
| 2026-09-02T02:46:14.930Z | `dep__N8TGeIs4SzzQimj` | ready | 6 | `3d608b9e8e4bfb90203e1770029bda3b14b9f8ec` |  |
| 2026-09-02T02:05:39.073Z | `dep_TcYaw7EYoBD_DoKY` | ready | 5 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-02T02:02:54.909Z | `dep_2OcdxRkC5u8ZEzW9` | cancelled | 5 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-01T17:02:25.896Z | `dep_VAc7SlxPkFFaxF_K` | ready | 4 | — |  |
| 2026-09-01T15:49:26.018Z | `dep_tspObekRJL4Z1pUk` | ready | 3 | — |  |
| 2026-09-01T13:41:06.404Z | `dep_bA52VKugSVmm2sBA` | ready | 2 | — |  |
| 2026-09-01T13:24:05.535Z | `dep_GBPSutAc7RrGMrsR` | ready | 1 | `65b1f75a783553d612ba2e2186683ce330f39e77` |  |
| 2026-09-01T13:15:12.974Z | `dep_5K_7OqemyLCVFFs_` | ready | 1 | `65b1f75a783553d612ba2e2186683ce330f39e77` |  |

## lingxiloop-core-state

| Created UTC | Deployment | State | Version | Commit | Active |
| --- | --- | --- | ---: | --- | --- |
| 2026-09-02T08:48:56.795Z | `dep_WwFDumx-JjoRBCDI` | ready | 14 | `347a4dfdde6ab751dfe16cd4195df0c1dcb2e6d0` | yes |
| 2026-09-02T04:49:57.515Z | `dep_UDcblHhVeqYI2IB2` | ready | 13 | `96dca53f629a7d0336fbe4f8a0f73540cca12fca` |  |
| 2026-09-02T04:48:26.897Z | `dep_HW29e7qOQK6SJeCq` | ready | 12 | `4b6b77b0aa36a67e61b92dcaefea0fc300093ea0` |  |
| 2026-09-02T04:42:51.823Z | `dep_m6_fkyp3tBtXRBHf` | ready | 12 | `4b6b77b0aa36a67e61b92dcaefea0fc300093ea0` |  |
| 2026-09-02T02:43:35.116Z | `dep_Sl3gohoIQsUYypuU` | ready | 11 | `3d608b9e8e4bfb90203e1770029bda3b14b9f8ec` |  |
| 2026-09-02T02:01:39.253Z | `dep_bWgTBk1RWeprUpHT` | ready | 10 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-02T02:00:38.594Z | `dep_6J5XvleSHmA5XNu4` | ready | 10 | `c215b123f39a1ce5e90756c7afd8579b4b8caad1` |  |
| 2026-09-01T17:02:31.331Z | `dep_Utu_XnLqQbYWyYY7` | ready | 9 | — |  |
| 2026-09-01T15:56:51.934Z | `dep_j0cOxXWQa7_U686u` | ready | 8 | — |  |
| 2026-09-01T15:49:32.564Z | `dep_2F6wInKt-jOGZfel` | ready | 7 | — |  |
| 2026-09-01T15:43:48.084Z | `dep_iH7qg8uOBHGYdV9_` | ready | 6 | — |  |
| 2026-09-01T12:15:49.662Z | `dep_6ewNJYhjajNcKIq6` | ready | 5 | — |  |
| 2026-09-01T12:14:02.377Z | `dep_c_UzJZ0rO_Adq4ln` | ready | 4 | — |  |
| 2026-09-01T12:03:33.442Z | `dep_nmBpf9mEzJexcn5R` | ready | 3 | — |  |
| 2026-09-01T11:39:33.516Z | `dep_Tskm2MJ-K7khevxP` | ready | 2 | — |  |
| 2026-09-01T11:31:44.309Z | `dep_UwkCktuAmgmrbNUX` | ready | 1 | — |  |

## How to use this ledger

- Use the project table in `current-deployment.md` for current active IDs.
- Query an old deployment by ID before attempting a rollback; retained images/artifacts and database compatibility may have changed.
- Failed/cancelled Gateway deployments around 04:54-05:25 UTC came from packaging/health-check iterations; the stable IPv4 health-check fix followed.
- Failed/cancelled LingxiLit deployments came from the initial project/bootstrap and ClickHouse init-script issues; the active version is the first ready release.
