# Optional speech-model runtime

This folder pins everything `reelforge align --setup` installs into the user cache. Nothing here is
used by the render engine.

- `package.json` + `package-lock.json`: the runtime (`@huggingface/transformers` and its dependencies,
  including `onnxruntime-node`), installed with `npm ci`, so every package version and integrity hash
  comes from the committed lockfile. Files for other platforms are removed after install.
- `models.json`: each model is pinned to a Hugging Face **commit** (`revision`) and every file to its
  **SHA-256**. ReelForge downloads the files itself, checks them before they are used, and loads them
  with transformers.js remote models disabled. A mismatch stops setup with an error and installs
  nothing.

Regenerate the pins with `node scripts/pin-assist-models.mjs` (only to move to newer model commits)
and review the diff before committing; `--readme` rebuilds this file only. `HF_ENDPOINT` points
downloads at a mirror.

| Model         | Repository @ revision                                     | File                                       | Size     | SHA-256                                                            |
| ------------- | --------------------------------------------------------- | ------------------------------------------ | -------- | ------------------------------------------------------------------ |
| whisper-tiny  | onnx-community/whisper-tiny_timestamped @ `517244293732`  | `config.json`                              | 2 KB     | `46aeea0a406afbeb563fc8e59ca10609203df4299af6a83f73752fef369efd2d` |
| whisper-tiny  | onnx-community/whisper-tiny_timestamped @ `517244293732`  | `generation_config.json`                   | 4 KB     | `f5c67e5a4f7102f8cb4d058bc95da276bbc19eeec997267c3bb0f25ef68facd1` |
| whisper-tiny  | onnx-community/whisper-tiny_timestamped @ `517244293732`  | `preprocessor_config.json`                 | 0 KB     | `a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d` |
| whisper-tiny  | onnx-community/whisper-tiny_timestamped @ `517244293732`  | `tokenizer.json`                           | 2.4 MB   | `27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566` |
| whisper-tiny  | onnx-community/whisper-tiny_timestamped @ `517244293732`  | `tokenizer_config.json`                    | 276 KB   | `2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce` |
| whisper-tiny  | onnx-community/whisper-tiny_timestamped @ `517244293732`  | `onnx/encoder_model_quantized.onnx`        | 9.6 MB   | `d4397fbfed1975bb5dd1bedb748808367331c85293f54cbc927774728daec2b2` |
| whisper-tiny  | onnx-community/whisper-tiny_timestamped @ `517244293732`  | `onnx/decoder_model_merged_quantized.onnx` | 29.3 MB  | `ced2053c1aa8ff7048927197416a5c169f50010e7b280e5d564b46a991fca011` |
| whisper-base  | onnx-community/whisper-base_timestamped @ `608c49e61301`  | `config.json`                              | 2 KB     | `f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b` |
| whisper-base  | onnx-community/whisper-base_timestamped @ `608c49e61301`  | `generation_config.json`                   | 4 KB     | `61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0` |
| whisper-base  | onnx-community/whisper-base_timestamped @ `608c49e61301`  | `preprocessor_config.json`                 | 0 KB     | `a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d` |
| whisper-base  | onnx-community/whisper-base_timestamped @ `608c49e61301`  | `tokenizer.json`                           | 2.4 MB   | `27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566` |
| whisper-base  | onnx-community/whisper-base_timestamped @ `608c49e61301`  | `tokenizer_config.json`                    | 276 KB   | `2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573` |
| whisper-base  | onnx-community/whisper-base_timestamped @ `608c49e61301`  | `onnx/encoder_model_quantized.onnx`        | 22.1 MB  | `2714484ebe1bae7c1646e8eadb768bb9d415cf11763466d21f23039a29c62e6f` |
| whisper-base  | onnx-community/whisper-base_timestamped @ `608c49e61301`  | `onnx/decoder_model_merged_quantized.onnx` | 51.2 MB  | `cf9a8d5bcddc0917a0078135b484cedcaf44f28909cd91910abd29dced9171db` |
| whisper-small | onnx-community/whisper-small_timestamped @ `65caa70f294b` | `config.json`                              | 2 KB     | `457854d452f17661e197d74aee12b8e74fb75ba30ebfaa7426d0d61ea1e08a18` |
| whisper-small | onnx-community/whisper-small_timestamped @ `65caa70f294b` | `generation_config.json`                   | 4 KB     | `f538b28220c6a6d6f1af1458d4141cacb4ef4963df3de98a19490440c412ddf0` |
| whisper-small | onnx-community/whisper-small_timestamped @ `65caa70f294b` | `preprocessor_config.json`                 | 0 KB     | `a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d` |
| whisper-small | onnx-community/whisper-small_timestamped @ `65caa70f294b` | `tokenizer.json`                           | 2.4 MB   | `27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566` |
| whisper-small | onnx-community/whisper-small_timestamped @ `65caa70f294b` | `tokenizer_config.json`                    | 276 KB   | `2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce` |
| whisper-small | onnx-community/whisper-small_timestamped @ `65caa70f294b` | `onnx/encoder_model_quantized.onnx`        | 88.0 MB  | `9f5635b596e6084045c7426ca6f6f99db8ce606ea895397c3b4a3c0aa3f9b070` |
| whisper-small | onnx-community/whisper-small_timestamped @ `65caa70f294b` | `onnx/decoder_model_merged_quantized.onnx` | 149.5 MB | `c831996a6d5a535cf17447b0d7ecc36da6b72696e6fb906852ba6136b9199abb` |
| silero-vad    | onnx-community/silero-vad @ `e71cae966052`                | `onnx/model.onnx`                          | 2.1 MB   | `a4a068cd6cf1ea8355b84327595838ca748ec29a25bc91fc82e6c299ccdc5808` |

Licenses: Whisper weights MIT (OpenAI), Silero VAD MIT (Silero Team), transformers.js Apache-2.0,
onnxruntime MIT. See THIRD-PARTY-NOTICES.md.
