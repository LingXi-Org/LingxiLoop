import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3'
const result = spawnSync('docker', ['inspect', 'lingxiloop-review-knowledge-20261019-storage-1', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'], {encoding:'utf8'})
assert.equal(result.status, 0)
assert.match(result.stdout.trim(), /^172\.[0-9.]+$/)
const client = new S3Client({ endpoint: `http://${result.stdout.trim()}:9000`, region: 'auto', forcePathStyle: true,
  credentials: {accessKeyId:'lingxiloop-e2e',secretAccessKey:'lingxiloop-e2e-storage-local'} })
try { await client.send(new CreateBucketCommand({Bucket:'lingxiloop-e2e'})) }
catch (error) { if (!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(error.name)) throw error }
finally { client.destroy() }
console.log('Isolated synthetic bucket ready')
