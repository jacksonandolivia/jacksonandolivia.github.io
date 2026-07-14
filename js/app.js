const App = {
  async init() {
    await API.init();
    await Auth.init();
    await RSVPForm.init();

    if (Auth.checkAuth()) {
      this.showLookup();
    } else {
      this.showLogin();
    }

    document.getElementById('login-form').addEventListener('submit', (e) => this._handleLogin(e));
    document.getElementById('lookup-form').addEventListener('submit', (e) => this._handleLookup(e));
    document.getElementById('logout-from-lookup').addEventListener('click', () => this._handleLogout());
  },

  showLogin() {
    document.getElementById('login-section').hidden = false;
    document.getElementById('lookup-section').hidden = true;
    document.getElementById('rsvp-container').innerHTML = '';
    document.getElementById('login-error').hidden = true;
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  },

  showLookup() {
    document.getElementById('login-section').hidden = true;
    document.getElementById('lookup-section').hidden = false;
    document.getElementById('rsvp-container').innerHTML = '';
    document.getElementById('lookup-error').hidden = true;
    document.getElementById('lookup-firstname').value = '';
    document.getElementById('lookup-lastname').value = '';
    document.getElementById('lookup-firstname').focus();
  },

  async _handleLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    const password = document.getElementById('login-password').value;

    const ok = await Auth.login(password);
    if (ok) {
      errorEl.hidden = true;
      this.showLookup();
    } else {
      errorEl.textContent = 'Incorrect password. Please try again.';
      errorEl.hidden = false;
    }
  },

  _handleLookup(e) {
    e.preventDefault();
    const errorEl = document.getElementById('lookup-error');
    const firstName = document.getElementById('lookup-firstname').value;
    const lastName = document.getElementById('lookup-lastname').value;

    if (!firstName.trim() || !lastName.trim()) {
      errorEl.textContent = 'Please enter both your first and last name.';
      errorEl.hidden = false;
      return;
    }

    const household = RSVPForm.lookup(firstName, lastName);
    if (!household) {
      errorEl.textContent = `No party found for "${firstName} ${lastName}". Please check the spelling or contact the couple.`;
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;
    const container = document.getElementById('rsvp-container');
    RSVPForm.render(container);
  },

  _handleLogout() {
    Auth.logout();
    this.showLogin();
  },
};
