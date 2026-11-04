const prisma = require("./prismaClient")

// Client access must require publication in addition to an active mapping.
const isPublishedEvent = async (event_id) => {
    const event = await prisma.event.findUnique({
        where: { event_id },
        select: { isactive: true, published_at: true }
    })
    return Boolean(event?.isactive && event.published_at)
}

module.exports = { isPublishedEvent }
