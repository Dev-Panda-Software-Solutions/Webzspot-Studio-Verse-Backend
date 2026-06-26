const activeUserEventAccessWhere = ({ event_id, user_id, now = new Date() }) => ({
    event_id,
    user_id,
    isactive: true,
    OR: [
        { access_start: null },
        { access_start: { lte: now } }
    ],
    AND: [
        {
            OR: [
                { access_expires: null },
                { access_expires: { gte: now } }
            ]
        }
    ]
})

const parseAccessStart = (value) => {
    if (!value) return null
    return new Date(value)
}

const parseAccessExpiry = (value) => {
    if (!value) return null
    const text = String(value)
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return new Date(`${text}T23:59:59.999Z`)
    }
    return new Date(value)
}

module.exports = {
    activeUserEventAccessWhere,
    parseAccessStart,
    parseAccessExpiry
}
