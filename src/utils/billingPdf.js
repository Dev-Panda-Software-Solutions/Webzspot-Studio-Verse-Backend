const PDFDocument = require("pdfkit")

const GOLD = "#B8860B"
const DARK = "#1A1A1A"
const MUTED = "#6B6B76"
const money = (n) => `Rs. ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateStr = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })

// Shared letterhead — studio name/address/contact + GST (when set). No logo,
// by explicit product decision (studios don't have one on file for this).
const drawLetterhead = (doc, tenant, settings, docLabel, docNumber, docDate) => {
    doc.fillColor(DARK).fontSize(18).font("Helvetica-Bold").text(tenant.tenant_studio_name || tenant.tenant_name, 50, 50)
    doc.fontSize(9).font("Helvetica").fillColor(MUTED)
    if (tenant.tenant_studio_address) doc.text(tenant.tenant_studio_address, 50, 72, { width: 300 })
    const contactLine = [tenant.tenant_phone_number, tenant.tenant_email_id].filter(Boolean).join("  |  ")
    if (contactLine) doc.text(contactLine, 50, doc.y)
    if (settings?.gstin_number) doc.text(`GSTIN: ${settings.gstin_number}${settings.gst_state ? ` (${settings.gst_state})` : ""}`, 50, doc.y)

    doc.fontSize(20).font("Helvetica-Bold").fillColor(GOLD).text(docLabel, 300, 50, { width: 245, align: "right" })
    doc.fontSize(10).font("Helvetica").fillColor(DARK)
    doc.text(`# ${docNumber}`, 300, 78, { width: 245, align: "right" })
    doc.fillColor(MUTED).text(dateStr(docDate), 300, 94, { width: 245, align: "right" })

    doc.moveTo(50, 130).lineTo(545, 130).strokeColor("#DDDDDD").stroke()
}

const drawClientBlock = (doc, client, y = 145) => {
    doc.fontSize(9).font("Helvetica-Bold").fillColor(MUTED).text("BILLED TO", 50, y)
    doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text(client?.name || "—", 50, y + 14)
    doc.fontSize(9).font("Helvetica").fillColor(MUTED).text([client?.email, client?.phone].filter(Boolean).join("  |  ") || "—", 50, y + 30)
    return y + 55
}

// Renders the items table + discount/total footer, returns the y position
// just below the totals block so callers can keep drawing (notices, etc.).
const drawItemsTable = (doc, items, discountAmount, startY) => {
    let y = startY
    const cols = { name: 50, price: 290, qty: 370, disc: 420, total: 480 }

    doc.rect(50, y, 495, 22).fill("#F5F5F5")
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(MUTED)
    doc.text("ITEM", cols.name + 8, y + 7)
    doc.text("PRICE", cols.price, y + 7, { width: 70, align: "right" })
    doc.text("QTY", cols.qty, y + 7, { width: 40, align: "right" })
    doc.text("DISC/UNIT", cols.disc, y + 7, { width: 55, align: "right" })
    doc.text("TOTAL", cols.total, y + 7, { width: 65, align: "right" })
    y += 22

    let itemsTotal = 0
    doc.font("Helvetica").fontSize(9.5).fillColor(DARK)
    items.forEach((item, idx) => {
        const price = Number(item.price)
        const discPerUnit = Number(item.discount_per_unit || 0)
        const lineTotal = (price - discPerUnit) * item.quantity
        itemsTotal += lineTotal

        const rowH = 24
        if (idx % 2 === 1) doc.rect(50, y, 495, rowH).fill("#FAFAFA").fillColor(DARK)
        doc.font("Helvetica").fontSize(9.5).fillColor(DARK)
        doc.text(item.name, cols.name + 8, y + 7, { width: 230 })
        doc.text(money(price), cols.price, y + 7, { width: 70, align: "right" })
        doc.text(String(item.quantity), cols.qty, y + 7, { width: 40, align: "right" })
        doc.text(money(discPerUnit), cols.disc, y + 7, { width: 55, align: "right" })
        doc.text(money(lineTotal), cols.total, y + 7, { width: 65, align: "right" })
        y += rowH
    })

    doc.moveTo(50, y).lineTo(545, y).strokeColor("#DDDDDD").stroke()
    y += 10

    const totalsX = 350
    doc.fontSize(9.5).font("Helvetica").fillColor(MUTED)
    doc.text("Items Total", totalsX, y, { width: 100 })
    doc.fillColor(DARK).text(money(itemsTotal), totalsX + 100, y, { width: 95, align: "right" })
    y += 16

    doc.fillColor(MUTED).text("Discount", totalsX, y, { width: 100 })
    doc.fillColor(DARK).text(`- ${money(discountAmount)}`, totalsX + 100, y, { width: 95, align: "right" })
    y += 20

    doc.moveTo(totalsX, y).lineTo(545, y).strokeColor("#DDDDDD").stroke()
    y += 8

    const payable = Math.max(0, itemsTotal - Number(discountAmount || 0))
    doc.fontSize(12).font("Helvetica-Bold").fillColor(GOLD).text("Payable Amount", totalsX, y, { width: 100 })
    doc.text(money(payable), totalsX + 100, y, { width: 95, align: "right" })

    return { y: y + 30, itemsTotal, payable }
}

