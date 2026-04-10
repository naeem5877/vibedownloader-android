const YTDlpWrap = require('yt-dlp-wrap').default;
const fs = require('fs');

async function test() {
    const ytDlpWrap = new YTDlpWrap();
    const args = [
        'https://www.instagram.com/stories/taimaa.homs/3859998701956215367/',
        '--cookies', 'C:\\Users\\Naeem\\AppData\\Roaming\\vibe-downloader\\cookies\\cookies_instagram.txt',
        '--dump-json',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ];
    try {
        console.log('Running yt-dlp...');
        const stdout = await ytDlpWrap.execPromise(args);
        console.log(stdout.substring(0, 500));
        fs.writeFileSync('D:\\vibe-dex\\test_out.json', stdout);
        console.log('Written to test_out.json');
    } catch (e) {
        console.error('Error:', e.message);
    }
}
test();
