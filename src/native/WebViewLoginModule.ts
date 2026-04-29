import { NativeModules, NativeEventEmitter } from 'react-native';

export interface WebViewLoginResult {
    success: boolean;
    platform: string;
    cookieCount: number;
    cookiePath?: string;
}

export interface WebViewLoginModuleInterface {
    openLogin(platform: string): Promise<WebViewLoginResult>;
}

const { WebViewLoginModule } = NativeModules;

export const WebViewLoginNative: WebViewLoginModuleInterface = WebViewLoginModule;

export const webViewLoginEventEmitter = new NativeEventEmitter(WebViewLoginModule);
