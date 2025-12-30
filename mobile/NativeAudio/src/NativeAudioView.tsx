import { requireNativeView } from 'expo';
import * as React from 'react';

import { NativeAudioViewProps } from './NativeAudio.types';

const NativeView: React.ComponentType<NativeAudioViewProps> =
  requireNativeView('NativeAudio');

export default function NativeAudioView(props: NativeAudioViewProps) {
  return <NativeView {...props} />;
}
