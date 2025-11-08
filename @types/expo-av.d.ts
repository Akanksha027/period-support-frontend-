declare module 'expo-av' {
  import * as React from 'react';
  import { ViewProps } from 'react-native';

  export interface AVPlaybackStatus {
    isLoaded?: boolean;
    [key: string]: any;
  }

  export interface VideoProps extends ViewProps {
    source: any;
    resizeMode?: any;
    useNativeControls?: boolean;
    shouldPlay?: boolean;
    isLooping?: boolean;
    onPlaybackStatusUpdate?: (status: AVPlaybackStatus) => void;
  }

  export class Video extends React.Component<VideoProps> {
    playAsync(): Promise<void>;
    pauseAsync(): Promise<void>;
    stopAsync(): Promise<void>;
  }
}

