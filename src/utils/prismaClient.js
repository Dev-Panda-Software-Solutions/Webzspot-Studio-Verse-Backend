const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const logger = require('./logger')

// Append TCP keepalive params so NAT/firewall never drops the idle connection.
// keepalives_idle=30 → send first probe after 30s idle
// keepalives_interval=10 → re-probe every 10s if no reply
// keepalives_count=5 → drop connection after 5 missed probes
const base = process.env.DATABASE_URL || ''
const sep = base.includes('?') ? '&' : '?'
const connectionString = `${base}${sep}keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=5`

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({
    adapter,
    log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' }
    ],
})

// Log every DB query with elapsed time — red >500ms, yellow >100ms, grey otherwise
prisma.$on('query', (e) => {
    const ms = e.duration
    const colorName = ms > 500 ? 'red' : ms > 100 ? 'yellow' : 'gray'
    const preview = e.query.replace(/\s+/g, ' ').slice(0, 80)
    console.log(`  ${logger.color(colorName, `[DB ${ms}ms]`)} ${preview}`)
    if (process.env.LOG_LEVEL === 'debug') {
        logger.debug('DB', 'Query details', { query: e.query, params: e.params, duration_ms: ms })
    }
})

prisma.$on('error', (e) => {
    logger.error('DB', e.message, e)
})

prisma.$on('warn', (e) => {
    logger.warn('DB', e.message, e)
})

module.exports = prisma
