import { NativeModule, requireNativeModule } from 'expo';

import { NativeAudioModuleEvents } from './NativeAudio.types';

declare class NativeAudioModule extends NativeModule<NativeAudioModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<NativeAudioModule>('NativeAudio');
