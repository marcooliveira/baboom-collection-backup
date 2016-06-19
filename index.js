const promptly = require('promptly');
const got      = require('got');
const fs       = require('fs');
const Promise  = require('bluebird');
const mkdirp   = Promise.promisify(require('mkdirp'));
const path     = require('path');
const planify  = require('planify');
const chalk    = require('chalk');
const api      = new (require('./lib/Api'))();

// <CONFIG>
const limitPerPage        = 500;
const downloadConcurrency = 10;
const format              = 'mp3_320k'; // available options are: flac, mp3_320k, mp3_192k, ogg_vorbis_q9, ogg_vorbis_q5, ogg_vorbis_q2
// </CONFIG>

planify({ reporter: 'blocks' })

.phase('Generate user credentials', phase => {
    phase.step('Get user details', (data, done) => {
        promptly.prompt('Email', (err, email) => {
            if (err) {
                return done(err);
            }

            data.email = email;

            promptly.password('Password', (err, password) => {
                if (err) {
                    return done(err);
                }

                data.password = password;

                return done();
            });
        });
    })
    .step('Login', data => {
        return api.login(data.email, data.password)
        .then(user => {
            console.log('Logged in as:');
            console.log(JSON.stringify(user, null, 2));
            data.subscription = user.contexts.all[0].subject.subscription;
            data.country = user.country;
        });
    });
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

    .step('Store songs metadata', (data) => {
        return mkdirp('songs')
        .then(() => fs.writeFileSync(path.join('songs', 'songs.json'), JSON.stringify(data.songs, null, 2)));
    });
})

.step(`Download songs`, data => {
    let progress = (function (increment = true) {
        if (increment) {
            this.handled++;
        }

        console.log(chalk.green(`${this.handled} / ${this.total} done (${(Math.round(this.handled / this.total * 100))}%).`));
    }).bind({
        total: data.total,
        handled: 0
    });

    return Promise.map(data.songs, song => {
        if (!song.album) {
            song.album = {
                display_artist: 'Unknown',
                title: 'Untitled'
            };
        }

        try {
            var albumArtist   = (song.album.display_artist ? song.album.display_artist : song.display_artist).replace(/\//g,'-');
            var albumTitle    = song.album.title.replace(/\//g,'-');
            var songArtist    = song.display_artist.replace(/\//g,'-');
            var songTitle     = song.title.replace(/\//g,'-');
            var songNumber    = song.number;
            var folder        = path.join('songs', albumArtist, albumTitle);
            var songFormat    = song.stream.audio.tags.indexOf(format) >= 0 ? format : song.stream.audio.tags[0]; // if the prefered format is available, use, else use the available one
            var fileExtension = songFormat.split('_')[0];
            var fileTitle     = `${songNumber} - ${songArtist} - ${songTitle}`;
            var filePath      = path.join(folder, `${fileTitle}.${fileExtension}`);
        } catch(err) {
            console.error(chalk.red('Error downloading, when getting metadata:', JSON.stringify(err, null, 2)));

            return progress();
        }

        // check if it's necessary to fetch playable from Catalogue
        let getSong = song.origin.type === 'uploaded'
            ? Promise.resolve(song)
            : api.hydratePlayable(song.bbid, data.country) // catalogue playable, hydrate it
                .then(songs => songs[0]);

        return getSong.then(song => {
            // if song is not available to download for current subscription, skip it
            try {
                if (!song || !song.origin && song.availability_details.stream.indexOf(data.subscription) < 0) {
                    console.log(chalk.yellow(`${fileTitle} is not available for download`));

                    return progress();
                }
            } catch(err) {
                console.error(chalk.red('Error downloading, when analysing catalogue metadata:', JSON.stringify(err, null, 2)));

                return progress();
            }

            return mkdirp(folder)
            .then(() => {
                return new Promise((resolve, reject) => {
                    // get file
                    console.log(`Downloading ${filePath}`);
                    api.songStream(song.stream.audio.url, songFormat)
                    .on('error', reject)
                    // and write into disk
                    .pipe(fs.createWriteStream(filePath))
                    .on('error', reject)
                    .on('finish', () => {
                        progress();

                        return resolve();
                    });
                });
            });
        });
    }, { concurrency: downloadConcurrency });
})
.run({})
.catch(err => console.log(err));
