const mode = process.env.DSH_TEST_BACKEND_MODE
const token = 'synthetic-launch-token'
process.on('SIGTERM', () => process.exit(0))
if (mode === 'early') {
  console.error(`failed request http://127.0.0.1:43123/?token=${token}`)
  process.exitCode = 7
} else if (mode === 'timeout') {
  console.error(`malformed readiness http://localhost:43123/?token=${token}`)
  setInterval(() => undefined, 1_000)
} else {
  process.stdout.write('dsh web: http://127.0.0.1:43123/?token=synthetic-', () => {
    setImmediate(() => {
      console.log('launch-token (LAN: http://192.168.1.5:43123/?token=synthetic-lan-token)')
      console.error(`request http://127.0.0.1:43123/?token=${token}`)
      if (mode === 'unexpected') process.exitCode = 19
      else setInterval(() => undefined, 1_000)
    })
  })
}
