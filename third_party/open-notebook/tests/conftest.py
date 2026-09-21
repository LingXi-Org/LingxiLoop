"""RAG tests use explicit fixtures and never load a developer's credentials."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
