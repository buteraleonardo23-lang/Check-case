// Esegue src/demo/demoApi.scenario.ts dentro Vite (serve per import.meta.glob), senza browser.
import { createServer } from 'vite'

const server = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
try {
  const { run } = await server.ssrLoadModule('/src/demo/demoApi.scenario.ts')
  const failed = await run()
  process.exitCode = failed ? 1 : 0
} finally {
  await server.close()
}
