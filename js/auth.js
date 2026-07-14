const Auth = {
  async init() {
    await API.init();
  },

  async login(password) {
    const ok = await API.verifyPassword(password);
    if (ok) {
      Storage.saveSession({ authenticated: true });
      return true;
    }
    return false;
  },

  logout() {
    Storage.clearSession();
  },

  checkAuth() {
    const session = Storage.getSession();
    return session && session.authenticated;
  },
};
