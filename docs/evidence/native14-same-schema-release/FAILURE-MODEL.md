# Native14 same-schema release failure model

Scope: the existing host release driver rejects an already accepted formal
3.6.0/native14/product50 source before it can publish a UI-only target with the
same formal package and complete migration inventory. Base:
`c66e847d14f838e72d0ab19e252e6cd4e2b68a76`.

Write the owning contract cases before changing the production guard:

- A sealed 50→50 plan with unchanged formal provenance must pass. Native14
  alone is insufficient: runtime must be exactly 3.6.0 and product exactly50.
- All formal keys remain equal, including package integrity/tarball, protocol,
  schema hash and all50 ordered migration names/checksums. Missing, duplicated
  or changed migration rows must fail.
- 13→14 and 14→13 must still fail in the same-schema format. Only the existing
  explicit native maintenance format can authorize 13/49→14/50.
- A successful ordinary native14 release qualifies online, stops only the two
  old Workers, checks zero leases twice, then deploys Web A/B and Worker A/B.
  It must never invoke backup, seed or migration, even though its schema is14.
- The real public adapter with mocked transport must preserve source/Core and
  secret configuration, actual host image identity, and native action ordering.
  Explicit preparation plus ordinary release remains8+26 native actions.
- Existing unknown-outcome fail-stop, accepted-source/image/source-file checks
  and native maintenance backup/all-writer tests remain unchanged and green.

All evidence in this directory is local synthetic contract evidence. No
production requests, SQL, credential/private diagnostics, image builds or new
dependencies are needed. Production acceptance remains the release owner's
separate responsibility.
