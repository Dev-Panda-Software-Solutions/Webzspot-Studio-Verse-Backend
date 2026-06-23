const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

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
    log: [{ emit: 'event', level: 'query' }],
})

// Log every DB query with elapsed time — red >500ms, yellow >100ms, grey otherwise
prisma.$on('query', (e) => {
    const ms = e.duration
    const color = ms > 500 ? '\x1b[31m' : ms > 100 ? '\x1b[33m' : '\x1b[90m'
    const preview = e.query.replace(/\s+/g, ' ').slice(0, 80)
    console.log(`  ${color}[DB ${ms}ms]\x1b[0m ${preview}`)
})

module.exports = prisma
