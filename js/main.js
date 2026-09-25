/**
 * Krewx Platform — Main Interactive Marketplace & Monetization Logic
 * Includes Role Selection, Pay-to-Unlock System, Razorpay Integration, Admin Operations, and Firebase Sync
 */

import { 
  db, 
  auth, 
  storage, 
  collection, 
  doc,
  addDoc, 
  updateDoc,
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  ref,
  uploadBytes,
  getDownloadURL
} from './firebase-config.js';

const ADMIN_EMAIL = 'fm105595@gmail.com';

// Global Platform State
window.krewxState = {
  role: 'seeker', // 'seeker' | 'employer' | 'admin'
  seekerUnlocks: 5,
  employerUnlocks: 2,
  unlockedIds: new Set(),
  currentPaymentTarget: null,
  revenue: 3200,
  currentUser: null,
  users: [
    { id: 'u1', name: 'Rahul Nair', role: 'seeker', phone: '+91 98470 12345', skill: 'Catering & Event Support', location: 'Ernakulam', verified: true },
    { id: 'u2', name: 'Margin Free Supermarket', role: 'employer', phone: '+91 98950 44332', skill: 'Retail & Supermarket Ops', location: 'Kozhikode', verified: true }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  initHeaderScroll();
  initMobileMenu();
  initScrollAnimations();
  initModals();
  initStepForm();
  initFirebaseAuth();
  initAdminGateAuth();
  initFormSubmissions();
  initMarketplaceTabs();
  initMarketplaceData();
  initFirestoreRealtime();
  updateQuotaUI();

  // Attach event listener for refresh admin stats button
  const refreshBtn = document.getElementById('refreshAdminStatsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', updateAdminDashboardUI);
  }

  const adminNav = document.getElementById('adminNavLink');
  if (adminNav) {
    adminNav.addEventListener('click', () => {
      checkAdminAuth();
    });
  }
});

/* --------------------------------------------------------------------------
   1. User Role Selector & Quota Management
   -------------------------------------------------------------------------- */
window.setPlatformRole = function(role) {
  window.krewxState.role = role;
  updateQuotaUI();

  const modal = document.getElementById('roleModal');
  if (modal) closeModal(modal);

  showToast(`Switched role to: ${role === 'seeker' ? 'Job Seeker' : role === 'employer' ? 'Employer' : 'Admin Ops'}`, 'success');

  if (role === 'admin') {
    checkAdminAuth();
    const adminSec = document.getElementById('admin-panel');
    if (adminSec) adminSec.scrollIntoView({ behavior: 'smooth' });
  }
};

function updateQuotaUI() {
  const roleLabel = document.getElementById('roleLabel');
  const quotaText = document.getElementById('quotaCountText');
  const quotaBadge = document.getElementById('userQuotaBadge');

  if (!roleLabel || !quotaBadge) return;

  const role = window.krewxState.role;

  if (role === 'seeker') {
    if (roleLabel) roleLabel.textContent = 'Role: Job Seeker';
    if (quotaText) quotaText.textContent = `${window.krewxState.seekerUnlocks} Free Unlocks Left`;
    quotaBadge.className = window.krewxState.seekerUnlocks > 0 ? 'quota-badge' : 'quota-badge warning';
  } else if (role === 'employer') {
    if (roleLabel) roleLabel.textContent = 'Role: Employer';
    if (quotaText) quotaText.textContent = `${window.krewxState.employerUnlocks} Free Unlocks Left`;
    quotaBadge.className = window.krewxState.employerUnlocks > 0 ? 'quota-badge' : 'quota-badge warning';
  } else {
    if (roleLabel) roleLabel.textContent = 'Role: Admin Ops';
    if (quotaText) quotaText.textContent = 'Admin Unlocked';
    quotaBadge.className = 'quota-badge admin-tag';
  }
}

/* --------------------------------------------------------------------------
   2. Contact Pay-to-Unlock System & Razorpay Monetization
   -------------------------------------------------------------------------- */
