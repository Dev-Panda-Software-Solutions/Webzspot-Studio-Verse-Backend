require("dotenv/config")

const bcrypt = require("bcryptjs")
const prisma = require("../src/utils/prismaClient")

const username = process.env.SUPER_ADMIN_USERNAME
const password = process.env.SUPER_ADMIN_PASSWORD
const email = process.env.SUPER_ADMIN_EMAIL
const name = process.env.SUPER_ADMIN_NAME || "Super Admin"
const phone = process.env.SUPER_ADMIN_PHONE || "0000000000"

const required = [
    ["SUPER_ADMIN_USERNAME", username],
    ["SUPER_ADMIN_PASSWORD", password],
    ["SUPER_ADMIN_EMAIL", email],
]

const missing = required.filter(([, value]) => !value)

if (missing.length) {
    console.error(`Missing required env: ${missing.map(([key]) => key).join(", ")}`)
    process.exit(1)
}

async function main() {
    const password_hash = await bcrypt.hash(password, 10)

    const existingSuperAdmin = await prisma.superAdmin.findUnique({
        where: { super_admin_email_id: email },
    })

    const existingLogin = await prisma.login.findFirst({
        where: {
            OR: [
                { username },
                ...(existingSuperAdmin ? [{ super_admin_id: existingSuperAdmin.super_admin_id }] : []),
            ],
        },
    })

    if (existingLogin?.super_admin_id) {
        await prisma.$transaction([
            prisma.superAdmin.update({
                where: { super_admin_id: existingLogin.super_admin_id },
                data: {
                    super_admin_name: name,
                    super_admin_phone_number: phone,
                    super_admin_email_id: email,
                    isactive: true,
                    updatedBy: "SEED",
                },
            }),
            prisma.login.update({
                where: { transid: existingLogin.transid },
                data: {
                    username,
                    password_hash,
                    role: "SUPER_ADMIN",
                    isactive: true,
                    failed_login_attempts: 0,
                    locked_until: null,
                    updatedBy: "SEED",
                },
            }),
        ])
        console.log(`Super admin updated: ${username}`)
        return
    }

    if (existingLogin) {
        throw new Error(`Username or email is already used by a non-super-admin login: ${username}`)
    }

    await prisma.$transaction(async (tx) => {
        const superAdmin = await tx.superAdmin.create({
            data: {
                super_admin_name: name,
                super_admin_phone_number: phone,
                super_admin_email_id: email,
                role: "SUPER_ADMIN",
                createdBy: "SEED",
            },
        })

        await tx.login.create({
            data: {
                username,
                password_hash,
                role: "SUPER_ADMIN",
                super_admin_id: superAdmin.super_admin_id,
                createdBy: "SEED",
            },
        })
    })

    console.log(`Super admin created: ${username}`)
}

main()
    .catch((err) => {
        console.error(err.message || err)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
