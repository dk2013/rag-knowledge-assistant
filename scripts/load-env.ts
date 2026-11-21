// CLI scripts run outside Next.js, so they load .env themselves (Node 21.7+ built-in).
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file: defaults from src/lib/config.ts are used
}