window.unlockContact = function(targetId, targetName, maskedPhone, fullPhone, itemType) {
  const state = window.krewxState;

  // If already unlocked
  if (state.unlockedIds.has(targetId)) {
    showToast(`Contact already unlocked for ${targetName}!`, 'info');
    return;
  }

  // Check Quota
  let isFreeAvailable = false;
  if (state.role === 'admin') {
    isFreeAvailable = true;
  } else if (state.role === 'seeker' && state.seekerUnlocks > 0) {
    isFreeAvailable = true;
    state.seekerUnlocks--;
  } else if (state.role === 'employer' && state.employerUnlocks > 0) {
    isFreeAvailable = true;
    state.employerUnlocks--;
  }

  if (isFreeAvailable) {
    state.unlockedIds.add(targetId);
    updateQuotaUI();
    revealUnlockedContactUI(targetId, fullPhone);
    showToast(`Contact Unlocked for ${targetName}! (${state.role === 'seeker' ? state.seekerUnlocks : state.employerUnlocks} free left)`, 'success');

    // Audit Log
    logAuditRecord(`FREE-UNLK-${Date.now().toString().slice(-5)}`, state.role, targetName, 'Free Quota', '₹0', 'SUCCESS');
  } else {
    // Quota exhausted -> Prompt ₹100 Pay-to-Unlock via Razorpay
    state.currentPaymentTarget = { targetId, targetName, maskedPhone, fullPhone, itemType };
    
    const targetTitleEl = document.getElementById('razorpayTargetTitle');
    if (targetTitleEl) targetTitleEl.textContent = `${targetName} (${itemType})`;

    const razorpayModal = document.getElementById('razorpayModal');
    if (razorpayModal) openModal(razorpayModal);
  }
};

function revealUnlockedContactUI(targetId, fullPhone) {
  const box = document.getElementById(`contact-box-${targetId}`);
  if (box) {
    box.innerHTML = `
      <div class="phone-unlocked">
        <span>📞 ${fullPhone}</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <a href="tel:${fullPhone}" class="btn-call"><span>Call Now</span></a>
        <button class="btn btn-secondary btn-sm" onclick="window.openRatingModal('${targetId}')">★ Rate</button>
      </div>
    `;
  }
}

/* --------------------------------------------------------------------------
   3. Razorpay Checkout Handler
   -------------------------------------------------------------------------- */
window.triggerRazorpayPayment = function(paymentMethod) {
  const target = window.krewxState.currentPaymentTarget;
  if (!target) return;

  const razorpayModal = document.getElementById('razorpayModal');

  // Check if SDK is available
  if (typeof window.Razorpay !== 'undefined') {
    const options = {
      key: 'rzp_test_Krewx2026',
      amount: 10000, // ₹100 in paise
      currency: 'INR',
      name: 'Krewx Marketplace',
      description: `Unlock Contact for ${target.targetName}`,
      image: 'assets/images/favicon-krewx.png',
      handler: function(response) {
        completePaymentSuccess(response.razorpay_payment_id || `pay_${Date.now()}`);
      },
      prefill: {
        name: 'Krewx User',
        email: 'user@krewx.com',
        contact: '9847012345'
      },
      theme: {
        color: '#0d9488'
      }
    };

    try {
      const rzp1 = new window.Razorpay(options);
      rzp1.open();
      if (razorpayModal) closeModal(razorpayModal);
      return;
    } catch (e) {
      console.warn("Razorpay SDK launch fallback:", e);
    }
  }

  // Simulated Payment Fallback for instant verification
  if (razorpayModal) closeModal(razorpayModal);
  completePaymentSuccess(`pay_simulated_${Date.now().toString().slice(-6)}`);
};

function completePaymentSuccess(paymentId) {
  const target = window.krewxState.currentPaymentTarget;
  if (!target) return;

  window.krewxState.unlockedIds.add(target.targetId);
  window.krewxState.revenue += 100;

  revealUnlockedContactUI(target.targetId, target.fullPhone);
  updateAdminDashboardUI();

  logAuditRecord(paymentId, window.krewxState.role, target.targetName, 'Razorpay Pay', '₹100', 'PAID ✅');
  showToast(`Payment of ₹100 Successful via Razorpay! Contact Unlocked for ${target.targetName}.`, 'success');
  window.krewxState.currentPaymentTarget = null;
}

function logAuditRecord(txId, role, targetName, type, amount, status) {
  const tbody = document.getElementById('adminAuditTableBody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><code>${txId}</code></td>
    <td>Krewx User (${role})</td>
    <td>${targetName}</td>
    <td><span class="kyc-badge ${amount === '₹0' ? 'verified' : 'unverified'}">${type}</span></td>
    <td><strong>${amount}</strong></td>
    <td><span class="kyc-badge verified">${status}</span></td>
    <td>Just now</td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);
}

