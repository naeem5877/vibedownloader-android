const YTDlpWrap = require('yt-dlp-wrap').default;
const fs = require('fs');

async function test() {
    const ytDlpWrap = new YTDlpWrap();
    const args = [
        'https://www.instagram.com/stories/taimaa.homs/',
        '--cookies', 'C:\\Users\\Naeem\\AppData\\Roaming\\vibe-downloader\\cookies\\cookies_instagram.txt',
        '--flat-playlist',
        '--dump-single-json',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ];
    try {
        console.log('Running yt-dlp...');
        const stdout = await ytDlpWrap.execPromise(args);
        console.log("length:", stdout.length);
        fs.writeFileSync('D:\\vibe-dex\\test_out2.json', stdout);
        const parsed = JSON.parse(stdout);
        console.log("type:", parsed._type, "entries length:", parsed.entries?.length);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
test();
