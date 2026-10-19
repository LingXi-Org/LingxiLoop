"""Print comparable CI timing metadata; never fetch logs or credentials.

python docs/evidence/issue-201/collect-ci.py RUN_ID [RUN_ID ...]
Uses the existing authenticated gh CLI. Queue timestamps on queued jobs are not
treated as execution. Runner seconds sum parallel jobs; wall time does not.
"""
import datetime
import json
import subprocess
import sys

def api(path):
    return json.loads(subprocess.check_output(["gh", "api", "repos/LingXi-Org/LingxiLoop/" + path]))

def seconds(start, end):
    return (datetime.datetime.fromisoformat(end.replace("Z", "+00:00"))
            - datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds()

runs = []
for identifier in sys.argv[1:]:
    assert identifier.isdigit(), "expected numeric workflow run ID"
    run = api(f"actions/runs/{identifier}")
    jobs = api(f"actions/runs/{identifier}/jobs?per_page=100")["jobs"]
    active = [job for job in jobs if job["status"] != "queued"
              and job["started_at"] and job["conclusion"] != "skipped"]
    complete = [job for job in active if job["completed_at"]]
    started = min((job["started_at"] for job in active), default=None)
    ended = max((job["completed_at"] for job in complete), default=None)
    finished = run["status"] == "completed"
    timings = []
    for job in jobs:
        timings.append(dict(name=job["name"], status=job["status"], conclusion=job["conclusion"],
                            executionSeconds=seconds(job["started_at"], job["completed_at"])
                            if job in complete else None,
                            steps=[dict(name=step["name"], conclusion=step["conclusion"],
                                        seconds=seconds(step["started_at"], step["completed_at"]))
                                   for step in job.get("steps", [])
                                   if step["conclusion"] not in [None, "skipped"]
                                   and step["started_at"] and step["completed_at"]]))
    runs.append(dict(runId=int(identifier), sourceCommit=run["head_sha"], event=run["event"],
                     url=run["html_url"], status=run["status"], conclusion=run["conclusion"],
                     createdAt=run["created_at"], observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     initialQueueSeconds=seconds(run["created_at"], started) if started else None,
                     wallSeconds=seconds(started, ended) if finished and started and ended else None,
                     runnerSeconds=sum(seconds(job["started_at"], job["completed_at"])
                                       for job in complete) if finished else None,
                     pendingQueueSeconds=seconds(run["created_at"], datetime.datetime.now(datetime.timezone.utc).isoformat())
                     if not active and not finished else None, jobs=timings))
print(json.dumps(runs, indent=2))