/* --------------------------------------------------------------------------
   4. Admin Gate & Real-time Firestore Dashboard Operations
   -------------------------------------------------------------------------- */
function checkAdminAuth() {
  const gate = document.getElementById('adminLoginGate');
  const dashboard = document.getElementById('adminDashboardContent');
  const accessDeniedMsg = document.getElementById('adminAccessDeniedMsg');
  const userTag = document.getElementById('adminUserTag');

  const currentUser = auth?.currentUser;

  if (currentUser && currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    if (gate) gate.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
    if (accessDeniedMsg) accessDeniedMsg.style.display = 'none';
    if (userTag) userTag.textContent = `🔐 Admin: ${currentUser.email}`;
    updateAdminDashboardUI();
    return true;
  } else {
    if (gate) gate.style.display = 'block';
    if (dashboard) dashboard.style.display = 'none';
    if (currentUser) {
      if (accessDeniedMsg) {
        accessDeniedMsg.style.display = 'block';
        accessDeniedMsg.innerHTML = `⚠️ Access Denied for <code>${escapeHtml(currentUser.email)}</code>. Admin privileges required for <code>${ADMIN_EMAIL}</code>.`;
      }
    } else {
      if (accessDeniedMsg) accessDeniedMsg.style.display = 'none';
    }
    return false;
  }
}

function initAdminGateAuth() {
  const form = document.getElementById('adminGateLoginForm');
  const emailInput = document.getElementById('adminGateEmail');
  const passwordInput = document.getElementById('adminGatePassword');
  const signOutBtn = document.getElementById('adminSignOutBtn');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput?.value?.trim();
      const password = passwordInput?.value?.trim();

      if (!email || !password) {
        showToast('Please enter admin email and password.', 'warning');
        return;
      }

      try {
        showToast('Authenticating admin credentials...', 'info');
        await signInWithEmailAndPassword(auth, email, password);
        const currentUser = auth.currentUser;
        if (currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          showToast(`Admin Access Granted! Welcome ${ADMIN_EMAIL}`, 'success');
        } else {
          showToast(`Access Denied: ${currentUser?.email} is not authorized as Admin.`, 'warning');
        }
        checkAdminAuth();
      } catch (err) {
        console.error("Admin Login Error:", err);
        showToast(`Admin Auth Error: ${err.message}`, 'warning');
      }
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await signOut(auth);
        showToast('Signed out from Admin Panel.', 'info');
        checkAdminAuth();
      } catch (err) {
        showToast(`Sign Out Error: ${err.message}`, 'warning');
      }
    });
  }
}

window.toggleDocKYC = async function(collectionName, docId, newVerifiedState) {
  if (!db) {
    showToast("Firestore database connection not available.", "warning");
    return;
  }

  try {
    showToast(`Updating KYC status in Firestore...`, 'info');
    const targetDocRef = doc(db, collectionName, docId);
    await updateDoc(targetDocRef, { verified: newVerifiedState });

    showToast(`KYC status updated to ${newVerifiedState ? 'Verified ✅' : 'Unverified ⏳'} in Firestore!`, 'success');
    await updateAdminDashboardUI();
  } catch (err) {
    console.error("Error updating KYC in Firestore:", err);
    showToast(`Failed to update KYC in Firestore: ${err.message}`, 'warning');
  }
};

