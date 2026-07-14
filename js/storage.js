const Storage = {
  SESSION_KEY: 'wedding_rsvp_session',
  RSVP_PREFIX: 'wedding_rsvp_',

  saveRSVP(householdId, data) {
    localStorage.setItem(this.RSVP_PREFIX + householdId, JSON.stringify(data));
  },

  getRSVP(householdId) {
    const raw = localStorage.getItem(this.RSVP_PREFIX + householdId);
    return raw ? JSON.parse(raw) : null;
  },

  saveSession(data) {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(data));
  },

  getSession() {
    const raw = sessionStorage.getItem(this.SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  clearSession() {
    sessionStorage.removeItem(this.SESSION_KEY);
  },
};
