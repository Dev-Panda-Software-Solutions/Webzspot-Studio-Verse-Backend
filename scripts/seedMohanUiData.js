const prisma = require('../src/utils/prismaClient')

const TENANT_ID = process.env.MOHAN_TENANT_ID || '50b2f97b-05d0-43d6-8b8d-5a43a455a6d5'
const USER_ID = process.env.MOHAN_USER_ID || '3763d843-d849-45d4-bcca-1a5172703fe4'
const COUNT = 15
const MARKER = 'MOHAN-UI-SEED-2026'

const money = (value) => Number(value).toFixed(2)
const dateAfter = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000)

async function main() {
  const [tenant, user, tenantLogin, userLogin, plans, sourceMedia] = await Promise.all([
    prisma.tenant.findUnique({ where: { tenant_id: TENANT_ID } }),
    prisma.user.findUnique({ where: { user_id: USER_ID } }),
    prisma.login.findFirst({ where: { tenant_id: TENANT_ID, role: 'ADMIN' } }),
    prisma.login.findFirst({ where: { user_id: USER_ID, role: 'USER' } }),
    prisma.subscriptionPlan.findMany({ where: { isactive: true }, select: { subscription_plan_id: true, plan_type: true, photo_quota: true } }),
    prisma.uploadedMedia.findMany({
      where: { media_server_path: { startsWith: 's3://' } },
      select: { media_name: true, media_type: true, media_size: true, original_size: true, media_server_path: true, compressed_server_path: true },
      orderBy: { createdAt: 'asc' },
      take: 30
    })
  ])

  if (!tenant || !user || user.created_by_tenant_id !== TENANT_ID) throw new Error('Mohan user or Panda Studio tenant was not found/mismatched.')
  if (!tenantLogin || !userLogin) throw new Error('Mohan admin/client login records are required.')
  if (sourceMedia.length === 0) throw new Error('No existing S3 media was found to reuse for valid UI thumbnails.')
  if (plans.length === 0) throw new Error('No active subscription plans were found.')

  const existing = await prisma.event.count({ where: { event_name: { startsWith: `${MARKER} Event` } } })
  if (existing >= COUNT) {
    console.log(JSON.stringify({ skipped: true, reason: 'Seed already exists', existing }, null, 2))
    return
  }

  const [quotationMax, billMax, receiptMax, wallet] = await Promise.all([
    prisma.quotation.aggregate({ where: { tenant_id: TENANT_ID }, _max: { quotation_number: true } }),
    prisma.bill.aggregate({ where: { tenant_id: TENANT_ID }, _max: { bill_number: true } }),
    prisma.payment.aggregate({ where: { tenant_id: TENANT_ID }, _max: { receipt_number: true } }),
    prisma.tenantWallet.findUnique({ where: { tenant_id: TENANT_ID }, select: { balance_credits: true } })
  ])

  const nextQuotation = (quotationMax._max.quotation_number || 0) + 1
  const nextBill = (billMax._max.bill_number || 0) + 1
  const nextReceipt = (receiptMax._max.receipt_number || 0) + 1
  const initialWalletBalance = wallet?.balance_credits || 0

  const result = await prisma.$transaction(async (tx) => {
    const events = []
    const mappings = []
    const media = []
    const guests = []
    const services = []
    const quotations = []
    const bills = []
    const payments = []
    const tickets = []
    const subscriptions = []
    const walletTransactions = []

    for (let i = 1; i <= COUNT; i += 1) {
      const published = i <= 10
      const event = await tx.event.create({
        data: {
          event_name: `${MARKER} Event ${String(i).padStart(2, '0')}`,
          event_description: `UI testing event ${i} for Mohan client access, gallery, favourites and responsive layouts.`,
          event_date: dateAfter(i - 8),
          event_time: `${10 + (i % 8)}:00 AM`,
          event_venue: `Mohan Test Venue ${i}`,
          event_organizer: 'Mohan B',
          event_organizer_phone_number: '+91 9000000000',
          event_organizer_email_id: 'mohan-ui-test@example.com',
          is_ai_event: i % 3 === 0,
          published_at: published ? new Date() : null,
          allow_download: i % 4 !== 0,
          createdBy: tenantLogin.transid
        }
      })
      events.push(event)

      await tx.eventTenantMapping.create({ data: { event_id: event.event_id, tenant_id: TENANT_ID, collaboration_role: 'OWNER', createdBy: tenantLogin.transid } })
      const mapping = await tx.eventUserMapping.create({
        data: {
          event_id: event.event_id,
          user_id: USER_ID,
          access_expires: i === 2 ? dateAfter(-1) : i === 3 ? null : dateAfter(30 + i),
          favourite_limit: i % 3 === 0 ? 5 : null,
          createdBy: tenantLogin.transid
        }
      })
      mappings.push(mapping)

      // Attach all media to published events so Mohan can exercise the gallery.
      // The paths reuse real S3 objects, so the seeded thumbnails are valid.
      if (published) {
        const mediaCount = i === 1 ? 6 : 1
        for (let m = 0; m < mediaCount; m += 1) {
          const source = sourceMedia[media.length % sourceMedia.length]
          const stage = await tx.mediaUploadStage.create({
            data: {
              event_id: event.event_id,
              media_name: `${MARKER} Media ${media.length + 1}`,
              media_type: source.media_type,
              media_size: source.media_size || '100 KB',
              media_upload_status: 'Completed',
              media_upload_start: '100',
              media_uploaded: '100',
              media_compressed: '100',
              media_original_uploaded: '100',
              media_compressed_uploaded: '100',
              media_original_server_path: source.media_server_path,
              media_compressed_server_path: source.compressed_server_path || source.media_server_path,
              createdBy: tenantLogin.transid
            }
          })
          const item = await tx.uploadedMedia.create({
            data: {
              event_id: event.event_id,
              media_upload_stage_id: stage.media_upload_stage_id,
              media_name: source.media_name || `${MARKER} Media ${media.length + 1}`,
              media_type: source.media_type,
              media_size: source.media_size || '100 KB',
              original_size: source.original_size || source.media_size || '100 KB',
              media_server_path: source.media_server_path,
              compressed_server_path: source.compressed_server_path || source.media_server_path,
              gallery_type: 'PHOTO_SELECTION',
              createdBy: tenantLogin.transid
            }
          })
          media.push(item)
        }
      }

      await tx.eventGuest.create({
        data: {
          event_id: event.event_id,
          guest_email: `mohan-ui-guest-${i}@example.com`,
          selfie_server_path: `s3://studio-webzspot/events/${event.event_id}/guests/${MARKER.toLowerCase()}-${i}.jpg`,
          createdBy: tenantLogin.transid
        }
      }).then(guest => guests.push(guest))

      await tx.studioService.create({
        data: { tenant_id: TENANT_ID, name: `${MARKER} Service ${String(i).padStart(2, '0')}`, price: money(1500 + i * 250), createdBy: tenantLogin.transid }
      }).then(service => services.push(service))

      const quotation = await tx.quotation.create({
        data: {
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          quotation_number: nextQuotation + i - 1,
          status: 'CONFIRMED',
          discount_amount: money(i % 4 === 0 ? 500 : 0),
          createdBy: tenantLogin.transid,
          items: { create: [
            { name: `${MARKER} Package ${i}`, price: money(1500 + i * 250), quantity: (i % 3) + 1, discount_per_unit: money(i % 5 === 0 ? 100 : 0) },
            { name: `${MARKER} Add-on ${i}`, price: money(350 + i * 25), quantity: 1, discount_per_unit: '0.00' }
          ]
          }
        }
      })
      quotations.push(quotation)

      const total = Math.max(0, (1500 + i * 250) * ((i % 3) + 1) - (i % 5 === 0 ? 100 * ((i % 3) + 1) : 0) + 350 + i * 25 - (i % 4 === 0 ? 500 : 0))
      const bill = await tx.bill.create({
        data: {
          tenant_id: TENANT_ID,
          quotation_id: quotation.quotation_id,
          user_id: USER_ID,
          bill_number: nextBill + i - 1,
          status: i % 3 === 1 ? 'PAID' : 'PARTIALLY_PAID',
          discount_amount: quotation.discount_amount,
          createdBy: tenantLogin.transid,
          items: { create: [
            { name: `${MARKER} Package ${i}`, price: money(1500 + i * 250), quantity: (i % 3) + 1, discount_per_unit: money(i % 5 === 0 ? 100 : 0) },
            { name: `${MARKER} Add-on ${i}`, price: money(350 + i * 25), quantity: 1, discount_per_unit: '0.00' }
          ] }
        }
      })
      bills.push(bill)

      const amount = i % 3 === 0 ? Math.floor(total / 2) : i % 3 === 2 ? 100 : total
      await tx.payment.create({
        data: { tenant_id: TENANT_ID, bill_id: bill.bill_id, receipt_number: nextReceipt + payments.length, amount: money(amount), method: i % 2 ? 'GPAY' : 'CASH', remark: `${MARKER} payment ${i}`, createdBy: tenantLogin.transid }
      }).then(payment => payments.push(payment))

      await tx.supportTicket.create({
        data: { subject: `${MARKER} Support Ticket ${i}`, description: `Dummy support request ${i} for full UI testing.`, status: ['OPEN', 'IN_PROGRESS', 'RESOLVED'][i % 3], raised_by_role: 'USER', raised_by_name: user.user_name, createdBy: userLogin.transid }
      }).then(async ticket => {
        tickets.push(ticket)
        await tx.supportTicketReply.create({ data: { support_ticket_id: ticket.support_ticket_id, message: `Dummy support reply ${i}.`, responder_role: 'ADMIN', responder_name: tenant.tenant_name, createdBy: tenantLogin.transid } })
      })

      await tx.tenantSubscription.create({
        data: { tenant_id: TENANT_ID, subscription_plan_id: plans[i % plans.length].subscription_plan_id, status: 'CANCELLED', change_type: 'UI_TEST_SEED', photo_quota_total: 1000 + i * 100, photo_quota_used: i * 10, starts_at: dateAfter(-90 - i), expires_at: dateAfter(-60 - i), isactive: false, createdBy: tenantLogin.transid }
      }).then(subscription => subscriptions.push(subscription))

      await tx.walletTransaction.create({
        data: { tenant_id: TENANT_ID, type: 'ADJUSTMENT', credits: 25, balance_after: initialWalletBalance + i * 25, reference: `${MARKER}-${i}`, notes: `Dummy wallet transaction ${i}`, createdBy: tenantLogin.transid }
      }).then(transaction => walletTransactions.push(transaction))
    }

    for (const [index, item] of media.entries()) {
      if (index < COUNT) {
        await tx.userFavouriteMediaMapping.create({ data: { event_id: item.event_id, user_id: USER_ID, media_id: item.media_id, createdBy: userLogin.transid } })
        await tx.tenantFavouriteMediaMapping.create({ data: { event_id: item.event_id, tenant_id: TENANT_ID, media_id: item.media_id, createdBy: tenantLogin.transid } })
      }
    }

    if (wallet) await tx.tenantWallet.update({ where: { tenant_id: TENANT_ID }, data: { balance_credits: initialWalletBalance + COUNT * 25, updatedBy: tenantLogin.transid } })

    return { events: events.length, mappings: mappings.length, media: media.length, guests: guests.length, services: services.length, quotations: quotations.length, bills: bills.length, payments: payments.length, tickets: tickets.length, subscriptions: subscriptions.length, walletTransactions: walletTransactions.length }
  }, { timeout: 120000 })

  console.log(JSON.stringify({ marker: MARKER, tenant_id: TENANT_ID, user_id: USER_ID, ...result }, null, 2))
}

main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
