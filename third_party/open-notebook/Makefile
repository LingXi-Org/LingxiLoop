.PHONY: test check build

test:
	uv run --frozen --python 3.12 pytest -q

check:
	uv run --frozen --python 3.12 ruff check tests

build:
	docker build --target lingxiloop-rag -t lingxiloop-rag:local .
