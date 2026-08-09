const Auth = {
  async init() {
    await API.init();
    const session = Storage.getSession();
    if (session && session.authenticated && session.password) {
      API._plainPassword = session.password;
    } else if (session?.authenticated) {
      Storage.clearSession();
    }
  },

  async login(password) {
    const ok = await API.verifyPassword(password);
    if (ok) {
      Storage.saveSession({ authenticated: true, password });
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
