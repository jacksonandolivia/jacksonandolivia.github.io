module.exports = async function (context, req) {
  const { password } = req.body || {};

  if (!password) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: 'Missing password.' },
    };
    return;
  }

  const valid = password === process.env.SITE_PASSWORD;

  context.res = {
    status: valid ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
    body: { ok: valid },
  };
};
