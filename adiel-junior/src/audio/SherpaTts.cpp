// =============================================================================
//  Adiel Junior — SherpaTts (Windows, דורש sherpa-onnx-c-api)
// =============================================================================
#include "audio/SherpaTts.h"

#include <cstring>

#include "core/Logger.h"

#ifdef ADIEL_HAVE_SHERTA_TTS
#include <sherpa-onnx/c-api/c-api.h>

namespace aj {

SherpaTts::SherpaTts() = default;

SherpaTts::~SherpaTts() {
    if (m_tts) SherpaOnnxDestroyOfflineTts(static_cast<const SherpaOnnxOfflineTts*>(m_tts));
}

bool SherpaTts::init(const Config& cfg) {
    if (m_ready) return true;

    SherpaOnnxOfflineTtsConfig config;
    std::memset(&config, 0, sizeof(config));
    config.model.vits.model  = cfg.sherpaVitsModel.c_str();
    config.model.vits.tokens = cfg.sherpaVitsTokens.c_str();
    config.model.vits.lexicon = cfg.sherpaVitsLexicon.empty() ? nullptr : cfg.sherpaVitsLexicon.c_str();
    config.model.vits.data_dir = cfg.sherpaVitsDataDir.empty() ? nullptr : cfg.sherpaVitsDataDir.c_str();
    config.model.vits.noise_scale = 0.667f;
    config.model.vits.noise_scale_w = 0.8f;
    config.model.vits.length_scale = 1.0f;
    config.model.num_threads = 4;
    config.model.debug = 0;
    config.model.provider = "cpu"; // "cuda" — GPU אם רוצים
    config.max_num_sentences = 2;
    config.silence_scale = 1.0f;

    logInfo("SherpaTts: טוען קול %s ...", cfg.sherpaVitsModel.c_str());
    m_tts = SherpaOnnxCreateOfflineTts(&config);
    if (!m_tts) {
        logError("SherpaTts: כשל בטעינת המודל");
        return false;
    }
    m_sid = cfg.sherpaVitsSpeaker;
    m_speed = cfg.sherpaVitsSpeed;
    m_ready = true;
    logInfo("SherpaTts: קול טעון (sample rate %d)", SherpaOnnxOfflineTtsSampleRate(
                static_cast<const SherpaOnnxOfflineTts*>(m_tts)));
    return true;
}

std::vector<float> SherpaTts::synthesize(const std::string& text, int& outSampleRate) {
    if (!m_tts) return {};

    // API עדכני (GenerateWithConfig) — עם תמיכה ב-callback פרוגרס
    SherpaOnnxGenerationConfig genCfg{};
    std::memset(&genCfg, 0, sizeof(genCfg));
    genCfg.sid = m_sid;
    genCfg.speed = m_speed;
    genCfg.silence_scale = 0.5f;

    const SherpaOnnxGeneratedAudio* audio = SherpaOnnxOfflineTtsGenerateWithConfig(
        static_cast<const SherpaOnnxOfflineTts*>(m_tts), text.c_str(), &genCfg, nullptr, nullptr);
    if (!audio || !audio->samples || audio->n <= 0) {
        logWarn("SherpaTts: סינתוז נכשל עבור \"%s\"", text.c_str());
        return {};
    }
    outSampleRate = audio->sample_rate;
    std::vector<float> out(audio->samples, audio->samples + audio->n);
    SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio);
    return out;
}

} // namespace aj

#else // !ADIEL_HAVE_SHERTA_TTS

namespace aj {
SherpaTts::SherpaTts() = default;
SherpaTts::~SherpaTts() = default;
bool SherpaTts::init(const Config&) { return false; }
std::vector<float> SherpaTts::synthesize(const std::string&, int&) { return {}; }
} // namespace aj

#endif // ADIEL_HAVE_SHERTA_TTS
