# Synthetic homework presentation fixtures

All content is invented for issue #424; no student or production data is used.

- `material.pptx`: generated with python-pptx 1.0.2; two slides deliberately reordered, Chinese/English text, a table and speaker notes.
- `material.ppt`: generated from a synthetic two-slide python-pptx file with LibreOffice's `MS PowerPoint 97` export. It is a genuine legacy binary PPT, used to verify the explicit conversion-required response.
- `image-only.pptx`: a blank slide containing an invented 8×8 white PNG; no editable text.
- `chart.pptx`: a synthetic column chart with Chinese/English category and series labels and values 2/5.
- `encrypted.pptx`: the synthetic `material.pptx` encrypted with msoffcrypto-tool 6.0.0 and the fixture-only password `synthetic-fixture-password`; verifies the no-password material error.
- `expanded-limit.pptx`: a synthetic ZIP with a slide part of 32 MiB + 1 spaces; it verifies the expanded-byte limit without a large fixture on disk.

Fixture creation tools are development-only. Runtime extraction uses the pinned npm parser and does not invoke Python, LibreOffice, OCR or an external service.

Run `python3 generate.py` in an environment with python-pptx and Pillow to regenerate the PPTX/ZIP fixtures. Add `--legacy` when LibreOffice is available to regenerate the binary PPT as well, and `--encrypted` with msoffcrypto-tool 6.0.0 installed to regenerate the encrypted fixture.
