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

  async _hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async verifyPassword(password) {
    const hash = await this._hashPassword(password);
    if (hash === this._config.sitePasswordHash) {
      this._plainPassword = password;
      return true;
    }
    return false;
  },

  async submitRSVP(payload) {
    if (this.isLocal()) {
      Storage.saveRSVP(payload.householdId, payload);
      return { ok: true };
    }
    payload.sitePassword = this._plainPassword;
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
