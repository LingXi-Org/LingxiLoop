# Superseded analysis — do not use

The CLI returned exit0 with an empty publication log. This first analysis incorrectly treated an empty log as zero cached steps. The coordinator rejected that inference before any commit or PR claim, retained this record, and corrected the helper to require either a nonempty qualified log or an explicit denied-access receipt. Use ../pr236-d107-build-observations-corrected.json; cached step count is unknown/null. GitHub job REST timestamps and the independent OCI/source checks are unaffected.
