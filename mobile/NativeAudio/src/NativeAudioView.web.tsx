import * as React from 'react';

import { NativeAudioViewProps } from './NativeAudio.types';

export default function NativeAudioView(props: NativeAudioViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