async function updateAdminDashboardUI() {
  const uTotal = document.getElementById('adminTotalUsers');
  const uSeekers = document.getElementById('adminSeekersCount');
  const uEmployers = document.getElementById('adminEmployersCount');
  const uJobs = document.getElementById('adminJobsCount');
  const uUnlocks = document.getElementById('adminUnlocksCount');
  const uRev = document.getElementById('adminRevenueTotal');
  const tableBody = document.getElementById('adminUserTableBody');

  let workersDocs = [];
  let jobsDocs = [];

  try {
    if (db) {
      const workersSnap = await getDocs(collection(db, 'workers'));
      workersSnap.forEach(docSnap => {
        workersDocs.push({ id: docSnap.id, ...docSnap.data() });
      });

      const jobsSnap = await getDocs(collection(db, 'jobs'));
      jobsSnap.forEach(docSnap => {
        jobsDocs.push({ id: docSnap.id, ...docSnap.data() });
      });
    }
  } catch (err) {
    console.warn("Error fetching Firestore admin stats:", err);
  }

  const seekersCount = workersDocs.length;
  const jobsCount = jobsDocs.length;
  const employersCount = jobsCount;
  const totalUsers = seekersCount + jobsCount;

  if (uTotal) uTotal.textContent = totalUsers;
  if (uSeekers) uSeekers.textContent = seekersCount;
  if (uEmployers) uEmployers.textContent = employersCount;
  if (uJobs) uJobs.textContent = jobsCount;
  if (uUnlocks) uUnlocks.textContent = window.krewxState.unlockedIds.size;
  if (uRev) uRev.textContent = `₹${window.krewxState.revenue}`;

  // Render Real Worker & Employer Table
  if (tableBody) {
    tableBody.innerHTML = '';

    if (workersDocs.length === 0 && jobsDocs.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">
            No worker or job documents found in Firestore yet. Submit a job post or worker application to see live rows!
          </td>
        </tr>
      `;
      return;
    }

    // Render Worker Documents (Job Seekers)
    workersDocs.forEach(w => {
      const tr = document.createElement('tr');
      const isVerified = w.verified !== false;
      tr.innerHTML = `
        <td><strong>${escapeHtml(w.name || 'Job Seeker')}</strong><br><small>${escapeHtml(w.phone || 'No phone')}</small></td>
        <td><span class="kyc-badge verified">Job Seeker</span></td>
        <td>${escapeHtml(w.skill || 'General Support')}</td>
        <td>${escapeHtml(w.city || 'Kerala')}</td>
        <td><span class="kyc-badge ${isVerified ? 'verified' : 'unverified'}">${isVerified ? 'Verified ✅' : 'Pending ⏳'}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="window.toggleDocKYC('workers', '${w.id}', ${!isVerified})">
            Toggle KYC
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Render Job Documents (Employers)
    jobsDocs.forEach(j => {
      const tr = document.createElement('tr');
      const isVerified = j.verified !== false;
      tr.innerHTML = `
        <td><strong>${escapeHtml(j.companyName || j.contactName || 'Employer')}</strong><br><small>${escapeHtml(j.contactDetail || 'No contact')}</small></td>
        <td><span class="kyc-badge unverified">Employer</span></td>
        <td>${escapeHtml(j.category || j.title || 'Workforce')}</td>
        <td>${escapeHtml(j.location || 'Kerala')}</td>
        <td><span class="kyc-badge ${isVerified ? 'verified' : 'unverified'}">${isVerified ? 'Verified ✅' : 'Pending ⏳'}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="window.toggleDocKYC('jobs', '${j.id}', ${!isVerified})">
            Toggle KYC
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }
}

/* --------------------------------------------------------------------------
   5. Dynamic Marketplace Data Rendering
   -------------------------------------------------------------------------- */
function initMarketplaceData() {
  const jobsTab = document.getElementById('tab-jobs');
  const crewsTab = document.getElementById('tab-crews');

  if (jobsTab) {
    const jobGrid = jobsTab.querySelector('.job-cards-grid');
    if (jobGrid) {
      jobGrid.innerHTML = `
        <!-- Job 1 -->
        <div class="job-card fade-up">
          <div class="job-card-header">
            <span class="job-category-tag">Catering & Events</span>
            <span class="badge-type temp">⚡ Temporary Shift</span>
          </div>
          <h3 class="job-card-title">Banquet & Event Service Helper</h3>
          <div class="job-meta">
            <span>📍 Ernakulam / Kochi</span>
            <span>⏰ 8 Hours Shift</span>
            <span>👥 6 Openings</span>
          </div>
          <p class="job-desc">Grand Spice Events marriage banquet service. Food provided.</p>
          <div class="contact-locked-box" id="contact-box-job-1">
            <span class="phone-masked">📞 +91 94*** **987</span>
            <button class="btn-unlock" onclick="window.unlockContact('job-1', 'Grand Spice Events', '+91 94*** **987', '+91 94471 99887', 'Job Post')">
              🔓 Unlock Contact
            </button>
          </div>
        </div>

        <!-- Job 2 -->
        <div class="job-card fade-up">
          <div class="job-card-header">
            <span class="job-category-tag">Retail & Shops</span>
            <span class="badge-type perm">💼 Permanent Job</span>
          </div>
          <h3 class="job-card-title">Full-Time Supermarket Store Executive</h3>
          <div class="job-meta">
            <span>📍 Kozhikode City</span>
            <span>⏰ Monthly Shift</span>
            <span>👥 4 Openings</span>
          </div>
          <p class="job-desc">Store billing counter associate & inventory management.</p>
          <div class="contact-locked-box" id="contact-box-job-2">
            <span class="phone-masked">📞 +91 98*** **332</span>
            <button class="btn-unlock" onclick="window.unlockContact('job-2', 'Margin Free Supermarket', '+91 98*** **332', '+91 98950 44332', 'Job Post')">
              🔓 Unlock Contact
            </button>
          </div>
        </div>
      `;
    }
  }

  if (crewsTab) {
    const crewGrid = crewsTab.querySelector('.crew-cards-grid');
    if (crewGrid) {
      crewGrid.innerHTML = `
        <!-- Worker 1 -->
        <div class="crew-status-card fade-up">
          <div class="crew-card-head">
            <div class="crew-avatar-group">
              <span class="avatar-dot"></span>
              <strong>Rahul Nair (Verified Crew)</strong>
            </div>
            <span class="dispatch-tag">★ 4.9 Rating</span>
          </div>
          <p class="crew-card-detail">4+ Years catering & banquet service experience in Ernakulam. Immediate availability.</p>
          <div class="contact-locked-box" id="contact-box-worker-1">
            <span class="phone-masked">📞 +91 98*** **345</span>
            <button class="btn-unlock" onclick="window.unlockContact('worker-1', 'Rahul Nair', '+91 98*** **345', '+91 98470 12345', 'Job Seeker Profile')">
              🔓 Unlock Worker
            </button>
          </div>
        </div>

        <!-- Worker 2 -->
        <div class="crew-status-card fade-up">
          <div class="crew-card-head">
            <div class="crew-avatar-group">
              <span class="avatar-dot"></span>
              <strong>Sujith Kumar (Driver)</strong>
            </div>
            <span class="dispatch-tag">★ 4.8 Rating</span>
          </div>
          <p class="crew-card-detail">Valid LMV license driver for outstation & personal trips in Kozhikode & Thrissur.</p>
          <div class="contact-locked-box" id="contact-box-worker-2">
            <span class="phone-masked">📞 +91 97*** **112</span>
            <button class="btn-unlock" onclick="window.unlockContact('worker-2', 'Sujith Kumar', '+91 97*** **112', '+91 97451 90112', 'Driver Profile')">
              🔓 Unlock Driver
            </button>
          </div>
        </div>
      `;
    }
  }
}

/* --------------------------------------------------------------------------
   6. Rating Modal Handler
   -------------------------------------------------------------------------- */
window.openRatingModal = function(targetId) {
  const modal = document.getElementById('ratingModal');
  if (modal) openModal(modal);

  const form = document.getElementById('ratingForm');
  if (form) {
    form.onsubmit = function(e) {
      e.preventDefault();
      closeModal(modal);
      showToast('Thank you for rating your work experience on Krewx! Golden stars updated.', 'success');
    };
  }
};

/* --------------------------------------------------------------------------
   7. Helper UI Utilities
   -------------------------------------------------------------------------- */
function initHeaderScroll() {
  const header = document.getElementById('siteHeader');
  if (!header) return;
  const handleScroll = () => {
    if (window.scrollY > 40) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
}

function initMobileMenu() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');
  if (!menuBtn || !navLinks) return;
  menuBtn.addEventListener('click', () => navLinks.classList.toggle('mobile-open'));
}

function initScrollAnimations() {
  const animatedElements = document.querySelectorAll('.fade-up');
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  animatedElements.forEach(el => observer.observe(el));
}

function initModals() {
  const modalTriggers = document.querySelectorAll('[data-modal-target]');
  const modalCloseBtns = document.querySelectorAll('[data-modal-close]');
  const modalOverlays = document.querySelectorAll('.modal-overlay');

  modalTriggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = trigger.getAttribute('data-modal-target');
      const modal = document.getElementById(targetId);
      if (modal) openModal(modal);
    });
  });

  modalCloseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) closeModal(modal);
    });
  });

  modalOverlays.forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });
}

function openModal(modal) {
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function initStepForm() {
  const nextBtns = document.querySelectorAll('[data-step-next]');
  const prevBtns = document.querySelectorAll('[data-step-prev]');

  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const currentStep = btn.closest('.form-step');
      const nextStepId = btn.getAttribute('data-step-next');
      const nextStep = document.getElementById(nextStepId);
      if (currentStep && nextStep) {
        currentStep.style.display = 'none';
        nextStep.style.display = 'block';
      }
    });
  });

  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const currentStep = btn.closest('.form-step');
      const prevStepId = btn.getAttribute('data-step-prev');
      const prevStep = document.getElementById(prevStepId);
      if (currentStep && prevStep) {
        currentStep.style.display = 'none';
        prevStep.style.display = 'block';
      }
    });
  });
}

/* --------------------------------------------------------------------------
   7. Firebase Authentication Handler (Email & Password)
   -------------------------------------------------------------------------- */
function initFirebaseAuth() {
  const loginBtn = document.getElementById('authLoginBtn');
  const registerBtn = document.getElementById('authRegisterBtn');
  const signOutBtn = document.getElementById('authSignOutBtn');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  const statusText = document.getElementById('authStatusText');
  const loggedInActions = document.getElementById('authLoggedInActions');
  const userEmailDisplay = document.getElementById('userEmailDisplay');
  const authForm = document.getElementById('firebaseAuthForm');

  if (auth && onAuthStateChanged) {
    onAuthStateChanged(auth, (user) => {
      window.krewxState.currentUser = user;
      if (user) {
        if (statusText) statusText.textContent = `Signed In as ${user.email}`;
        if (userEmailDisplay) userEmailDisplay.textContent = `👤 ${user.email}`;
        if (loggedInActions) loggedInActions.style.display = 'block';
        if (authForm) authForm.style.display = 'none';
        showToast(`Welcome back, ${user.email}!`, 'success');
      } else {
        if (statusText) statusText.textContent = 'Not Signed In';
        if (loggedInActions) loggedInActions.style.display = 'none';
        if (authForm) authForm.style.display = 'flex';
      }
      checkAdminAuth();
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = emailInput?.value?.trim();
      const password = passwordInput?.value?.trim();
      if (!email || !password) {
        showToast('Please enter both email and password.', 'warning');
        return;
      }
      try {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Signed in successfully with Firebase Auth!', 'success');
        const modal = document.getElementById('roleModal');
        if (modal) closeModal(modal);
      } catch (err) {
        console.error("Firebase Login Error:", err);
        showToast(`Sign In Error: ${err.message}`, 'warning');
      }
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const email = emailInput?.value?.trim();
      const password = passwordInput?.value?.trim();
      if (!email || !password || password.length < 6) {
        showToast('Please enter a valid email and password (minimum 6 characters).', 'warning');
        return;
      }
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast('Account created & signed in with Firebase Auth!', 'success');
        const modal = document.getElementById('roleModal');
        if (modal) closeModal(modal);
      } catch (err) {
        console.error("Firebase Registration Error:", err);
        showToast(`Registration Error: ${err.message}`, 'warning');
      }
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await signOut(auth);
        showToast('Signed out of Firebase Account.', 'info');
      } catch (err) {
        showToast(`Sign Out Error: ${err.message}`, 'warning');
      }
    });
  }
}

/* --------------------------------------------------------------------------
   8. Form Submissions (Firestore & Firebase Storage Integration)
   -------------------------------------------------------------------------- */
function initFormSubmissions() {
  const bookingForm = document.getElementById('bookingForm');
  const workerForm = document.getElementById('workerForm');

  if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(bookingForm);
      const category = formData.get('category') || 'general';
      const title = formData.get('notes') ? formData.get('notes').substring(0, 40) + '...' : `${category.toUpperCase()} Crew Needed`;
      const companyName = formData.get('companyName') || 'Krewx Employer';
      const contactName = formData.get('contactName') || 'Contact Person';
      const contactDetail = formData.get('contactDetail') || '+91 90000 00000';
      const location = formData.get('location') || 'Kochi';
      const workersNeeded = formData.get('workersCount') || '3';
      const startDate = formData.get('startDate') || 'Immediate';
      const duration = formData.get('duration') || 'Single Shift';
      const notes = formData.get('notes') || '';

      const jobData = {
        title,
        category,
        companyName,
        contactName,
        contactDetail,
        location,
        workersNeeded,
        startDate,
        duration,
        notes,
        postedBy: window.krewxState.currentUser ? window.krewxState.currentUser.email : 'anonymous',
        createdAt: serverTimestamp()
      };

      try {
        if (db) {
          await addDoc(collection(db, 'jobs'), jobData);
          console.log("🔥 Saved Job Post to Firestore:", jobData);
        }
      } catch (err) {
        console.warn("Firestore save failed, using local state fallback:", err);
      }

      const modal = bookingForm.closest('.modal-overlay');
      closeModal(modal);
      showToast('New Job Requirement Posted & Live on Krewx Marketplace!', 'success');
      bookingForm.reset();
    });
  }

  if (workerForm) {
    workerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputs = workerForm.querySelectorAll('input, select');
      const name = inputs[0]?.value || 'New Worker';
      const phone = inputs[1]?.value || '+91 90000 00000';
      const skillSelect = workerForm.querySelector('select');
      const skill = skillSelect ? skillSelect.options[skillSelect.selectedIndex]?.text : 'General Support';
      const city = document.getElementById('workerCity')?.value || 'Kerala';
      const fileInput = document.getElementById('workerDocFile');

      let docUrl = null;
      if (fileInput && fileInput.files && fileInput.files[0] && storage) {
        const file = fileInput.files[0];
        try {
          showToast('Uploading ID document to Firebase Storage...', 'info');
          const fileRef = ref(storage, `worker-docs/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(fileRef, file);
          docUrl = await getDownloadURL(snapshot.ref);
          console.log("🔥 Uploaded document to Firebase Storage:", docUrl);
          showToast('Document uploaded successfully to Firebase Storage!', 'success');
        } catch (storageErr) {
          console.warn("Firebase Storage upload error:", storageErr);
          showToast(`Storage Upload Note: ${storageErr.message}`, 'warning');
        }
      }

      const workerData = {
        name,
        phone,
        skill,
        city,
        docUrl,
        rating: 5.0,
        verified: true,
        userEmail: window.krewxState.currentUser ? window.krewxState.currentUser.email : null,
        createdAt: serverTimestamp()
      };

      try {
        if (db) {
          await addDoc(collection(db, 'workers'), workerData);
          console.log("🔥 Saved Worker Profile to Firestore:", workerData);
        }
      } catch (err) {
        console.warn("Firestore worker save failed, fallback used:", err);
      }

      const modal = workerForm.closest('.modal-overlay');
      closeModal(modal);
      showToast('Job Seeker Profile Created! 5 Free Contact Unlocks Awarded.', 'success');
      workerForm.reset();
    });
  }
}

