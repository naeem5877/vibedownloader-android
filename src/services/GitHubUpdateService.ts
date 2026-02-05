/**
 * GitHub Update Service - Premium update checking with proper version comparison
 */

// App version - KEEP IN SYNC WITH package.json
const APP_VERSION = '1.0.4';

const REPO_OWNER = 'naeem5877';
const REPO_NAME = 'vibedownloader-android';

interface GitHubRelease {
    tag_name: string;
    html_url: string;
    body: string;
    assets: {
        browser_download_url: string;
        name: string;
    }[];
}

export interface UpdateInfo {
    available: boolean;
    version: string;
    releaseUrl: string;
    downloadUrl?: string;
    features: string[];
}

/**
 * Compare two semver versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
const compareVersions = (v1: string, v2: string): number => {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;

        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }

    return 0;
};

/**
 * Extract clean feature list from GitHub release body
 * Strips markdown, HTML, and formats as readable lines
 */
const extractFeatures = (body: string): string[] => {
    if (!body) return [];

    const features: string[] = [];

    // Remove HTML tags
    let cleaned = body.replace(/<[^>]*>/g, '');

    // Remove markdown image syntax
    cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '');

    // Remove markdown links but keep text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove markdown headers
    cleaned = cleaned.replace(/^#+\s*/gm, '');

    // Remove bold/italic markers
    cleaned = cleaned.replace(/\*\*|__|\*|_/g, '');

    // Split by lines
    const lines = cleaned.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines & headers
        if (!trimmed || trimmed.startsWith('---') || trimmed.startsWith('Full Changelog')) {
            continue;
        }

        // Extract bullet points
        if (trimmed.startsWith('*') || trimmed.startsWith('-') || trimmed.startsWith('•')) {
            const content = trimmed.replace(/^[\*\-•]\s*/, '').trim();
            if (content && content.length > 3) {
                // Clean up any remaining formatting
                const clean = content
                    .replace(/`/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (clean) {
                    features.push(clean);
                }
            }
        }
    }

    return features.slice(0, 5); // Max 5 features
};

/**
 * Check for updates from GitHub releases
 */
export const checkForUpdates = async (): Promise<UpdateInfo> => {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
            {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                },
            }
        );

        if (!response.ok) {
            console.warn('GitHub API Error:', response.status);
            return { available: false, version: APP_VERSION, releaseUrl: '', features: [] };
        }

        const data: GitHubRelease = await response.json();
        const latestVersion = data.tag_name.replace(/^v/, '');

        // Compare versions - only show update if latest is NEWER
        const comparison = compareVersions(latestVersion, APP_VERSION);

        if (comparison > 0) {
            // Find APK asset for direct download
            const apkAsset = data.assets?.find(a =>
                a.name.endsWith('.apk') && a.name.includes('universal')
            ) || data.assets?.find(a => a.name.endsWith('.apk'));

            return {
                available: true,
                version: latestVersion,
                releaseUrl: data.html_url,
                downloadUrl: apkAsset?.browser_download_url,
                features: extractFeatures(data.body),
            };
        }

        return { available: false, version: APP_VERSION, releaseUrl: '', features: [] };
    } catch (error) {
        console.error('Update check failed:', error);
        return { available: false, version: APP_VERSION, releaseUrl: '', features: [] };
    }
};

/**
 * Get current app version
 */
export const getCurrentVersion = (): string => APP_VERSION;
