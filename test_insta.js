import { igApi } from 'insta-fetcher';
import fs from 'fs';

async function test() {
    try {
        const cookieText = fs.readFileSync('C:\\Users\\Naeem\\AppData\\Roaming\\vibe-downloader\\cookies\\cookies_instagram.txt', 'utf8');
        let sessionid = '';
        for (const line of cookieText.split('\n')) {
            if (line.includes('sessionid')) {
                const parts = line.split('\t');
                sessionid = `sessionid=${parts[6].trim()}`;
                break;
            }
        }
        const ig = new igApi(sessionid);
        const stories = await ig.fetchStories('taimaa.homs');
        console.log(JSON.stringify(stories.stories, null, 2));
    } catch (e) {
        console.error(e);
    }
}
test();
