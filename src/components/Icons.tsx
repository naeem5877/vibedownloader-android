/**
 * Platform Icons - SVG icons for supported platforms
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, G, Circle, Rect } from 'react-native-svg';
import { Colors } from '../theme';

interface IconProps {
    size?: number;
    color?: string;
}

export const YouTubeIcon: React.FC<IconProps> = ({ size = 24, color = Colors.youtube }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
            fill={color}
        />
    </Svg>
);

export const InstagramIcon: React.FC<IconProps> = ({ size = 24, color = Colors.instagram }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"
            fill={color}
        />
    </Svg>
);

export const TikTokIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textPrimary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"
            fill={color}
        />
    </Svg>
);

export const FacebookIcon: React.FC<IconProps> = ({ size = 24, color = Colors.facebook }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
            fill={color}
        />
    </Svg>
);

export const SpotifyIcon: React.FC<IconProps> = ({ size = 24, color = Colors.spotify }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
            fill={color}
        />
    </Svg>
);

export const XIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textPrimary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
            fill={color}
        />
    </Svg>
);

export const PinterestIcon: React.FC<IconProps> = ({ size = 24, color = Colors.pinterest }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"
            fill={color}
        />
    </Svg>
);

export const SoundCloudIcon: React.FC<IconProps> = ({ size = 24, color = Colors.soundcloud }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c0-.057-.045-.1-.09-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c0 .055.045.094.09.094s.089-.045.104-.104l.21-1.319-.21-1.334c0-.061-.044-.09-.09-.09m1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.12.119.12.061 0 .105-.061.121-.12l.254-2.474-.254-2.548c-.016-.06-.061-.12-.121-.12m.945-.089c-.075 0-.135.06-.15.135l-.193 2.64.21 2.544c.016.077.075.138.149.138.075 0 .135-.061.15-.15l.24-2.532-.24-2.623c0-.075-.06-.135-.135-.135m1.155.36c-.005-.09-.075-.149-.159-.149-.09 0-.158.06-.164.149l-.217 2.43.2 2.563c0 .09.075.157.159.157.074 0 .148-.068.148-.158l.227-2.563-.227-2.444m.809-1.709c-.101 0-.18.09-.18.181l-.21 3.957.187 2.563c0 .09.08.164.18.164.094 0 .174-.09.18-.18l.209-2.563-.209-3.972c-.008-.104-.088-.18-.18-.18m.959-.914c-.105 0-.195.09-.203.194l-.18 4.872.165 2.548c0 .12.09.209.195.209.104 0 .194-.089.21-.209l.193-2.548-.192-4.856c-.016-.12-.105-.21-.21-.21m.989-.449c-.121 0-.211.089-.225.209l-.165 5.275.165 2.52c.014.119.104.225.225.225.119 0 .225-.105.225-.225l.195-2.52-.18-5.275c0-.12-.105-.209-.225-.209m1.245.045c0-.135-.105-.24-.24-.24-.116 0-.24.105-.24.24l-.149 5.441.149 2.503c.016.135.12.24.256.24s.24-.105.254-.24l.166-2.503-.18-5.456m.705-.463c-.136 0-.256.12-.271.256l-.106 5.873.136 2.49c0 .149.12.27.271.27.135 0 .255-.12.27-.27l.151-2.49-.135-5.873c0-.136-.135-.256-.271-.256m1.02-.464c-.15 0-.271.12-.285.271l-.091 6.322.105 2.46c.015.15.135.271.271.271.149 0 .271-.12.3-.271l.105-2.46-.12-6.322c0-.15-.135-.271-.285-.271m1.064-.195c-.164 0-.299.135-.315.285l-.074 6.501.09 2.445c.016.165.15.299.299.299.165 0 .3-.135.315-.299l.09-2.445-.105-6.501c0-.15-.135-.285-.3-.285m.926 1.083c-.165 0-.3.135-.3.3l-.06 5.403.06 2.385c.015.165.135.3.3.3.164 0 .3-.135.3-.3l.076-2.385-.076-5.403c0-.165-.15-.3-.3-.3m1.065-.165c-.18 0-.315.135-.315.315l-.06 5.253.06 2.37c0 .18.135.315.315.315.165 0 .315-.135.315-.315l.075-2.37-.075-5.253c0-.18-.15-.315-.315-.315m1.035-.015c-.18 0-.33.15-.33.33l-.045 5.25.045 2.34c.015.18.15.33.33.33.18 0 .33-.15.33-.33l.046-2.34-.046-5.25c0-.18-.15-.33-.33-.33m1.095.24c-.195 0-.345.15-.345.345l-.03 4.635.03 2.34c0 .195.15.345.345.345.194 0 .344-.15.344-.345l.03-2.34-.045-4.635c0-.195-.149-.345-.344-.345m.976-.93c-.195 0-.36.165-.36.36l-.015 5.205.015 2.31c.015.195.165.36.36.36.18 0 .345-.165.36-.36l.015-2.31-.03-5.205c0-.195-.164-.36-.345-.36m12.48 2.055c-.393 0-.78.074-1.125.209-.18-2.1-1.95-3.75-4.11-3.75-.54 0-1.065.105-1.53.284-.18.076-.24.15-.24.3v7.396c0 .164.12.3.285.314h6.72c1.275 0 2.31-1.035 2.31-2.311 0-1.275-1.035-2.324-2.31-2.324"
            fill={color}
        />
    </Svg>
);

// Common icons
export const SearchIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textSecondary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const ClipboardIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textSecondary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const DownloadIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textPrimary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const PlayIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textPrimary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M5 3l14 9-14 9V3z"
            fill={color}
        />
    </Svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textSecondary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M6 18L18 6M6 6l12 12"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textSecondary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M9 18l6-6-6-6"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textSecondary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
    </Svg>
);

export const FolderIcon: React.FC<IconProps> = ({ size = 24, color = Colors.textSecondary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

const styles = StyleSheet.create({});

export default {
    YouTubeIcon,
    InstagramIcon,
    TikTokIcon,
    FacebookIcon,
    SpotifyIcon,
    XIcon,
    PinterestIcon,
    SoundCloudIcon,
    SearchIcon,
    ClipboardIcon,
    DownloadIcon,
    PlayIcon,
    CloseIcon,
    ChevronRightIcon,
    SettingsIcon,
    FolderIcon,
};
