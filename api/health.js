'use strict';

/**
 * Vercel Serverless Function — health probe.
 * GET https://<project>.vercel.app/api/health
 */

const { handleHealthRequest } = require('../src/webhook-http');

module.exports = async (req, res) => {
  handleHealthRequest(req, res);
};
