const koffi = require('koffi');
const path = require('path');

// Библиотека в корне
const lib = koffi.load(path.join(__dirname, '../libvosk.so'));

const vosk_model_new = lib.func('void *vosk_model_new(const char *model_path)');
const vosk_recognizer_new = lib.func('void *vosk_recognizer_new(void *model, float sample_rate)');
const vosk_recognizer_accept_waveform = lib.func('int vosk_recognizer_accept_waveform(void *r, const char *data, int length)');
const vosk_recognizer_result = lib.func('const char *vosk_recognizer_result(void *r)');
const vosk_recognizer_free = lib.func('void vosk_recognizer_free(void *r)');
const vosk_model_free = lib.func('void vosk_model_free(void *model)');
process.env.GLOG_minloglevel = '2';

class MyVosk {
  constructor() {
    const modelPath = path.join(__dirname, '../vosk');
    this.model = vosk_model_new(modelPath);

    if (!this.model) {
      throw new Error("Модель не загрузилась");
    }

    this.rec = vosk_recognizer_new(this.model, 16000.0);
  }

  recognize(buffer) {
    const data = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    if (vosk_recognizer_accept_waveform(this.rec, data, data.length)) {
      const result = vosk_recognizer_result(this.rec);
      return JSON.parse(result).text.trim();
    }
    return null;
  }

  destroy() {
    vosk_recognizer_free(this.rec);
    vosk_model_free(this.model);
  }
}

module.exports = MyVosk;