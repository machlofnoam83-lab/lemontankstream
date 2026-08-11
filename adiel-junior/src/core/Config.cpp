#include "core/Config.h"

#include <filesystem>

#include "core/Logger.h"

namespace aj {

namespace {
void readHotkey(const json::Value* hotkeys, const char* name, int& out) {
    if (!hotkeys) return;
    const json::Value* v = hotkeys->find(name);
    if (v && v->isNumber()) out = static_cast<int>(v->asInt(out));
}
} // namespace

Config Config::load(const std::string& path, std::string* errMsg) {
    Config cfg;
    std::string err;
    json::Value root = json::parseFile(path, &err);
    if (root.isNull()) {
        if (errMsg) *errMsg = "לא ניתן לטעון קונפיג: " + err;
        logWarn("Config: %s", err.c_str());
        return cfg;
    }

    cfg.language    = root.getString("language", cfg.language);

    if (const json::Value* ai = root.getObject("ai")) {
        cfg.modelPath   = ai->getString("model_path", cfg.modelPath);
        cfg.engine      = ai->getString("engine", cfg.engine);
        cfg.gpuLayers   = static_cast<int>(ai->getInt("gpu_layers", cfg.gpuLayers));
        cfg.nCtx        = static_cast<int>(ai->getInt("n_ctx", cfg.nCtx));
        cfg.nThreads    = static_cast<int>(ai->getInt("n_threads", cfg.nThreads));
        cfg.maxTokens   = static_cast<int>(ai->getInt("max_tokens", cfg.maxTokens));
        cfg.temperature = static_cast<float>(ai->getNumber("temperature", cfg.temperature));
        cfg.topP        = static_cast<float>(ai->getNumber("top_p", cfg.topP));
        cfg.minP        = static_cast<float>(ai->getNumber("min_p", cfg.minP));
        cfg.historyLimit = static_cast<int>(ai->getInt("history_limit", cfg.historyLimit));
        cfg.useMmap     = ai->getBool("use_mmap", cfg.useMmap);
        cfg.useMlock    = ai->getBool("use_mlock", cfg.useMlock);
    }

    if (const json::Value* v = root.getObject("vision")) {
        cfg.visionEnabled   = v->getBool("enabled", cfg.visionEnabled);
        cfg.captureFps      = static_cast<int>(v->getInt("fps", cfg.captureFps));
        cfg.changeThreshold = v->getNumber("change_threshold", cfg.changeThreshold);
        cfg.ocrEnabled      = v->getBool("ocr", cfg.ocrEnabled);
        cfg.gdiFallback     = v->getBool("gdi_fallback", cfg.gdiFallback);
    }

    if (const json::Value* v = root.getObject("wake_word")) {
        cfg.wakeEngine        = v->getString("engine", cfg.wakeEngine);
        cfg.wakeKeyword       = v->getString("keyword", cfg.wakeKeyword);
        cfg.porcupineParams   = v->getString("porcupine_params", cfg.porcupineParams);
        cfg.porcupineKeyword  = v->getString("porcupine_keyword_model", cfg.porcupineKeyword);
        cfg.wakeSensitivity   = static_cast<float>(v->getNumber("sensitivity", cfg.wakeSensitivity));
        cfg.sherpaModelDir    = v->getString("sherpa_model_dir", cfg.sherpaModelDir);
        cfg.micDeviceId       = v->getString("mic_device_id", cfg.micDeviceId);
    }

    if (const json::Value* v = root.getObject("stt")) {
        cfg.sttEngine    = v->getString("engine", cfg.sttEngine);
        cfg.whisperModel = v->getString("whisper_model", cfg.whisperModel);
        cfg.whisperThreads = static_cast<int>(v->getInt("whisper_threads", cfg.whisperThreads));
        cfg.whisperUseGpu = v->getBool("whisper_use_gpu", cfg.whisperUseGpu);
        cfg.silenceTimeoutMs = v->getNumber("silence_timeout_ms", cfg.silenceTimeoutMs);
    }

    if (const json::Value* v = root.getObject("tts")) {
        cfg.ttsEngine         = v->getString("engine", cfg.ttsEngine);
        cfg.sherpaVitsModel   = v->getString("sherpa_vits_model", cfg.sherpaVitsModel);
        cfg.sherpaVitsTokens  = v->getString("sherpa_vits_tokens", cfg.sherpaVitsTokens);
        cfg.sherpaVitsLexicon = v->getString("sherpa_vits_lexicon", cfg.sherpaVitsLexicon);
        cfg.sherpaVitsDataDir = v->getString("sherpa_vits_data_dir", cfg.sherpaVitsDataDir);
        cfg.sherpaVitsSpeaker = static_cast<int>(v->getInt("sherpa_vits_speaker", cfg.sherpaVitsSpeaker));
        cfg.sherpaVitsSpeed   = static_cast<float>(v->getNumber("sherpa_vits_speed", cfg.sherpaVitsSpeed));
        cfg.piperVoiceModel   = v->getString("piper_voice_model", cfg.piperVoiceModel);
        cfg.piperVoiceConfig  = v->getString("piper_voice_config", cfg.piperVoiceConfig);
        cfg.piperEspeakData   = v->getString("piper_espeak_data", cfg.piperEspeakData);
        cfg.ttsVolume         = static_cast<float>(v->getNumber("volume", cfg.ttsVolume));
    }

    if (const json::Value* v = root.getObject("hud")) {
        cfg.hudEnabled      = v->getBool("enabled", cfg.hudEnabled);
        cfg.hudMode         = v->getString("mode", cfg.hudMode);
        cfg.hudOpacity      = static_cast<float>(v->getNumber("opacity", cfg.hudOpacity));
        cfg.hudWidth        = static_cast<int>(v->getInt("width", cfg.hudWidth));
        cfg.hudHeight       = static_cast<int>(v->getInt("height", cfg.hudHeight));
        cfg.hudClickThrough = v->getBool("click_through", cfg.hudClickThrough);
        cfg.hudFont         = v->getString("font", cfg.hudFont);
    }

    if (const json::Value* v = root.getObject("general")) {
        cfg.hotkeysEnabled = v->getBool("hotkeys", cfg.hotkeysEnabled);
        cfg.logToFile      = v->getBool("log_to_file", cfg.logToFile);
        cfg.logFile        = v->getString("log_file", cfg.logFile);
        cfg.startMinimized = v->getBool("start_minimized", cfg.startMinimized);
        cfg.trayEnabled    = v->getBool("tray", cfg.trayEnabled);
        cfg.historyFile    = v->getString("history_file", cfg.historyFile);
        cfg.rawDataDir     = v->getString("raw_data_dir", cfg.rawDataDir);
        cfg.dataCollection = v->getBool("data_collection", cfg.dataCollection);
    }

    if (const json::Value* h = root.getObject("hotkeys")) {
        readHotkey(h, "listen", cfg.hotkeys.listen);
        readHotkey(h, "dock",   cfg.hotkeys.dock);
        readHotkey(h, "center", cfg.hotkeys.center);
        readHotkey(h, "hide",   cfg.hotkeys.hide);
        readHotkey(h, "quit",   cfg.hotkeys.quit);
        readHotkey(h, "screen", cfg.hotkeys.screen);
        cfg.hotkeys.modifierCtrl = h->getBool("mod_ctrl", cfg.hotkeys.modifierCtrl);
        cfg.hotkeys.modifierAlt  = h->getBool("mod_alt",  cfg.hotkeys.modifierAlt);
    }

    logInfo("Config: נטען בהצלחה (%s)", path.c_str());
    return cfg;
}

void Config::writeDefault(const std::string& path) {
    json::Value root;
    root["language"] = json::Value("he");

    json::Value ai;
    ai["model_path"] = json::Value("models/AdielJunior-3B-Q4_K_M.gguf");
    ai["engine"]     = json::Value("llama");
    ai["gpu_layers"] = json::Value(-1);
    ai["n_ctx"]      = json::Value(4096);
    ai["n_threads"]  = json::Value(0);
    ai["max_tokens"] = json::Value(512);
    ai["temperature"]= json::Value(0.7);
    ai["top_p"]      = json::Value(0.9);
    ai["min_p"]      = json::Value(0.05);
    ai["history_limit"] = json::Value(10);
    ai["use_mmap"]   = json::Value(true);
    ai["use_mlock"]  = json::Value(false);
    root["ai"] = ai;

    json::Value vision;
    vision["enabled"]          = json::Value(true);
    vision["fps"]              = json::Value(30);
    vision["change_threshold"] = json::Value(0.02);
    vision["ocr"]              = json::Value(true);
    vision["gdi_fallback"]     = json::Value(true);
    root["vision"] = vision;

    json::Value wake;
    wake["engine"]                = json::Value("porcupine");
    wake["keyword"]               = json::Value("אדיאל ג'וניור");
    wake["porcupine_params"]      = json::Value("models/porcupine/porcupine_params.pv");
    wake["porcupine_keyword_model"] = json::Value("models/porcupine/אדיאל-ג'וניור_windows_v3_0_0.ppn");
    wake["sensitivity"]           = json::Value(0.6);
    wake["sherpa_model_dir"]      = json::Value("models/sherpa/kws");
    wake["mic_device_id"]         = json::Value("");
    root["wake_word"] = wake;

    json::Value stt;
    stt["engine"]             = json::Value("whisper");
    stt["whisper_model"]      = json::Value("models/whisper/ggml-small-he.bin");
    stt["whisper_threads"]    = json::Value(4);
    stt["whisper_use_gpu"]    = json::Value(true);
    stt["silence_timeout_ms"] = json::Value(900.0);
    root["stt"] = stt;

    json::Value tts;
    tts["engine"]               = json::Value("sherpa");
    tts["sherpa_vits_model"]    = json::Value("models/sherpa/vits-hebrew.onnx");
    tts["sherpa_vits_tokens"]   = json::Value("models/sherpa/tokens.txt");
    tts["sherpa_vits_lexicon"]  = json::Value("");
    tts["sherpa_vits_data_dir"] = json::Value("models/sherpa/espeak-ng-data");
    tts["sherpa_vits_speaker"]  = json::Value(0);
    tts["sherpa_vits_speed"]    = json::Value(1.0);
    tts["piper_voice_model"]    = json::Value("models/piper/he_IL-haim-medium.onnx");
    tts["piper_voice_config"]   = json::Value("models/piper/he_IL-haim-medium.onnx.json");
    tts["volume"]               = json::Value(1.0);
    root["tts"] = tts;

    json::Value hud;
    hud["enabled"]       = json::Value(true);
    hud["mode"]          = json::Value("center");
    hud["opacity"]       = json::Value(0.92);
    hud["width"]         = json::Value(620);
    hud["height"]        = json::Value(400);
    hud["click_through"] = json::Value(true);
    hud["font"]          = json::Value("Segoe UI");
    root["hud"] = hud;

    json::Value general;
    general["hotkeys"]         = json::Value(true);
    general["log_to_file"]     = json::Value(true);
    general["log_file"]        = json::Value("logs/adieljunior.log");
    general["start_minimized"] = json::Value(false);
    general["tray"]            = json::Value(true);
    general["history_file"]    = json::Value("data/history.json");
    general["raw_data_dir"]    = json::Value("data/raw");
    general["data_collection"] = json::Value(true);
    root["general"] = general;

    json::Value hotkeys;
    hotkeys["listen"]  = json::Value(0x4C);
    hotkeys["dock"]    = json::Value(0x44);
    hotkeys["center"]  = json::Value(0x43);
    hotkeys["hide"]    = json::Value(0x48);
    hotkeys["quit"]    = json::Value(0x51);
    hotkeys["screen"]  = json::Value(0x53);
    hotkeys["mod_ctrl"]= json::Value(true);
    hotkeys["mod_alt"] = json::Value(true);
    root["hotkeys"] = hotkeys;

    // יצירת תיקיית ההורה אם חסרה (autofix)
    try {
        std::filesystem::path p(path);
        if (p.has_parent_path()) {
            std::filesystem::create_directories(p.parent_path());
        }
    } catch (...) {}

    json::writeFile(path, root, true);
    logInfo("Config: נכתב קובץ ברירת מחדל %s", path.c_str());
}

} // namespace aj
