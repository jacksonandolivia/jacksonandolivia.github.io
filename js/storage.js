const Storage = {
  SESSION_KEY: 'wedding_rsvp_session',

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
