const { CosmosClient } = require('@azure/cosmos');

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database = client.database('wedding-rsvp');
const container = database.container('rsvps');

module.exports = async function (context, req) {
  const respond = (status, body) => {
    context.res = { status, headers: { 'Content-Type': 'application/json' }, body };
  };

  try {
    const householdId = parseInt(req.query.householdId, 10);

    if (isNaN(householdId)) {
      return respond(400, { ok: false, error: 'Query parameter householdId must be a number.' });
    }

    const querySpec = {
      query: 'SELECT * FROM c WHERE c.householdId = @householdId',
      parameters: [{ name: '@householdId', value: householdId }],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    if (resources.length === 0) {
      return respond(404, { ok: false, error: `No RSVP found for household ${householdId}.` });
    }

    return respond(200, { ok: true, rsvp: resources[0] });
  } catch (err) {
    context.log.error('Unhandled error', err.message);
    return respond(500, { ok: false, error: 'Internal server error.' });
  }
};
