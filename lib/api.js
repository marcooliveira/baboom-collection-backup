'use strict';

const got = require('got');
const pwdHash = require('./pwdHash');

class Api {
  constructor() {
    this.user = null;
  }

  login(email, password, remember_me = false) {
    return got.post('https://baboom.com/auth/login', {
      json: true,
      headers: {
        'X-BB-S': '1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: pwdHash(password),
        remember_me
      })
    })
    .then(_handleRes)
    .then(res => {
      // store user
      this.user = res.user;

      return res;
    });
  }

  songs(offset, limit) {
    if (!this.user) {
      throw new Error('Must be logged in. See login()');
    }

    return got(`https://baboom.com/api/library/songs?offset=${offset}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${this.user.access_token}`,
      },
      json: true
    })
    .then(_handleRes);
  }

  songStream(streamAudioUrl, format) {
    return got.stream(streamAudioUrl + `?tags=${format}&access_token=${this.user.access_token}`);
  }
}

// -----------------------------------------------------------------------------

function _handleRes(res) {
  if (!res.body.ok) {
    throw new Error(JSON.stringify(res.body));
  }

  return res.body.data;
}

// -----------------------------------------------------------------------------

module.exports = Api;
