import { Composition } from "remotion";

import { ClipComposition, defaultClipProps } from "./Composition";

export const RemotionRoot = () => {
  return (
    <Composition
      component={ClipComposition}
      defaultProps={defaultClipProps}
      durationInFrames={900}
      fps={30}
      height={1920}
      id="ClipSuggestion"
      width={1080}
    />
  );
};
