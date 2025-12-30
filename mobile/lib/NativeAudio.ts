import { EventEmitter, requireNativeModule } from 'expo-modules-core';

type NativeAudioModuleType = {
  configure?: (frameMs: number) => void | Promise<void>;
  requestPermission: () => Promise<boolean>;
  start: () => Promise<boolean>;
  stop?: () => void;

  // ✅ new
  analyzeFile: (uri: string, frameMs: number) => Promise<number[]>;
};

const NativeAudio = requireNativeModule('NativeAudio') as NativeAudioModuleType;
export const NativeAudioEmitter = new EventEmitter(NativeAudio as any);

export default NativeAudio;
