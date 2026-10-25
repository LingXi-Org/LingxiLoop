// Invoked exclusively by the fixed flock argv in server.mjs; stdin closure releases the kernel lock.
process.stdout.write('LOCKED\n')
process.stdin.resume()
process.stdin.once('end',()=>process.exit(0))
