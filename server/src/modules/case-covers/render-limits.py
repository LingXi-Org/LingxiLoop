"""Trusted launcher inside bubblewrap; no inputs are interpreted as code."""
import os
import resource
import sys

resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
resource.setrlimit(resource.RLIMIT_FSIZE, (4 * 1024 * 1024, 4 * 1024 * 1024))
# Chromium reserves large virtual address ranges; physical memory is capped by
# the existing Worker cgroup. Do not use RLIMIT_AS as a fictitious memory bound.
os.execv(sys.argv[1], sys.argv[1:])
