const promptly = require('promptly');
const got      = require('got');
const fs       = require('fs');
const async    = require('async');
const mkdirp   = require('mkdirp');
const path     = require('path');
const planify  = require('planify');
const api      = new (require('./lib/Api'))();

// <CONFIG>
const limitPerPage        = 100;
const downloadConcurrency = 5;
const format              = 'mp3_320k'; // available options are: flac, mp3_320k, mp3_192k, ogg_vorbis_q9, ogg_vorbis_q5, ogg_vorbis_q2
// </CONFIG>

planify({ reporter: 'blocks' })

.phase('Generate user credentials', phase => {
  phase.step('Get user details', (data, done) => {
    promptly.prompt('Email: ', (err, email) => {
      if (err) {
        return done(err);
      }

      data.email = email;

      promptly.password('Password: ', (err, password) => {
        if (err) {
          return done(err);
        }

        data.password = password;

        return done();
      })
    })
  })
  .step('Login', data => {
    return api.login(data.email, data.password)
    .then(user => {
      console.log('Logged in as:');
      console.log(JSON.stringify(user, null, 2));
    });
  })
})

.phase('Gather collection list', phase => {
  phase.step('Fetch list of songs', data => {
    return api.songs(0, limitPerPage)
    .then(res => {
      data.requests = [];

      // initialise songs list with first page that was fetched
      data.songs = res.items;

      let offset = limitPerPage;
      data.total = res.meta.total;

      // prepare all requests to be made
      while (offset <= data.total) {
        let req = api.songs(offset, limitPerPage)
                  .then(res => data.songs = data.songs.concat(res.items));

        data.requests.push(req);

        offset += limitPerPage;
      }

      // wait for all pages to be fetched
      return Promise.all(data.requests)
        .then(() => console.log(`${data.songs.length} songs found`));
    });
  })

  .step('Store songs metadata', (data, done) => {
    mkdirp('songs', err => {
      if (err) {
        throw err;
      }

      fs.writeFileSync(path.join('songs', 'songs.json'), JSON.stringify(data.songs, null, 2));

      return done();
    });
  });
})

.step(`Download songs`, data => {
  return new Promise((resolve, reject) => {
    console.log('total songs', data.songs.length);
    async.eachLimit(data.songs, downloadConcurrency, (song, callback) => {
console.log(JSON.stringify(song, null, 2));
      let albumArtist   = (song.album.display_artist ? song.album.display_artist : song.display_artist).replace(/\//g,'-');
      let albumTitle    = song.album.title.replace(/\//g,'-');
      let songArtist    = song.display_artist.replace(/\//g,'-');
      let songTitle     = song.title.replace(/\//g,'-');
      let songNumber    = song.number;
      let folder        = path.join('songs', albumArtist, albumTitle);
      let songFormat    = song.stream.audio.tags.indexOf(format) >= 0 ? format : song.stream.audio.tags[0]; // if the prefered format is available, use, else use the available one
      let fileExtension = songFormat.split('_')[0];
      let filePath      = path.join(folder, `${songNumber} - ${songArtist} - ${songTitle}.${fileExtension}`);

      mkdirp(folder, (err) => {
        if (err) {
          return callback(err);
        }

        // get file
        console.log(`Downloading ${filePath}`);
        api.songStream(song.stream.audio.url, songFormat)
          .on('error', callback)
        // and write into disk
        .pipe(fs.createWriteStream(filePath))
          .on('error', callback)
          .on('finish', callback);
      });
    }, (err) => {
      if (err) {
        return reject(err);
      }

      return resolve();
    });
  });
})
.run({})
.catch(err => console.log(err));
