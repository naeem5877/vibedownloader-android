import fs from 'fs';

async function test() {
    try {
        const url = 'https://www.facebook.com/stories/2761062190872633/UzpfSVNDOjE5NjczNTE0NTA4NzE4MzI=/?bucket_count=9&source=story_tray';
        console.log('Testing FB URL:', url);

        // Read cookies
        const cookieText = fs.readFileSync('C:\\Users\\Naeem\\AppData\\Roaming\\vibe-downloader\\cookies\\cookies_facebook.txt', 'utf8');
        let cookieHeaders = [];
        for (const line of cookieText.split('\n')) {
            if (!line.startsWith('#') && line.trim()) {
                const parts = line.split('\t');
                if (parts.length >= 7) {
                    cookieHeaders.push(`${parts[5].trim()}=${parts[6].trim()}`);
                }
            }
        }
        const cookieString = cookieHeaders.join('; ');
        console.log('Cookie String length:', cookieString.length);

        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Cookie': cookieString,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });
        
        console.log("Status:", resp.status);
        const html = await resp.text();
        console.log("HTML length:", html.length);

        // Regex to find playable_url inside the JSON string
        const jsonMatch = html.match(/"browser_native_sd_url":\s*"([^"]+)"/);
        const hdMatch = html.match(/"browser_native_hd_url":\s*"([^"]+)"/);
        // Another common fb story pattern
        const playableMatch = html.match(/"playable_url":\s*"([^"]+)"/);
        const hdPlayableMatch = html.match(/"playable_url_quality_hd":\s*"([^"]+)"/);
        
        console.log("Found HD:", !!hdMatch, !!hdPlayableMatch);
        console.log("Found SD:", !!jsonMatch, !!playableMatch);

        if (hdMatch) console.log("HD URL:", JSON.parse(`"${hdMatch[1]}"`).substring(0, 100));
        if (playableMatch) console.log("Playable URL:", JSON.parse(`"${playableMatch[1]}"`).substring(0, 100));

    } catch (e) {
        console.error('Error:', e);
    }
}
test();
