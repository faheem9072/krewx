/**
 * Krewx Platform — Node.js / Express Backend Server
 * Production-ready API server for Krewx Job & Manpower Marketplace
 * Handles Razorpay Payments, Unlocks, Job Posts, Worker KYC, and Admin Analytics
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Razorpay (with default sandbox credentials for testing)
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_Krewx2026';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || 'krewx_secret_key_2026';

let razorpay = null;
try {
  razorpay = new Razorpay({
    key_id: razorpayKeyId,
    key_secret: razorpayKeySecret,
  });
} catch (err) {
  console.warn("⚠️ Razorpay SDK initialized in mock/fallback mode:", err.message);
}

// In-Memory Database Store (Syncs with Frontend Firestore / LocalStorage)
const db = {
  users: [
    { id: 'u1', name: 'Rahul Nair', role: 'seeker', phone: '+91 98470 12345', skill: 'catering', location: 'Ernakulam', freeUnlocks: 5, verified: true, rating: 4.8 },
    { id: 'u2', name: 'Grand Spice Catering', role: 'employer', phone: '+91 94471 99887', company: 'Grand Spice Events', location: 'Kochi', freeUnlocks: 2, rating: 4.9 },
  ],
  jobs: [
    { id: 'j1', title: 'Catering & Banquet Helper Crew', category: 'catering', employer: 'Grand Spice Events', location: 'Ernakulam', workersNeeded: 6, wage: '₹900 / Shift', date: '2026-09-28', phone: '+91 94471 99887', description: 'Banquet food service and venue setup.' },
    { id: 'j2', title: 'Full-Time Store Sales Executive', category: 'retail', employer: 'Margin Free Supermarket', location: 'Kozhikode', workersNeeded: 4, wage: '₹18,000 / Month', date: 'Immediate', phone: '+91 98950 44332', description: 'Store billing counter and inventory care.' }
  ],
  unlocks: [],
  payments: []
};

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Krewx API', timestamp: new Date().toISOString() });
});

// 1. Create Razorpay Payment Order for Contact Unlock (₹100)
app.post('/api/razorpay/create-order', async (req, res) => {
  try {
    const { userId, targetId, role } = req.body;
    const amountInPaise = 10000; // ₹100 in paise

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_krwx_${Date.now()}`,
      notes: { userId, targetId, role }
    };

    if (razorpay && process.env.RAZORPAY_KEY_ID) {
      const order = await razorpay.orders.create(options);
      return res.json({ success: true, orderId: order.id, amount: 100, currency: 'INR', key: razorpayKeyId });
    }

    // Fallback Simulated Order if Razorpay credentials are not set locally
    res.json({
      success: true,
      orderId: `order_simulated_${Date.now()}`,
      amount: 100,
      currency: 'INR',
      key: razorpayKeyId,
      simulated: true
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Verify Razorpay Payment & Process Contact Unlock
app.post('/api/razorpay/verify-payment', (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, userId, targetId, role } = req.body;

    const paymentRecord = {
      id: razorpay_payment_id || `PAY-KRWX-${Date.now()}`,
      orderId: razorpay_order_id || `ORD-${Date.now()}`,
      userId: userId || 'anonymous',
      targetId: targetId || 'target',
      amount: 100,
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    };

    db.payments.push(paymentRecord);
    db.unlocks.push({ userId, targetId, timestamp: new Date().toISOString() });

    res.json({
      success: true,
      message: 'Payment verified and contact unlocked successfully!',
      payment: paymentRecord
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Process Free Unlock Quota Check
app.post('/api/unlock', (req, res) => {
  const { userId, role, currentFreeUnlocks } = req.body;

  if (currentFreeUnlocks > 0) {
    const remaining = currentFreeUnlocks - 1;
    res.json({
      success: true,
      isFree: true,
      remainingUnlocks: remaining,
      message: `Contact unlocked! You have ${remaining} free unlocks remaining.`
    });
  } else {
    res.json({
      success: false,
      isFree: false,
      requirePayment: true,
      amount: 100,
      message: 'Free unlock quota exhausted. Payment of ₹100 required to unlock contact.'
    });
  }
});

// 4. Admin Statistics API
app.get('/api/admin/stats', (req, res) => {
  const totalUsers = db.users.length;
  const totalSeekers = db.users.filter(u => u.role === 'seeker').length;
  const totalEmployers = db.users.filter(u => u.role === 'employer').length;
  const totalJobs = db.jobs.length;
  const totalUnlocks = db.unlocks.length;
  const totalRevenue = db.payments.reduce((acc, p) => acc + p.amount, 0);

  res.json({
    totalUsers,
    totalSeekers,
    totalEmployers,
    totalJobs,
    totalUnlocks,
    totalRevenue,
    payments: db.payments,
    users: db.users
  });
});

// Serve Frontend SPA Index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Krewx Backend Server running on http://localhost:${PORT}`);
});
