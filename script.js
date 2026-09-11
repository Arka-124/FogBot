/**
 * FogBot Login Portal — Client-side authentication & reCAPTCHA handler
 */

(function () {
  'use strict';

  // DOM Elements
  const loginForm = document.getElementById('loginForm');
  const userIdInput = document.getElementById('userId');
  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const eyeIcon = document.getElementById('eyeIcon');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const feedbackBanner = document.getElementById('feedbackBanner');

  // Password visibility toggle
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', function () {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      
      // Update icon
      if (isPassword) {
        eyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        `;
        togglePasswordBtn.setAttribute('aria-label', 'Hide password');
      } else {
        eyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        `;
        togglePasswordBtn.setAttribute('aria-label', 'Show password');
      }
    });
  }

  // Display Feedback Notification
  function showFeedback(message, type = 'error') {
    if (!feedbackBanner) return;

    feedbackBanner.className = `feedback-banner is-${type}`;
    const icon = type === 'success' 
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    feedbackBanner.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
  }

  function clearFeedback() {
    if (!feedbackBanner) return;
    feedbackBanner.className = 'feedback-banner';
    feedbackBanner.innerHTML = '';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Set loading state on submit button
  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    if (loading) {
      submitBtn.classList.add('is-loading');
      btnText.textContent = 'Verifying...';
    } else {
      submitBtn.classList.remove('is-loading');
      btnText.textContent = 'Authenticate & Enter';
    }
  }

  // Global callbacks for reCAPTCHA events
  window.onRecaptchaSuccess = function (token) {
    clearFeedback();
  };

  window.onRecaptchaExpired = function () {
    showFeedback('reCAPTCHA expired. Please verify again.', 'error');
  };

  // Form Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearFeedback();

      const userId = userIdInput ? userIdInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      // 1. Client validation
      if (!userId) {
        showFeedback('Please enter your Operator User ID.', 'error');
        if (userIdInput) userIdInput.focus();
        return;
      }

      if (!password) {
        showFeedback('Please enter your Security Password.', 'error');
        if (passwordInput) passwordInput.focus();
        return;
      }

      // 2. Obtain reCAPTCHA response token
      let recaptchaToken = '';
      if (typeof grecaptcha !== 'undefined') {
        recaptchaToken = grecaptcha.getResponse();
      }

      if (!recaptchaToken) {
        showFeedback("Please complete the reCAPTCHA 'I'm not a robot' verification.", 'error');
        return;
      }

      // 3. Submit credentials & token to backend
      setLoading(true);

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: userId,
            password: password,
            recaptchaToken: recaptchaToken
          })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          // Successful login
          showFeedback(data.message || 'Authentication successful! Access granted.', 'success');
          btnText.textContent = 'ACCESS GRANTED';
          submitBtn.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)';
          submitBtn.style.boxShadow = '0 6px 20px rgba(34, 197, 94, 0.4)';

          // Clear password input for security
          if (passwordInput) passwordInput.value = '';

          // Optional: forward to command overview or show authenticated status
          setTimeout(function () {
            btnText.textContent = 'Redirecting to Rover Telemetry...';
            setTimeout(function () {
              window.location.href = 'landing.html';
            }, 1200);
          }, 1500);

        } else {
          // Authentication or reCAPTCHA failure
          showFeedback(data.message || 'Authentication failed. Please verify credentials.', 'error');
          setLoading(false);

          // Reset reCAPTCHA on failed attempt
          if (typeof grecaptcha !== 'undefined') {
            grecaptcha.reset();
          }
        }
      } catch (err) {
        console.error('[Network Error]:', err);
        showFeedback('Unable to connect to authentication server. Please check your connection.', 'error');
        setLoading(false);

        if (typeof grecaptcha !== 'undefined') {
          grecaptcha.reset();
        }
      }
    });
  }

})();
