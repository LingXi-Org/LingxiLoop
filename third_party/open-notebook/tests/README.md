# LingxiLoop RAG tests

Run `uv run --frozen --python 3.12 pytest -q` from this directory's parent, or `make test`.
Only RAG and shared storage, URL, database and request-size behavior are collected.
The tests use fixtures rather than developer `.env` files or live model credentials.
The archived upstream frontend, chat, podcast and model-management services have no build or test entrypoints in this vendored copy.
