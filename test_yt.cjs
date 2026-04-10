const { spawn } = require('child_process');

const args = [
    'https://www.instagram.com/stories/taimaa.homs/3859998701956215367/',
    '--cookies', 'C:\\Users\\Naeem\\AppData\\Roaming\\vibe-downloader\\cookies\\cookies_instagram.txt',
    '--dump-json'
];

const ytDlp = spawn('C:\\Users\\Naeem\\AppData\\Roaming\\vibe-downloader\\binaries\\yt-dlp.exe', args);

let out = '';
ytDlp.stdout.on('data', data => out += data.toString());
ytDlp.stderr.on('data', data => console.error(data.toString()));
ytDlp.on('close', code => {
    console.log(`Exit code: ${code}`);
    try {
        const parsed = JSON.parse(out);
        console.log(`Type: ${parsed._type}, id: ${parsed.id}`);
    } catch(e) {
        console.log("Not JSON:", out.substring(0, 100));
    }
});
