import { Linking, Alert } from 'react-native';

const REPO_OWNER = 'naeem5877';
const REPO_NAME = 'vibedownloader-android';
const CURRENT_VERSION = '1.0.0'; // Sync with package.json

interface GitHubRelease {
    tag_name: string;
    html_url: string;
    body: string;
    assets: {
        browser_download_url: string;
        name: string;
    }[];
}

export const checkForUpdates = async (silent = false) => {
    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);

        if (response.status === 404) {
            if (!silent) Alert.alert('Info', 'No releases found yet.');
            return;
        }

        if (!response.ok) {
            console.warn('GitHub API Error:', response.status);
            return;
        }

        const data: GitHubRelease = await response.json();
        const latestVersion = data.tag_name.replace(/^v/, '');

        // Simple string comparison for now, assuming strictly increasing version numbers
        // In production, use a semver library comparison
        if (latestVersion !== CURRENT_VERSION && data.tag_name) {
            Alert.alert(
                'Update Available 🚀',
                `Version ${data.tag_name} is available!\n\n${data.body || 'New features and bug fixes.'}`,
                [
                    { text: 'Later', style: 'cancel' },
                    {
                        text: 'Update Now',
                        style: 'default',
                        onPress: () => {
                            // Prefer .apk asset, fallback to release page
                            const apkAsset = data.assets?.find(a => a.name.endsWith('.apk'));
                            const url = apkAsset ? apkAsset.browser_download_url : data.html_url;
                            Linking.openURL(url);
                        }
                    }
                ]
            );
        } else {
            if (!silent) Alert.alert('Up to Date', `You are running the latest version (${CURRENT_VERSION}).`);
        }
    } catch (error) {
        console.error('Update check failed', error);
        if (!silent) Alert.alert('Error', 'Failed to check for updates. Please check your internet connection.');
    }
};
