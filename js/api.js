const API = {
  _config: null,

  async init() {
    const resp = await fetch('/data/config.json');
    this._config = await resp.json();
  },

  isLocal() {
    if (this._config && this._config.apiBaseUrl) {
      return false;
    }
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '';
  },

  _apiUrl(path) {
    const base = this._config && this._config.apiBaseUrl;
    if (base) {
      return base + path;
    }
    if (this.isLocal()) {
      return path;
    }
    return path;
  },

  _getSitePassword() {
    return this._config ? this._config.sitePassword : '';
  },

  async verifyPassword(password) {
    if (this.isLocal()) {
      return password === this._getSitePassword();
    }
    try {
      const resp = await fetch(this._apiUrl('/api/verify-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await resp.json();
      return data.ok === true;
    } catch {
      return false;
    }
  },

  async submitRSVP(payload) {
    if (this.isLocal()) {
      Storage.saveRSVP(payload.householdId, payload);
      return { ok: true };
    }
    payload.sitePassword = this._getSitePassword();
    const resp = await fetch(this._apiUrl('/api/submit-rsvp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.json();
  },

  async listRSVPs(adminPassword) {
    if (this.isLocal()) {
      const rsvps = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wedding_rsvp_')) {
          const householdId = parseInt(key.replace('wedding_rsvp_', ''), 10);
          try {
            rsvps[householdId] = JSON.parse(localStorage.getItem(key));
          } catch {}
        }
      }
      return rsvps;
    }
    try {
      const resp = await fetch(this._apiUrl('/api/list-rsvps'), {
        headers: { 'x-admin-password': adminPassword },
      });
      const data = await resp.json();
      if (data.ok) {
        const rsvps = {};
        for (const r of data.rsvps) {
          rsvps[r.householdId] = r;
        }
        return rsvps;
      }
      return {};
    } catch {
      return {};
    }
  },
};
