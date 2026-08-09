const API = {
  _config: null,

  async init() {
    const resp = await fetch('/data/config.json?v=admin-password-20260809');
    this._config = await resp.json();
  },

  isLocal() {
    return !this._config || !this._config.apiBaseUrl;
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

  async submitRSVP(payload, sitePassword) {
    if (this.isLocal()) {
      Storage.saveRSVP(payload.householdId, payload);
      return { ok: true };
    }
    payload.sitePassword = sitePassword || this._plainPassword;
    const resp = await fetch(this._apiUrl('/api/submit-rsvp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    if (!resp.ok || result.ok === false) {
      throw new Error(result.error || `Unable to submit RSVP (${resp.status}).`);
    }
    return result;
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
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `Unable to load RSVP responses (${resp.status}).`);
      }
      const rsvps = {};
      for (const r of data.rsvps) {
        rsvps[r.householdId] = r;
      }
      return rsvps;
    } catch (error) {
      throw error;
    }
  },

  async clearRSVPs(adminPassword) {
    if (this.isLocal()) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wedding_rsvp_')) {
          localStorage.removeItem(key);
        }
      }
      return { ok: true };
    }

    try {
      const resp = await fetch(this._apiUrl('/api/clear-rsvps'), {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword },
      });
      return resp.json();
    } catch {
      return { ok: false, error: 'Unable to clear RSVP responses.' };
    }
  },
};
