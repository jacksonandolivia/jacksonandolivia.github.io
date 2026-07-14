const { CosmosClient } = require('@azure/cosmos');

const VALID_MEALS = [
  'chicken', 'fish', 'beef', 'vegetarian',
  'child-chicken-nuggets', 'child-mac-cheese',
];

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database = client.database('wedding-rsvp');
const container = database.container('rsvps');

module.exports = async function (context, req) {
  const respond = (status, body) => {
    context.res = { status, headers: { 'Content-Type': 'application/json' }, body };
  };

  try {
    const payload = req.body;

    if (!payload || typeof payload !== 'object') {
      return respond(400, { ok: false, error: 'Request body must be a JSON object.' });
    }

    if (!payload.sitePassword || payload.sitePassword !== process.env.SITE_PASSWORD) {
      return respond(401, { ok: false, error: 'Invalid site password.' });
    }

    if (typeof payload.householdId !== 'number') {
      return respond(400, { ok: false, error: 'Missing or invalid field: householdId (must be a number).' });
    }

    if (!Array.isArray(payload.guests) || payload.guests.length === 0) {
      return respond(400, { ok: false, error: 'Missing or invalid field: guests (must be a non-empty array).' });
    }

    const errors = [];
    for (const [i, g] of payload.guests.entries()) {
      if (typeof g.guestId !== 'number') errors.push(`guests[${i}].guestId must be a number`);
      if (!g.firstName || typeof g.firstName !== 'string') errors.push(`guests[${i}].firstName is required`);
      if (!g.lastName || typeof g.lastName !== 'string') errors.push(`guests[${i}].lastName is required`);
      if (typeof g.attending !== 'boolean') errors.push(`guests[${i}].attending must be a boolean`);
      if (g.attending && (!g.meal || !VALID_MEALS.includes(g.meal))) {
        errors.push(`guests[${i}].meal must be one of: ${VALID_MEALS.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return respond(400, { ok: false, error: errors.join('; ') });
    }

    const now = new Date().toISOString();

    const doc = {
      householdId: payload.householdId,
      guests: payload.guests.map(g => ({
        guestId: g.guestId,
        firstName: g.firstName,
        lastName: g.lastName,
        ageGroup: g.ageGroup || null,
        attending: g.attending,
        meal: g.attending ? g.meal : null,
        dietaryRestrictions: g.dietaryRestrictions || '',
      })),
      submittedAt: now,
    };

    // Upsert — find existing document then replace, or create new
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.householdId = @householdId',
      parameters: [{ name: '@householdId', value: payload.householdId }],
    };

    let existingId;
    try {
      const { resources } = await container.items.query(querySpec).fetchAll();
      if (resources.length > 0) {
        existingId = resources[0].id;
      }
    } catch (queryErr) {
      context.log.warn('Query failed, proceeding with create', queryErr.message);
    }

    if (existingId) {
      doc.id = existingId;
      await container.item(existingId, payload.householdId).replace(doc);
    } else {
      const { resource } = await container.items.create(doc);
      doc.id = resource.id;
    }

    return respond(201, { ok: true, id: doc.id });
  } catch (err) {
    context.log.error('Unhandled error', err.message, err.stack);
    return respond(500, { ok: false, error: 'Internal server error.' });
  }
};
