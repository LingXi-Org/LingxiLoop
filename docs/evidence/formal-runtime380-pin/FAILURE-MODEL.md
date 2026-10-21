# Formal3.8 pin — before dependency edits

Base3b8a712af056b6937e7735d9328c646b920f75d8 integrates trace UI, public native bridge,0052 and release profile. Root authorized this pin only after formal publication39644653369 succeeded and actual package-verification.json SHA256f784cf95175b25d5e5edcd6eddb3fa234d189b03ad314302580bec216881b2ff was verified. Registry source is9ae65079085f196870ece41500472a333f9abfbf.

- Both root/server manifests and locks must resolve exact3.8.0 with the real registry URL/integrity; no source overlay, file dependency, range, copied credential or unrelated resolution churn.
- Checks must use the already installed formal package. Its488-file/14-SQL/public-export receipt is reused and hash-bound rather than downloading/repacking a second tarball.
- Exact compiled capabilities remain runtime3.8/native14/control11/publicText2/runTrace1 and unchanged native schema hashc56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f.
-0052, all historical SQL, producer leaf, runtime profile, trace/UI implementation and release scripts must be byte-identical to base. Only four manifests/locks plus this evidence directory may change.
- Existing20 owning contracts and server/Web compilation check the formal interfaces and preserved producer/answer/trace boundaries. Do not introduce new provider/browser/PG tests or relabel earlier source-overlay tests as formal. Root handles the separate controlled-provider fixture corrections and final combined CI.
- Any failure is retained and reported; a successful source check or package receipt does not substitute for exact candidate CI/image/production acceptance. This agent performs no merge or production operation.
