require('dotenv').config()
const express = require('express')
const Razorpay = require('razorpay')
const crypto = require('crypto')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

// ============================================================
// DIAMOND PACKS — SAME SOURCE OF TRUTH AS THE FRONTEND
// ============================================================
const PACKS_PATH = path.join(__dirname, '..', 'shared', 'packs.json')

let DIAMOND_PACKS
try {
  const raw = fs.readFileSync(PACKS_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  DIAMOND_PACKS = Object.fromEntries(
    parsed.DIAMOND_PACKS.map((p) => [p.id, p])
  )
  console.log(`✅ Loaded ${Object.keys(DIAMOND_PACKS).length} diamond packs from shared/packs.json`)
} catch (e) {
  console.error(`❌ Could not load diamond packs from ${PACKS_PATH}`)
  console.error('   Make sure shared/packs.json exists at the project root.')
  console.error('   Error:', e.message)
  process.exit(1)
}

// ============================================================
// ENV VALIDATION
// ============================================================
const KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim()
const KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim()
const PORT = process.env.PORT || 3001

if (!KEY_ID || !KEY_SECRET) {
  console.error('❌ RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing in server/.env')
  process.exit(1)
}
if (!KEY_ID.startsWith('rzp_test_') && !KEY_ID.startsWith('rzp_live_')) {
  console.error('❌ RAZORPAY_KEY_ID looks invalid:', KEY_ID.slice(0, 10))
  process.exit(1)
}

// ============================================================
// FIREBASE ADMIN — SAFE INITIALIZATION
// ============================================================
let admin
try {
  admin = require('firebase-admin')
} catch (e) {
  console.error('❌ Failed to require firebase-admin:', e.message)
  console.error('   Run: cd server && npm install firebase-admin@latest')
  process.exit(1)
}
if (!admin || typeof admin !== 'object') {
  console.error('❌ firebase-admin loaded but is not an object. Reinstall the package.')
  process.exit(1)
}

function initFirebaseAdmin() {
  const apps = admin.apps || (typeof admin.app === 'function' ? [admin.app()] : null)
  if (!apps) {
    console.error('❌ firebase-admin does not expose .apps or .app(). Version mismatch?')
    console.error('   Installed version:', require('firebase-admin/package.json').version)
    process.exit(1)
  }
  if (Array.isArray(apps) && apps.length > 0) return

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const absPath = credPath
    ? path.isAbsolute(credPath) ? credPath : path.join(__dirname, credPath)
    : path.join(__dirname, 'serviceAccountKey.json')

  if (!fs.existsSync(absPath)) {
    console.error(`❌ Service account key not found at ${absPath}`)
    process.exit(1)
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(absPath, 'utf8'))
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
        || `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
    })
    console.log('✅ Firebase Admin initialized for project:', serviceAccount.project_id)
  } catch (e) {
    console.error('❌ Firebase Admin init failed:', e.message)
    process.exit(1)
  }
}
initFirebaseAdmin()

// ============================================================
// RAZORPAY
// ============================================================
const rzp = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET })

// ============================================================
// EXPRESS
// ============================================================
const app = express()
app.use(cors())
app.use(express.json())
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// ============================================================
// GET /packs — the frontend can use this to verify sync
// ============================================================
app.get('/packs', (_req, res) => {
  res.json({ packs: Object.values(DIAMOND_PACKS) })
})

// ============================================================
// POST /razorpay/order
// ============================================================
app.post('/razorpay/order', async (req, res) => {
  try {
    const { packId } = req.body || {}
    const pack = DIAMOND_PACKS[packId]
    if (!pack) return res.status(400).json({ error: `Unknown packId: ${packId}` })

    const amount = pack.priceINR * 100
    const receipt = `rcpt_${packId}_${Date.now()}`

    console.log(`[order] creating packId=${packId} amount=${amount}paise`)
    const order = await rzp.orders.create({
      amount, currency: 'INR', receipt,
      notes: { packId, diamonds: String(pack.diamonds) },
    })
    console.log(`[order] ✅ created ${order.id}`)

    res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: KEY_ID,
    })
  } catch (error) {
    const desc =
      error?.error?.description ||
      error?.message ||
      JSON.stringify(error) ||
      'Unknown error'
    console.error('[order] ❌', desc)
    res.status(500).json({ error: desc })
  }
})

// ============================================================
// POST /razorpay/verify
// ============================================================
app.post('/razorpay/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, uid } = req.body || {}

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, error: 'Missing payment fields' })
    }
    if (!uid) return res.status(400).json({ ok: false, error: 'Missing uid' })

    const expectedSignature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    console.log('[verify] received:', razorpay_signature)
    console.log('[verify] expected:', expectedSignature)

    if (expectedSignature !== razorpay_signature) {
      console.error('[verify] ❌ signature mismatch')
      return res.status(400).json({ ok: false, error: 'Invalid signature' })
    }

    let order
    try {
      order = await rzp.orders.fetch(razorpay_order_id)
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Could not fetch order' })
    }

    const packId = order?.notes?.packId
    const pack = DIAMOND_PACKS[packId]
    if (!pack) {
      console.error('[verify] ❌ order has no known packId:', packId)
      return res.status(400).json({ ok: false, error: 'Order has no pack metadata' })
    }

    const db = admin.database()
    const processedRef = db.ref(`processedPayments/${razorpay_payment_id}`)
    const already = await processedRef.once('value')
    if (already.exists()) {
      return res.json({ ok: true, diamonds: pack.diamonds, alreadyProcessed: true })
    }

    await processedRef.set({
      uid, orderId: razorpay_order_id, packId,
      diamonds: pack.diamonds, at: Date.now(),
    })
    await db.ref(`users/${uid}/diamonds`).transaction((cur) => (cur || 0) + pack.diamonds)

    console.log(`[verify] ✅ credited ${pack.diamonds}💎 to ${uid}`)
    res.json({ ok: true, diamonds: pack.diamonds })
  } catch (error) {
    console.error('[verify] ❌', error)
    res.status(500).json({ ok: false, error: error?.message || 'Verification failed' })
  }
})

// ============================================================
// HEALTH
// ============================================================
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    keyIdPrefix: KEY_ID.slice(0, 10),
    firebase: !!admin.apps?.length || !!admin.app?.(),
    packsLoaded: Object.keys(DIAMOND_PACKS).length,
  })
})

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Server on http://localhost:${PORT}`)
  console.log(`   Key ID: ${KEY_ID.slice(0, 12)}…`)
  console.log(`   Secret set: ${!!KEY_SECRET}`)
  console.log(`   Packs: ${Object.keys(DIAMOND_PACKS).join(', ')}`)
})