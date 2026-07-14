const { CosmosClient } = require('@azure/cosmos');

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database = client.database('wedding-rsvp');
const container = database.container('rsvps');

module.exports = async function (context, req) {
  const respond = (status, body) => {
    context.res = { status, headers: { 'Content-Type': 'application/json' }, body };
  };

  try {
    const adminPassword = req.headers['x-admin-password'];
    if (!adminPassword || adminPassword !== process.env.SITE_PASSWORD) {
      return respond(401, { ok: false, error: 'Unauthorized. Provide valid x-admin-password header.' });
    }

    const { resources } = await container.items.readAll().fetchAll();

    const summary = resources.map(r => ({
      householdId: r.householdId,
      submittedAt: r.submittedAt,
      guests: r.guests.map(g => ({
        guestId: g.guestId,
        firstName: g.firstName,
        lastName: g.lastName,
        ageGroup: g.ageGroup,
        attending: g.attending,
        meal: g.meal,
        dietaryRestrictions: g.dietaryRestrictions,
      })),
    }));

    return respond(200, { ok: true, rsvps: summary });
  } catch (err) {
    context.log.error('Unhandled error', err.message);
    return respond(500, { ok: false, error: 'Internal server error.' });
  }
};
