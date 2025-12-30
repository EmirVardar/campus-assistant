import { registerWebModule, NativeModule } from 'expo';

import { NativeAudioModuleEvents } from './NativeAudio.types';

class NativeAudioModule extends NativeModule<NativeAudioModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(NativeAudioModule, 'NativeAudioModule');
