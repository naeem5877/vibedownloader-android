const spotifyUrlInfo = require('spotify-url-info')(fetch);

async function run() {
    try {
        const url = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
        console.log('Fetching details...');
        const res = await spotifyUrlInfo.getDetails(url);
        console.log('Details:', JSON.stringify(res, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
