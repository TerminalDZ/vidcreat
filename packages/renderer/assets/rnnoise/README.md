# RNNoise model for voice cleanup

`sh.rnnn` is the "somnolent-hogwash" model of rnnoise-nu by Gregor Richards, trained for speech in
noisy recordings (<https://github.com/GregorR/rnnoise-models>, file from
<https://github.com/richardpl/arnndn-models>). Its author states the trained models are not creative
work and not subject to copyright.

ReelForge passes it to ffmpeg's `arnndn` filter before loudness mastering when `audio.denoise: true`
(or `reelforge render --denoise`). SHA-256:
`70bb6685eb0c2a1d18e2918dca3fbfbd39317010b1802eb1b6ea73a92f3fdec0`.