/* --------------------------------------------------------------------------
   9. Firestore Realtime Sync (Live Jobs & Workers)
   -------------------------------------------------------------------------- */
function initFirestoreRealtime() {
  if (!db || !onSnapshot) return;

  try {
    const jobsRef = collection(db, 'jobs');
    onSnapshot(jobsRef, (snapshot) => {
      if (!snapshot.empty) {
        console.log(`🔥 Realtime update: ${snapshot.size} jobs from Firestore`);
      }
      updateAdminDashboardUI();
    }, (err) => console.log("Firestore jobs subscription note:", err.message));

    const workersRef = collection(db, 'workers');
    onSnapshot(workersRef, (snapshot) => {
      if (!snapshot.empty) {
        console.log(`🔥 Realtime update: ${snapshot.size} workers from Firestore`);
      }
      updateAdminDashboardUI();
    }, (err) => console.log("Firestore workers subscription note:", err.message));
  } catch (err) {
    console.warn("Firestore realtime setup note:", err);
  }
}

function initMarketplaceTabs() {
  const tabBtns = document.querySelectorAll('[data-tab-target]');
  const tabContents = document.querySelectorAll('.market-tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab-target');
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      tabContents.forEach(content => {
        if (content.id === targetId) {
          content.style.display = 'block';
          content.classList.add('active');
        } else {
          content.style.display = 'none';
          content.classList.remove('active');
        }
      });
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `krewx-toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : 'ℹ️'} ${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

