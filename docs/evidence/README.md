# Historical verification evidence

Generated screenshots, videos, browser traces, copied HTML, logs and result
JSON have been removed from the current checkout. Written records, failure
models, authored verification tools and required test inputs remain.

The complete evidence is preserved at
[the pre-cleanup commit](https://github.com/LingXi-Org/LingxiLoop/tree/7424a10210a4f82c32ff893945f98c4f37e78fef/docs/evidence).
A historical acceptance or arithmetic checker may read receipts adjacent to
its script. Restore those inputs before replaying that historical checker:

```sh
git restore --source=7424a10210a4f82c32ff893945f98c4f37e78fef -- docs/evidence/<record>
```

Historical passing records do not verify today's source. Generate new results
with the owning commands and retain them as CI artifacts or ignored local
outputs. Files under `artifacts/` follow the same policy; the small synthetic
oracle and Markdown inputs still read by existing checks remain tracked.
