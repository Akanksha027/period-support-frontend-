import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';

/**
 * Hook to warm up the browser for OAuth flows
 * This improves the user experience by pre-loading the browser session
 */
export function useWarmUpBrowser() {
  useEffect(() => {
    // Warm up the browser on mount
    void WebBrowser.warmUpAsync();
    
    // Cleanup: cool down the browser when component unmounts
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

