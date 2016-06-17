'use strict';

const crypto = require('crypto');

module.exports = (data) => {
  return crypto.createHash('sha1').update(data).digest('hex');
};
