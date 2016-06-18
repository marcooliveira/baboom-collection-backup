# BABOOM Collection Backup

This tool allows you to quickly backup all your collection into your computer.

## Installation

You will need [Node.js](https://nodejs.org) for this.

Just clone this repository and run `npm install`.

## Usage

Just run `npm start` inside the repository folder, and the script will ask for
your login credentials. The result of the backup will be inside a `songs/`
folder.

Also, you might want to tweak the configuration inside `index.js`:

```js
// <CONFIG>
const limitPerPage        = 100;
const downloadConcurrency = 10;
const format              = 'mp3_320k'; // available options are: flac, mp3_320k, mp3_192k, ogg_vorbis_q9, ogg_vorbis_q5, ogg_vorbis_q2
// </CONFIG>
```
