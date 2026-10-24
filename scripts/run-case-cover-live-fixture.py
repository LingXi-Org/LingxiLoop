# Dedicated local fixture only; read the existing container password in memory.
import os, pathlib, signal, socket, subprocess, time
from urllib.parse import quote
repo=pathlib.Path(__file__).resolve().parent.parent
env=os.environ.copy()
for name in list(env):
 if name.startswith(('OPENAI_','R2_','LINGXIOS_R2_','AGENT_OS_MODEL_','LINGXIOS_CONTROL_','LINGXIOS_LIVE_')):env.pop(name)
password=subprocess.check_output(['docker','exec','runtime338-postgres','printenv','POSTGRES_PASSWORD'],text=True).strip()
env.update(NODE_ENV='test',DOTENV_CONFIG_PATH='/tmp/376-live-no-env',OPENAI_API_KEY='fixture-unused-key',OPENAI_BASE_URL='http://127.0.0.1:1/v1',DATABASE_URL='postgres://postgres:'+quote(password,safe='')+'@127.0.0.1:18438/covers376_20261024_test',REDIS_URL='redis://127.0.0.1:18445/12',LINGXILOOP_GATEWAY_HMAC_SECRET='integration-gateway-secret',WUKONG_USER_TOKEN_SECRET='integration-wukong-user-token-secret',LINGXILOOP_DISABLE_EMBEDDINGS='1',LANGSMITH_TRACING='false',LINGXILOOP_INVITE_BASE_URL='http://127.0.0.1:5290')
children=[]
def stop(*_):
 for child in children:
  if child.poll() is None:child.terminate()
 for child in children:
  try:child.wait(timeout=5)
  except subprocess.TimeoutExpired:child.kill()
for event in (signal.SIGTERM,signal.SIGINT):signal.signal(event,lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
try:
 children.append(subprocess.Popen(['node','--import','tsx','scripts/case-cover-live-api.mts'],cwd=repo,env=env))
 for attempt in range(100):
  if children[0].poll() is not None:raise RuntimeError('read-only API exited during startup')
  try:
   with socket.create_connection(('127.0.0.1',5291),timeout=.1):break
  except OSError:time.sleep(.1)
 else:raise RuntimeError('read-only API startup timeout')
 children.append(subprocess.Popen(['node','node_modules/vite/bin/vite.js','--config','scripts/vite.case-cover-live.config.ts'],cwd=repo,env=env))
 while all(child.poll() is None for child in children):time.sleep(.2)
except KeyboardInterrupt:pass
finally:stop()
