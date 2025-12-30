// Reexport the native module. On web, it will be resolved to NativeAudioModule.web.ts
// and on native platforms to NativeAudioModule.ts
export { default } from './NativeAudioModule';
export { default as NativeAudioView } from './NativeAudioView';
export * from  './NativeAudio.types';
