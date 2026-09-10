process.stdout.write('dsh web: http://127.0.0.1:')
setTimeout(() => process.stdout.write('43123\n'), 10)
process.on('SIGTERM', () => process.exit(0))
setInterval(() => undefined, 1_000)
