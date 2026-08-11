// =============================================================================
//  Adiel Junior — Config
//  טוען את config/adieljunior.json ומספק גישה מוקלדת לכל ההגדרות.
// =============================================================================
#pragma once

#include <string>

#include "core/Json.h"

namespace aj {

struct Hotkeys {
    int listen = 0x4C; // L
    int dock    = 0x44; // D
    int center  = 0x43; // C
    int hide    = 0x48; // H
    int quit    = 0x51; // Q
    int screen  = 0x53; // S
    bool modifierCtrl = true;
    bool modifierAlt  = true;
};

struct Config {
    // ---- כללי
    std::string language = "he";

    // ---- AI Core (llama.cpp)
    std::string modelPath = "models/AdielJunior-3B-Q4_K_M.gguf"; // המודל שלנו
    int  gpuLayers        = -1;        // -1 = כל השכבות ב-VRAM
    int  nCtx             = 4096;
    int  nThreads         = 0;         // 0 = אוטומטי
    int  maxTokens        = 512;
    float temperature     = 0.7f;
    float topP            = 0.9f;
    float minP            = 0.05f;
    int  historyLimit     = 10;        // מספר הודעות עבר לשמירה
    bool useMmap          = true;
    bool useMlock         = false;
    std::string engine    = "llama";   // "llama" | "stub"

    // ---- Vision (DXGI)
    bool visionEnabled    = true;
    int  captureFps       = 30;
    double changeThreshold = 0.02;     // יחס שינוי מינימלי לפריים "מעניין"
    bool ocrEnabled       = true;
    bool gdiFallback      = true;      // נפילה ל-GDI BitBlt אם DXGI נכשל

    // ---- Wake Word
    std::string wakeEngine    = "porcupine"; // "porcupine" | "sherpa" | "stub"
    std::string wakeKeyword   = "אדיאל ג'וניור";
    std::string porcupineParams = "models/porcupine/porcupine_params.pv";
    std::string porcupineKeyword = "models/porcupine/אדיאל-ג'וניור_windows_v3_0_0.ppn";
    float       wakeSensitivity = 0.6f;
    std::string sherpaModelDir  = "models/sherpa/kws";
    std::string micDeviceId     = "";  // ריק = מכשיר ברירת המחדל

    // ---- STT (whisper.cpp)
    std::string sttEngine   = "whisper";
    std::string whisperModel = "models/whisper/ggml-small-he.bin";
    int  whisperThreads     = 4;
    bool whisperUseGpu      = true;
    double silenceTimeoutMs = 900.0;   // שתיקה שמסיימת הקלטת פקודה

    // ---- TTS
    std::string ttsEngine   = "sherpa"; // "sherpa" | "piper" | "stub"
    std::string sherpaVitsModel = "models/sherpa/vits-hebrew.onnx";
    std::string sherpaVitsTokens = "models/sherpa/tokens.txt";
    std::string sherpaVitsLexicon = "";
    std::string sherpaVitsDataDir = "models/sherpa/espeak-ng-data";
    int         sherpaVitsSpeaker = 0;
    float       sherpaVitsSpeed   = 1.0f;
    std::string piperVoiceModel  = "models/piper/he_IL-haim-medium.onnx";
    std::string piperVoiceConfig = "models/piper/he_IL-haim-medium.onnx.json";
    std::string piperEspeakData  = "models/piper/espeak-ng-data";
    float       ttsVolume        = 1.0f;

    // ---- HUD
    bool   hudEnabled  = true;
    std::string hudMode = "center";    // "center" | "docked" | "hidden"
    float  hudOpacity  = 0.92f;
    int    hudWidth    = 620;
    int    hudHeight   = 400;
    bool   hudClickThrough = true;     // דוקר = שקוף ללחיצות
    std::string hudFont = "Segoe UI";

    // ---- זיכרון ואיסוף נתונים
    std::string historyFile = "data/history.json";   // זיכרון מתמשך
    std::string rawDataDir  = "data/raw";            // שיחות לקורפוס האימון
    bool dataCollection = true;                      // שמירת שיחות אמיתיות לקורפוס

    // ---- אחר
    bool hotkeysEnabled = true;
    bool trayEnabled = true;                         // מגש מערכת
    bool logToFile      = true;
    std::string logFile = "logs/adieljunior.log";
    bool startMinimized = false;

    // טעינה מקובץ JSON
    static Config load(const std::string& path, std::string* errMsg = nullptr);
    // יצירת קובץ ברירת מחדל
    static void writeDefault(const std::string& path);

    Hotkeys hotkeys;
};

} // namespace aj