const streamQuotationPdf = (res, { tenant, settings, quotation }) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 })
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="Quotation-${quotation.quotation_number}.pdf"`)
    doc.pipe(res)

    drawLetterhead(doc, tenant, settings, "QUOTATION", quotation.quotation_number, quotation.createdAt)
    const afterClient = drawClientBlock(doc, quotation.billing_client)
    drawItemsTable(doc, quotation.items, quotation.discount_amount, afterClient)

    doc.fontSize(8).fillColor(MUTED).text(
        "This is a price quotation and not a demand for payment. Prices are valid as listed above until formally confirmed.",
        50, 760, { width: 495, align: "center" }
    )
    doc.end()
}

const streamBillPdf = (res, { tenant, settings, bill, isTrial }) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 })
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="Bill-${bill.bill_number}.pdf"`)
    doc.pipe(res)

    drawLetterhead(doc, tenant, settings, "BILL", bill.bill_number, bill.createdAt)
    const afterClient = drawClientBlock(doc, bill.billing_client)
    const { y, payable } = drawItemsTable(doc, bill.items, bill.discount_amount, afterClient)

    const paidAmount = (bill.payments || []).reduce((sum, p) => sum + Number(p.amount), 0)
    const balanceDue = Math.max(0, payable - paidAmount)

    let noteY = y + 10
    if (paidAmount > 0) {
        doc.fontSize(9.5).font("Helvetica").fillColor(MUTED).text("Paid", 350, noteY, { width: 100 })
        doc.fillColor("#0F9D58").text(money(paidAmount), 450, noteY, { width: 95, align: "right" })
        noteY += 16
        doc.fillColor(MUTED).text("Balance Due", 350, noteY, { width: 100 })
        doc.fillColor(balanceDue > 0 ? "#D93025" : DARK).text(money(balanceDue), 450, noteY, { width: 95, align: "right" })
        noteY += 24
    }

    if (isTrial) {
        doc.fontSize(8.5).font("Helvetica-Oblique").fillColor("#B8860B")
            .text("Note: This studio is currently on a trial plan on Webzspot Studio-Verse.", 50, noteY, { width: 495 })
    }

    doc.fontSize(8).fillColor(MUTED).text(
        "Thank you for your business. Please retain this bill for your records.",
        50, 760, { width: 495, align: "center" }
    )
    doc.end()
}

const streamReceiptPdf = (res, { tenant, settings, payment, bill, balanceAfter }) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 })
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="Receipt-${payment.receipt_number}.pdf"`)
    doc.pipe(res)

    drawLetterhead(doc, tenant, settings, "RECEIPT", payment.receipt_number, payment.createdAt)
    let y = drawClientBlock(doc, bill.billing_client)

    doc.fontSize(9).font("Helvetica-Bold").fillColor(MUTED).text("AGAINST BILL", 320, 145)
    doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text(`#${bill.bill_number}`, 320, 159)

    doc.rect(50, y, 495, 90).fill("#FAFAFA")
    doc.fontSize(9.5).font("Helvetica").fillColor(MUTED).text("Amount Received", 70, y + 18)
    doc.fontSize(20).font("Helvetica-Bold").fillColor(GOLD).text(money(payment.amount), 70, y + 34)

    doc.fontSize(9.5).font("Helvetica").fillColor(MUTED).text("Payment Method", 320, y + 18)
    doc.fontSize(12).font("Helvetica-Bold").fillColor(DARK).text(
        { CASH: "Cash", GPAY: "GPay", CARD: "Card", BANK_TRANSFER: "Bank Transfer", CHEQUE: "Cheque" }[payment.method] || payment.method,
        320, y + 34
    )
    y += 105

    if (payment.remark) {
        doc.fontSize(9).font("Helvetica-Bold").fillColor(MUTED).text("REMARK", 50, y)
        doc.fontSize(9.5).font("Helvetica").fillColor(DARK).text(payment.remark, 50, y + 13, { width: 495 })
        y += 40
    }

    doc.moveTo(50, y).lineTo(545, y).strokeColor("#DDDDDD").stroke()
    y += 12
    doc.fontSize(9.5).font("Helvetica").fillColor(MUTED).text("Balance remaining on this bill after this payment", 50, y, { width: 350 })
    doc.font("Helvetica-Bold").fillColor(balanceAfter > 0 ? "#D93025" : "#0F9D58").text(money(balanceAfter), 400, y, { width: 145, align: "right" })

    doc.fontSize(8).fillColor(MUTED).text(
        "This receipt is computer-generated and does not require a signature.",
        50, 760, { width: 495, align: "center" }
    )
    doc.end()
}

module.exports = { streamQuotationPdf, streamBillPdf, streamReceiptPdf }
